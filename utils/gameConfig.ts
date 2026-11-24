import { getMapItemWithRevision, tryClaim, updateMapItemIfMatch } from "./sync";
import {
  CONFIG_VERSION,
  migrateConfig,
  type GameConfig,
  type GameConfigInput,
} from "./configSchema";

export type { GameConfig, GameConfigInput } from "./configSchema";
export type Prize = GameConfig["prizes"][number];
export type SolutionWord = GameConfig["solutionWords"][number];

const CONFIG_MAP = "game-config";
const CONFIG_KEY = "active";
const CACHE_TTL_MS = 10_000;

const DEFAULT_HINTS = [
  "The answer is a word related to communication or authentication.",
  "Think about Twilio products and features.",
  "Some answers are common communication methods.",
];

export const DEFAULT_CONFIG: GameConfig = {
  version: CONFIG_VERSION,
  mode: "device",
  puzzleEnabled: true,
  solutionWords: ["PHONE", "TEXTS", "AUTHY", "EMAIL", "CALLS", "ALERT", "CHATS", "DIALS", "RINGS", "PINGS", "REPLY", "INBOX"].map(
    (word) => ({ word, hints: [...DEFAULT_HINTS] })
  ),
  time: 120,
  attempts: 5,
  hintRevealEvery: 2,
  idleTimeoutSeconds: 60,
  vaultLedRoute: "server",
  prizes: [
    { name: "Twilio T-shirt", lockId: "SP3R11d53b7a" },
    { name: "Twilio Socks", lockId: "SP3R11fc4c46" },
  ],
  winnerPolicy: "oncePerDay",
  winnerResetAt: 0,
  defaultCountry: "US",
  commonCountries: ["US", "CA", "GB", "DE", "IN", "BR"],
};

let cache: { config: GameConfig; expiresAt: number } | null = null;

export async function getGameConfig(): Promise<GameConfig> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.config;
  }
  return loadGameConfig();
}

/** Reads Sync, bypassing the cache, and refreshes the cache with the result. */
async function loadGameConfig(retry = true): Promise<GameConfig> {
  let config: GameConfig;
  try {
    const stored = await getMapItemWithRevision(CONFIG_MAP, CONFIG_KEY);
    if (stored) {
      try {
        config = migrateConfig(stored.data, DEFAULT_CONFIG);
        // Persist the upgrade once so /admin and every instance see the same
        // shape, instead of re-migrating on every cache miss.
        // Best effort: if the write fails, keep serving the migrated config
        // and retry on the next cache miss. Conditional, so it can't undo an
        // admin save that landed in between.
        if ((stored.data as { version?: unknown }).version !== CONFIG_VERSION) {
          await updateMapItemIfMatch(CONFIG_MAP, CONFIG_KEY, config, stored.revision).catch((error) =>
            console.error("Could not persist migrated game config, will retry", error)
          );
        }
      } catch (error) {
        // Never overwrite a stored config we can't read -- an operator may
        // need to recover it by hand. Run on defaults until /admin saves.
        console.error("Stored game config is invalid, falling back to default", error);
        config = DEFAULT_CONFIG;
      }
    } else {
      config = DEFAULT_CONFIG;
      // Create-if-absent: never clobber a config another instance just
      // saved. If one did, serve that instead.
      if (!(await tryClaim(CONFIG_MAP, CONFIG_KEY, config)) && retry) return loadGameConfig(false);
    }
  } catch (error) {
    console.error("Error loading game config from Sync, falling back to default", error);
    config = DEFAULT_CONFIG;
  }

  cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

// Optimistic-write retries for an admin save racing a winner reset.
const MAX_WRITE_ATTEMPTS = 5;

/**
 * Read-modify-write against the stored config, retried if another instance
 * wrote in between (Sync If-Match), so an admin save and a winner reset can
 * never overwrite each other. A stored config we can't read is replaced, as
 * saving from /admin is how an operator recovers from one.
 */
async function updateGameConfig(change: (current: GameConfig) => GameConfig): Promise<GameConfig> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const stored = await getMapItemWithRevision(CONFIG_MAP, CONFIG_KEY);
    if (!stored) {
      // Nothing stored yet: create it, unless another instance beats us to it.
      const next = change(DEFAULT_CONFIG);
      if (await tryClaim(CONFIG_MAP, CONFIG_KEY, next)) {
        cache = { config: next, expiresAt: Date.now() + CACHE_TTL_MS };
        return next;
      }
      continue;
    }
    let current: GameConfig;
    try {
      current = migrateConfig(stored.data, DEFAULT_CONFIG);
    } catch {
      current = DEFAULT_CONFIG;
    }
    const next = change(current);
    if (await updateMapItemIfMatch(CONFIG_MAP, CONFIG_KEY, next, stored.revision)) {
      cache = { config: next, expiresAt: Date.now() + CACHE_TTL_MS };
      return next;
    }
  }
  throw new Error("Game config kept changing while saving; try again");
}

/**
 * Saves the admin form. Server-managed fields (version, winnerResetAt) are
 * taken from the current stored config, never from the client.
 */
export async function saveGameConfig(input: GameConfigInput): Promise<GameConfig> {
  return updateGameConfig((current) => ({ ...input, version: CONFIG_VERSION, winnerResetAt: current.winnerResetAt }));
}

/** Invalidates every existing winner cookie (regardless of policy) without touching the policy itself. */
export async function resetWinners(): Promise<GameConfig> {
  return updateGameConfig((current) => ({ ...current, winnerResetAt: Date.now() }));
}

/** Test-only: drop the in-memory cache between cases. */
export function clearGameConfigCache() {
  cache = null;
}
