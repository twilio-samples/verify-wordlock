import type { KioskSettings } from "./kiosk";
import { COLOR_FOR, createVaultLedQueue, REQUEST_TIMEOUT_MS, type VaultLed, type VaultLedState } from "./vaultLedQueue";

/**
 * The vault LED's browser route (#5): the kiosk tablet, on the venue LAN,
 * calls the Pi itself, for when the app server has no route to it. Same
 * requests, queue and retries as the server route (utils/vaultLed.ts).
 *
 * What the browser needs (see the README's Vault LED section):
 * - From an https:// page, Chrome 142+ lets a fetch to a private IP literal
 *   (http://192.168.0.48) through once the local network permission prompt
 *   is allowed. Older browsers block it as mixed content.
 * - To read the Pi's answer, the Pi must send CORS headers. Without them the
 *   request still reaches the Pi, but its answer can't be read, so it shows
 *   as "unconfirmed" and isn't retried.
 *
 * Requests are sent with keepalive, so one in flight still reaches the Pi when
 * the kiosk moves to another page. Retries don't survive a full page load, but
 * every load of the start screen sends red again.
 */
const NO_CORS =
  "the Pi answered, but without CORS headers the browser can't read whether it accepted";
const BLOCKED =
  "no answer: the Pi is unreachable, or the browser blocked the request (local network permission or mixed content)";

/**
 * Chrome's local network access: where the Pi is, for `targetAddressSpace`.
 * Declaring it exempts an http:// Pi from mixed-content blocking, but Chrome
 * fails the request if it's wrong, so only declare what the URL shows: a
 * loopback or private IP (or a .local name). Anything else (a tunnel's public
 * name) is left to Chrome. Other browsers ignore the option.
 */
export function addressSpace(url: string): "loopback" | "local" | undefined {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1" || /^127\./.test(host)) return "loopback";
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || host.endsWith(".local")) return "local";
  if (/^f[cd][0-9a-f]{2}:|^fe[89ab][0-9a-f]:/.test(host)) return "local";
  return undefined;
}

const init = (space: ReturnType<typeof addressSpace>, extra?: RequestInit) =>
  ({
    cache: "no-store",
    keepalive: true,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(space && { targetAddressSpace: space }),
    ...extra,
  }) as RequestInit;

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function createBrowserVaultLed(url: string): VaultLed {
  const target = url.replace(/\/$/, "");
  const space = addressSpace(target);
  return createVaultLedQueue(target, async (path) => {
    try {
      const response = await fetch(path, init(space));
      return response.ok ? null : { detail: `HTTP ${response.status}`, retry: true };
    } catch (error) {
      if (isTimeout(error)) throw error;
      // A CORS failure looks the same as no route at all. Ask again without
      // CORS: an (opaque) answer means the Pi is there but didn't allow CORS.
      // Its requests only set the light, so a second one is harmless.
    }
    await fetch(path, init(space, { mode: "no-cors" })).catch((error) => {
      throw isTimeout(error) ? error : new Error(BLOCKED);
    });
    return { detail: NO_CORS, retry: false };
  });
}

let led: VaultLed | null = null;

/** One queue per tab, so a quick red-then-green still goes out in order. */
export function browserVaultLed(url: string) {
  if (led?.target !== url.replace(/\/$/, "")) {
    led?.stop();
    led = createBrowserVaultLed(url);
  }
  return led;
}

/** Sets the vault LED from the kiosk browser, when the browser route is on (see kioskProps). */
export function setBrowserVaultLed(kiosk: KioskSettings | null, state: VaultLedState) {
  if (kiosk?.vaultLedUrl) browserVaultLed(kiosk.vaultLedUrl).set(COLOR_FOR[state]);
}
