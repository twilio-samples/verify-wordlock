// DEMO STAND-IN for utils/sync.ts (copied over it by scripts/demo/run.sh, never
// used by the real app): an in-memory Sync with the same API, including
// revisions (If-Match), create-if-absent claims and TTLs. Everything is lost
// when the demo server stops.
//
// Seeded from env: DEMO_MODE (kiosk | device), DEMO_PUZZLE (0 = 2FA-only),
// DEMO_IDLE (kiosk idle timeout, seconds), DEMO_STATS (1 = 60 sample sessions
// on /stats), DEMO_LED_ROUTE (server | browser) and DEMO_LED_BROWSER_URL (the
// vault LED's Pi as the browser sees it).

type Item = { data: any; revision: number; expiresAt?: number };

const g = globalThis as typeof globalThis & { __demoSync?: Map<string, Item> };
const store = (g.__demoSync ??= seed());

function seed() {
  const items = new Map<string, Item>();
  const mode = process.env.DEMO_MODE === "device" ? "device" : "kiosk";
  items.set("game-config/active", {
    revision: 1,
    data: {
      version: 5,
      mode,
      puzzleEnabled: process.env.DEMO_PUZZLE !== "0",
      solutionWords: [{ word: "PHONE", hints: ["It rings", "It has a screen", "Starts with P"] }],
      time: 120,
      attempts: 5,
      hintRevealEvery: 1,
      idleTimeoutSeconds: Math.max(15, Number(process.env.DEMO_IDLE) || 60),
      vaultLockId: "DEMO-VAULT",
      vaultLedRoute: process.env.DEMO_LED_ROUTE === "browser" ? "browser" : "server",
      ...(process.env.DEMO_LED_BROWSER_URL && { vaultLedBrowserUrl: process.env.DEMO_LED_BROWSER_URL }),
      prizes: [
        { name: "Twilio Socks", lockId: "DEMO-BOX-1" },
        { name: "Twilio T-shirt", lockId: "DEMO-BOX-2" },
      ],
      winnerPolicy: "infinite",
      winnerResetAt: 0,
      defaultCountry: "US",
      commonCountries: ["US", "CA", "GB", "DE", "IN", "BR"],
    },
  });
  // A valid Igloo token, so the start screen never tries to refresh one.
  items.set("igloo-auth/token", { revision: 1, data: { accessToken: "demo", expiresAt: Date.now() + 365 * 864e5 } });
  if (process.env.DEMO_STATS === "1") seedStats(items);
  return items;
}

// 60 sessions over a morning: a spread of channels, calling codes, solves,
// timeouts, unsolved puzzles and kiosk walk-aways, so every /stats section
// has something in it.
function seedStats(items: Map<string, Item>) {
  const start = Date.now() - 7 * 3600_000;
  const codes = ["+49", "+49", "+1", "+1", "+1", "+44", "+33", "+91", "+34", "+31"];
  const channels = ["sms", "sms", "whatsapp", "call"];
  for (let i = 0; i < 60; i++) {
    const at = start + (i % 7) * 3600_000 + i * 60_000;
    const session: Record<string, unknown> = { startedAt: at };
    if (i % 10 !== 9) Object.assign(session, { codeSentAt: at, channel: channels[i % 4], callingCode: codes[i % 10] });
    if (i % 10 < 8) session.verifiedAt = at;
    if (i % 10 < 5) {
      Object.assign(session, {
        solvedAt: at,
        boxOpenedAt: at,
        prize: ["Twilio Socks", "Twilio T-shirt"][i % 2],
        guesses: 1 + (i % 5),
        hintsRevealed: i % 3,
        solveMs: 15_000 + i * 1300,
      });
    }
    if (i % 10 === 5) Object.assign(session, { timedOutAt: at, unsolvedAt: at });
    if (i % 10 === 6) session.timedOutAt = at;
    if (i % 10 >= 6) session.idleResetAt = at;
    items.set(`game-funnel/demo-${i}`, { revision: 1, data: session });
  }
}

const id = (mapName: string, key: string) => `${mapName}/${key}`;
const copy = (value: any) => (value == null ? null : structuredClone(value));
const expiry = (ttlSeconds?: number) => (ttlSeconds === undefined ? undefined : Date.now() + ttlSeconds * 1000);

function live(itemId: string) {
  const item = store.get(itemId);
  if (item?.expiresAt !== undefined && item.expiresAt <= Date.now()) {
    store.delete(itemId);
    return undefined;
  }
  return item;
}

function inMap(mapName: string) {
  return [...store.keys()].filter((itemId) => itemId.startsWith(`${mapName}/`) && live(itemId));
}

export async function getMapItem(mapName: string, key: string): Promise<any> {
  return copy(live(id(mapName, key))?.data);
}

export async function getMapItemWithRevision(mapName: string, key: string): Promise<{ data: any; revision: string } | null> {
  const item = live(id(mapName, key));
  return item ? { data: copy(item.data), revision: String(item.revision) } : null;
}

export async function updateMapItemIfMatch(
  mapName: string,
  key: string,
  data: Record<string, unknown>,
  revision: string,
  ttlSeconds?: number
): Promise<boolean> {
  const item = live(id(mapName, key));
  if (!item || String(item.revision) !== revision) return false;
  store.set(id(mapName, key), { data: copy(data), revision: item.revision + 1, expiresAt: expiry(ttlSeconds) ?? item.expiresAt });
  return true;
}

export async function upsertMapItem(
  mapName: string,
  key: string,
  data: Record<string, unknown>,
  merge = false,
  ttlSeconds?: number
): Promise<any> {
  const item = live(id(mapName, key));
  const next = merge ? { ...item?.data, ...data } : data;
  store.set(id(mapName, key), { data: copy(next), revision: (item?.revision ?? 0) + 1, expiresAt: expiry(ttlSeconds) ?? item?.expiresAt });
  return { data: copy(next) };
}

export async function removeMapItem(mapName: string, key: string): Promise<void> {
  store.delete(id(mapName, key));
}

export async function tryClaim(mapName: string, key: string, data: Record<string, unknown>, ttlSeconds?: number): Promise<boolean> {
  if (live(id(mapName, key))) return false;
  store.set(id(mapName, key), { data: copy(data), revision: 1, expiresAt: expiry(ttlSeconds) });
  return true;
}

export async function listMapItems(mapName: string): Promise<any[]> {
  return inMap(mapName).map((itemId) => copy(store.get(itemId)?.data));
}

export async function clearMap(mapName: string): Promise<void> {
  for (const itemId of inMap(mapName)) store.delete(itemId);
}
