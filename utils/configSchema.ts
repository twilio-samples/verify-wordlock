import { isSupportedCountry } from "libphonenumber-js";
import { z } from "zod";

export const CONFIG_VERSION = 5;

export const WinnerPolicySchema = z.enum(["infinite", "oncePerDay", "lifetime"]);

export const ModeSchema = z.enum(["device", "kiosk"]);
export type Mode = z.infer<typeof ModeSchema>;

// How the vault LED's requests reach the Pi (#5): from the app server
// (PI_BASE_URL, needs a VPN or tunnel to the venue LAN) or from the kiosk
// tablet's browser, which sits on the Pi's LAN.
export const VaultLedRouteSchema = z.enum(["server", "browser"]);
export type VaultLedRoute = z.infer<typeof VaultLedRouteSchema>;

// The Pi's address as the kiosk browser sees it, e.g. http://192.168.0.48.
// No user:pass@: a browser can't send credentials to a server without CORS.
const PiUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
      } catch {
        return false;
      }
    },
    { message: "Use the Pi's http:// or https:// address without a user name or password, e.g. http://192.168.0.48" },
  );

export const PrizeSchema = z.object({
  name: z.string().trim().min(1),
  // Device mode: the lockbox this prize sits in (required there). Kiosk mode:
  // prizes are labels for what's inside the one vault, so no lock of their own.
  lockId: z.string().trim().min(1).optional(),
});

// Bounds of what the puzzle's tile row can lay out on a phone screen.
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 8;

// ISO 3166 alpha-2, e.g. "US". Upper-cased so "us" from a form still counts.
const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => isSupportedCountry(code), {
    error: (issue) => `"${String(issue.input)}" isn't a country code with phone numbers. Use two letters, e.g. US or DE.`,
  });

export const SolutionWordSchema = z.object({
  word: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]+$/, "Words may only contain letters A-Z")
    .min(MIN_WORD_LENGTH, `Words must be at least ${MIN_WORD_LENGTH} letters`)
    .max(MAX_WORD_LENGTH, `Words must be at most ${MAX_WORD_LENGTH} letters`),
  hints: z.array(z.string().trim().min(1)),
});

const fields = {
  mode: ModeSchema,
  // false = 2FA-only mode: the lock pops right after a successful Verify check.
  puzzleEnabled: z.boolean(),
  solutionWords: z.array(SolutionWordSchema),
  time: z.number().int().positive(),
  attempts: z.number().int().positive(),
  // Reveal one more hint for the active word every N wrong guesses.
  hintRevealEvery: z.number().int().positive(),
  // Kiosk only: seconds without interaction before the kiosk resets to start.
  idleTimeoutSeconds: z.number().int().min(15),
  // Kiosk only: the one physical vault's lock, opened on every win. Unset
  // when the vault has no smart lock: a win then only turns the LED green.
  vaultLockId: z.string().trim().min(1).optional(),
  // Kiosk only: see VaultLedRouteSchema. The browser URL may be set while the
  // route is "server", so the /admin panel can try both.
  vaultLedRoute: VaultLedRouteSchema,
  vaultLedBrowserUrl: PiUrlSchema.optional(),
  prizes: z.array(PrizeSchema),
  winnerPolicy: WinnerPolicySchema,
  // Phone field: the country it starts on, and the ones listed above A-Z.
  defaultCountry: CountryCodeSchema,
  commonCountries: z.array(CountryCodeSchema).max(10, "List at most 10 countries"),
};

type FieldsShape = z.infer<z.ZodObject<typeof fields>>;

function checkConfig(config: FieldsShape, ctx: z.RefinementCtx) {
  const { puzzleEnabled, solutionWords, mode, prizes, vaultLedRoute, vaultLedBrowserUrl } = config;
  if (puzzleEnabled && solutionWords.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["solutionWords"],
      message: "At least one solution word is required unless the puzzle is disabled (2FA-only mode)",
    });
  }
  const lengths = new Set(solutionWords.map((w) => w.word.length));
  if (lengths.size > 1) {
    ctx.addIssue({
      code: "custom",
      path: ["solutionWords"],
      message: "All solution words must be the same length",
    });
  }
  if (mode === "device") {
    if (prizes.length === 0) {
      ctx.addIssue({ code: "custom", path: ["prizes"], message: "Device mode needs at least one prize (one lockbox each)" });
    }
    prizes.forEach((prize, index) => {
      if (!prize.lockId) {
        ctx.addIssue({ code: "custom", path: ["prizes", index, "lockId"], message: "Device mode needs a lock ID for every prize" });
      }
    });
  }
  if (vaultLedRoute === "browser" && !vaultLedBrowserUrl) {
    ctx.addIssue({
      code: "custom",
      path: ["vaultLedBrowserUrl"],
      message: "Sending from the kiosk browser needs the Pi's address on the venue LAN",
    });
  }
}

