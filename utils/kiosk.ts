import type { GameConfig } from "./configSchema";

/** What the client needs to run kiosk mode (#4). Null in device mode. */
export type KioskSettings = {
  idleTimeoutSeconds: number;
  /** The vault LED's Pi when the kiosk browser drives it (#5); null when the server does. */
  vaultLedUrl: string | null;
};

type KioskConfig = Pick<GameConfig, "mode" | "idleTimeoutSeconds" | "vaultLedRoute" | "vaultLedBrowserUrl">;

/** Spread into a page's getServerSideProps props; _app reads it to switch the kiosk shell on. */
export function kioskProps(config: KioskConfig): { kiosk: KioskSettings | null } {
  if (config.mode !== "kiosk") return { kiosk: null };
  const vaultLedUrl = config.vaultLedRoute === "browser" ? (config.vaultLedBrowserUrl ?? null) : null;
  return { kiosk: { idleTimeoutSeconds: config.idleTimeoutSeconds, vaultLedUrl } };
}

/** Query flag the idle guard adds when it sends the tablet back to the start screen. */
export const IDLE_RESET_PARAM = "idle";

/** Forgets the phone number and channel the last player entered on this browser. */
export function clearPlayerStorage() {
  localStorage.removeItem("channel");
  localStorage.removeItem("number");
}

/** How long the "Still there?" dialog shows before the reset (#10): 15s, or half the window for short timeouts. */
export function warningSeconds(timeoutSeconds: number) {
  return Math.min(15, Math.floor(timeoutSeconds / 2));
}

export type IdleState = { phase: "active" } | { phase: "warning"; secondsLeft: number } | { phase: "reset" };

export function idleState(idleMs: number, timeoutSeconds: number): IdleState {
  const remainingMs = timeoutSeconds * 1000 - idleMs;
  if (remainingMs <= 0) return { phase: "reset" };
  if (remainingMs <= warningSeconds(timeoutSeconds) * 1000) {
    return { phase: "warning", secondsLeft: Math.ceil(remainingMs / 1000) };
  }
  return { phase: "active" };
}
