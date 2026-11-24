import type { GameConfig } from "./configSchema";
import { COLOR_FOR, createVaultLedQueue, REQUEST_TIMEOUT_MS, type VaultLed, type VaultLedState } from "./vaultLedQueue";

export * from "./vaultLedQueue";

/**
 * Vault LED (#5): the vendor's Raspberry Pi behind the vault light, driven by
 * plain HTTP GETs to PI_BASE_URL (the name from the vendor's doc).
 * Without the variable this is a no-op.
 *
 *   GET /setGreen   the player cracked the puzzle / opened the vault
 *   GET /setRed     a new player is starting
 *   GET /setOff     admin test panel only
 *
 * This is the server route: the app server sends the requests, so it needs a
 * route to the Pi (a VPN or a tunnel). The browser route, for a kiosk tablet
 * on the Pi's LAN, is utils/vaultLedBrowser.ts; the queue and retries
 * (utils/vaultLedQueue.ts) are shared.
 */

function createVaultLed(base: URL): VaultLed {
  // fetch() refuses URLs with credentials in them, so user:pass@ (e.g. for a
  // tunnel with Basic Auth in front of the Pi) moves into a header.
  const headers: Record<string, string> = {};
  if (base.username || base.password) {
    const credentials = `${decodeURIComponent(base.username)}:${decodeURIComponent(base.password)}`;
    headers.Authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
    base.username = base.password = "";
  }
  const target = base.origin + base.pathname.replace(/\/$/, "");

  return createVaultLedQueue(target, async (url) => {
    const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    // Drain the body so the connection is freed; its content isn't specified.
    await response.arrayBuffer().catch(() => undefined);
    return response.ok ? null : { detail: `HTTP ${response.status}`, retry: true };
  });
}

// On globalThis, not module scope: Next.js bundles instrumentation.ts and the
// pages separately, and both must share one queue.
const g = globalThis as typeof globalThis & { __vaultLed?: VaultLed | null };

function parseBase(url: string) {
  try {
    const base = new URL(url);
    // Decode now so a bad %-escape in user:pass@ disables the LED instead of throwing at startup.
    decodeURIComponent(base.username + base.password);
    return base.protocol === "http:" || base.protocol === "https:" ? base : null;
  } catch {
    return null;
  }
}

/** Reads the config once per process; later calls return the same client. Null when not configured. */
export function startVaultLed(url = process.env.PI_BASE_URL) {
  if (g.__vaultLed !== undefined) return g.__vaultLed;
  if (!url) return (g.__vaultLed = null);
  const base = parseBase(url);
  if (!base) {
    console.error("PI_BASE_URL must be an http:// or https:// URL, e.g. http://192.168.0.48; the vault LED is disabled");
    return (g.__vaultLed = null);
  }
  const led = createVaultLed(base);
  console.log(`Vault LED: sending to ${led.target}`);
  return (g.__vaultLed = led);
}

/** Stops retrying and forgets the client, so the next start reads the config again. */
export function stopVaultLed() {
  g.__vaultLed?.stop();
  delete g.__vaultLed;
}

/**
 * Sets the vault LED. Kiosk mode only: in device mode many players run at
 * once and there is no vault. Skipped when the kiosk browser sends instead
 * (utils/vaultLedBrowser.ts). Never throws or waits on the network, so it
 * can't hold up a player's request.
 */
export function setVaultLed(config: Pick<GameConfig, "mode" | "vaultLedRoute">, state: VaultLedState) {
  if (config.mode !== "kiosk") return;
  if (config.vaultLedRoute === "browser") return cancelVaultLedRetries(config);
  startVaultLed()?.set(COLOR_FOR[state]);
}

/**
 * Once the kiosk browser drives the LED, drops a color the server is still
 * retrying, so it can't land after the browser's newer one. Called on every
 * LED event and when the settings are saved.
 */
export function cancelVaultLedRetries(config: Pick<GameConfig, "vaultLedRoute">) {
  if (config.vaultLedRoute === "browser") g.__vaultLed?.cancel();
}