/** What the admin form submits: everything except server-managed fields. */
export const GameConfigInputSchema = z.object(fields).superRefine(checkConfig);
export type GameConfigInput = z.infer<typeof GameConfigInputSchema>;

/** What is stored in Sync. */
export const GameConfigSchema = z
  .object({
    ...fields,
    version: z.literal(CONFIG_VERSION),
    // Epoch ms of the last "Reset winners" click. A winner cookie timestamped
    // at or before this no longer counts -- see hasAlreadyWon() in
    // utils/winnerPolicy.ts. Not part of the admin config form; only
    // resetWinners() in utils/gameConfig.ts ever changes it.
    winnerResetAt: z.number().nonnegative(),
  })
  .superRefine(checkConfig);
export type GameConfig = z.infer<typeof GameConfigSchema>;

type Stored = Record<string, unknown>;

/**
 * v1 (unversioned) configs stored a flat `words: string[]` plus one global
 * `hints: string[]`, and signalled 2FA-only mode with an empty word list.
 * Every word inherits the full global hint list, which keeps today's
 * behavior (a random hint from the global list, whatever the word).
 *
 * The v1 loader merged stored configs over its defaults, so fields added
 * after a config was saved (winnerPolicy, winnerResetAt) may be missing.
 * Fill every missing field from `defaults` the same way, rather than failing
 * validation and discarding the operator's words and prizes.
 *
 * The v1 validator only required time/attempts > 0, so fractional values may
 * be stored; round them up to the integers v2 requires.
 */
function migrateV1(stored: Stored, defaults: GameConfig): Stored {
  const { words, hints, ...rest } = stored;
  const wordList = Array.isArray(words)
    ? (words as unknown[]).map(String)
    : defaults.solutionWords.map((w) => w.word);
  const hintList = Array.isArray(hints)
    ? (hints as unknown[]).map(String)
    : (defaults.solutionWords[0]?.hints ?? []);
  const roundUp = (value: unknown) => (typeof value === "number" && value > 0 ? Math.ceil(value) : value);
  return {
    mode: defaults.mode,
    time: defaults.time,
    attempts: defaults.attempts,
    prizes: defaults.prizes,
    winnerPolicy: defaults.winnerPolicy,
    winnerResetAt: defaults.winnerResetAt,
    ...rest,
    ...("time" in rest && { time: roundUp(rest.time) }),
    ...("attempts" in rest && { attempts: roundUp(rest.attempts) }),
    version: 2,
    puzzleEnabled: wordList.length > 0,
    solutionWords: wordList.map((word) => ({ word, hints: [...hintList] })),
  };
}

/** v3 adds the hint-reveal threshold (#6) and kiosk idle timeout (#4). */
function migrateV2(stored: Stored, defaults: GameConfig): Stored {
  return {
    hintRevealEvery: defaults.hintRevealEvery,
    idleTimeoutSeconds: defaults.idleTimeoutSeconds,
    ...stored,
    version: 3,
  };
}

/** v4 adds the phone field's default and common countries. */
function migrateV3(stored: Stored, defaults: GameConfig): Stored {
  return {
    defaultCountry: defaults.defaultCountry,
    commonCountries: [...defaults.commonCountries],
    ...stored,
    version: 4,
  };
}

/** v5 adds the vault LED's route (#5); existing configs keep sending from the server. */
function migrateV4(stored: Stored, defaults: GameConfig): Stored {
  return { vaultLedRoute: defaults.vaultLedRoute, ...stored, version: 5 };
}

/**
 * Brings any stored config up to CONFIG_VERSION and validates it. Throws a
 * ZodError if the result is still invalid, so callers decide the fallback.
 */
export function migrateConfig(stored: unknown, defaults: GameConfig): GameConfig {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    throw new Error("Stored game config is not an object");
  }
  let config = stored as Stored;
  if (config.version === undefined) config = migrateV1(config, defaults);
  if (config.version === 2) config = migrateV2(config, defaults);
  if (config.version === 3) config = migrateV3(config, defaults);
  if (config.version === 4) config = migrateV4(config, defaults);
  return GameConfigSchema.parse(config);
}
