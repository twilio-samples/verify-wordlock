/**
 * The vault LED's request queue, shared by both routes to the Pi: the app
 * server (utils/vaultLed.ts) and the kiosk browser (utils/vaultLedBrowser.ts).
 *
 * The Pi has no status endpoint and its replies carry no body we rely on, so
 * a 2xx means "the Pi accepted it", not "the light is green". Anything else
 * (an error status, a timeout, no route) leaves the state "unconfirmed": a
 * timed-out request may still have switched the light.
 *
 * Requests go out one at a time, so a quick red-then-green can't reach the Pi
 * out of order. Only the latest wanted color matters: a newer one replaces a
 * queued one, and an unconfirmed one is retried with backoff until it gets
 * through or a newer color replaces it, so the light catches up once the Pi
 * or the network is back.
 */
export type VaultLedState = "solved" | "reset";
export type VaultLedColor = "off" | "green" | "red";

export const VAULT_LED_COLORS: readonly VaultLedColor[] = ["off", "green", "red"];
export const PATHS: Record<VaultLedColor, string> = { off: "/setOff", green: "/setGreen", red: "/setRed" };
export const COLOR_FOR: Record<VaultLedState, VaultLedColor> = { solved: "green", reset: "red" };

// The vendor's example uses 5s too.
export const REQUEST_TIMEOUT_MS = 5000;
export const MIN_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30_000;

/** Retry delay after `failures` unconfirmed attempts in a row: 1s, 2s, 4s, ... capped at 30s. */
export function backoffMs(failures: number) {
  return Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** failures);
}

export type VaultLedStatus = {
  color: VaultLedColor;
  result: "sending" | "accepted" | "unconfirmed";
  at: number;
  /** Why it's unconfirmed: "HTTP 500", "timed out after 5s", "ECONNREFUSED", ... */
  detail?: string;
};

export type VaultLed = {
  /** Where requests go, without any credentials, for logs and the admin page. */
  target: string;
  set(color: VaultLedColor): void;
  /** Sets the color and resolves with the outcome of its request. */
  test(color: VaultLedColor): Promise<VaultLedStatus>;
  status(): VaultLedStatus | null;
  /** Drops the wanted color and any pending retry; a request already in flight still finishes. */
  cancel(): void;
  stop(): void;
};

/**
 * Sends one request to the Pi. Resolves with null when it answered with a
 * 2xx, otherwise with why it's unconfirmed and whether sending it again
 * could help.
 */
export type SendRequest = (url: string) => Promise<{ detail: string; retry: boolean } | null>;

export function describeFailure(error: unknown) {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`;
  }
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  return cause?.code ?? (error instanceof Error ? error.message : String(error));
}

export function createVaultLedQueue(target: string, request: SendRequest): VaultLed {
  let wanted: VaultLedColor | null = null;
  let sending: VaultLedColor | null = null;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let current: VaultLedStatus | null = null;
  // test() callers, each waiting for the outcome of its own color.
  const waiting = new Set<{ color: VaultLedColor; resolve(status: VaultLedStatus): void }>();
  const settle = (status: VaultLedStatus, matches: (color: VaultLedColor) => boolean) => {
    for (const waiter of waiting) {
      if (!matches(waiter.color)) continue;
      waiting.delete(waiter);
      waiter.resolve(status.color === waiter.color ? status : { ...status, color: waiter.color });
    }
  };

  async function send() {
    if (sending || stopped || !wanted) return;
    clearTimeout(timer);
    const color = wanted;
    sending = color;
    current = { color, result: "sending", at: Date.now() };
    let failure: Awaited<ReturnType<SendRequest>>;
    try {
      failure = await request(target + PATHS[color]);
    } catch (error) {
      failure = { detail: describeFailure(error), retry: true };
    }
    sending = null;
    if (stopped) return;

    current = failure
      ? { color, result: "unconfirmed", at: Date.now(), detail: failure.detail }
      : { color, result: "accepted", at: Date.now() };
    settle(current, (waiting) => waiting === color);

    if (wanted !== color) {
      // A newer color came in meanwhile: send that now.
      void send();
    } else if (!failure?.retry) {
      failures = 0;
      wanted = null;
    } else {
      const delay = backoffMs(failures++);
      console.warn(`Vault LED: ${color} unconfirmed (${failure.detail}), retrying in ${delay / 1000}s`);
      timer = setTimeout(send, delay);
      // Never keep the process alive just to retry.
      (timer as { unref?: () => void }).unref?.();
    }
  }

  const set = (color: VaultLedColor) => {
    if (color !== wanted) failures = 0;
    wanted = color;
    // A test of another color that hasn't gone out yet never will.
    settle(
      { color, result: "unconfirmed", at: Date.now(), detail: `replaced by ${color} before it was sent` },
      (waiting) => waiting !== color && waiting !== sending,
    );
    void send();
  };

  return {
    target,
    set,
    test(color) {
      return new Promise((resolve) => {
        waiting.add({ color, resolve });
        set(color);
      });
    },
    status: () => current,
    cancel() {
      clearTimeout(timer);
      wanted = null;
      failures = 0;
      settle(
        { color: "off", result: "unconfirmed", at: Date.now(), detail: "cancelled before it was sent" },
        (waiting) => waiting !== sending,
      );
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      waiting.clear();
    },
  };
}
