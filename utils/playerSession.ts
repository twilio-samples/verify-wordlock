import { parseCookie, stringifySetCookie } from "cookie";
import { SESSION_COOKIE } from "./funnel";
import { endPuzzle } from "./puzzleSession";

/** Every cookie the attendee flow sets. */
export const PLAYER_COOKIES = [SESSION_COOKIE, "verified", "attempt", "winner"];

/** Puzzle plays left, from the `attempt` cookie (the plays used so far). */
export function remainingTries(attemptCookie: string | undefined, maxAttempts: number) {
  const used = parseInt(attemptCookie || "0", 10);
  return Math.max(0, maxAttempts - (Number.isFinite(used) ? used : 0));
}

export function expiredPlayerCookies() {
  return PLAYER_COOKIES.map((name) => stringifySetCookie({ name, value: "", maxAge: 0, path: "/" }));
}

/**
 * Kiosk mode: reaching the start screen means a new person is at the tablet.
 * Ends the previous player's puzzle run and drops their cookies, so their
 * verification, attempt count, and win don't carry over to the next player.
 */
export async function resetPlayer(cookieHeader: string | undefined, res: { setHeader(name: string, value: string[]): unknown }) {
  // Cookies first: without them the old run is unreachable, even if Sync is
  // down and the puzzle session has to wait out its own TTL.
  res.setHeader("Set-Cookie", expiredPlayerCookies());
  try {
    await endPuzzle(parseCookie(cookieHeader || "")[SESSION_COOKIE]);
  } catch (error) {
    console.error("Could not end the previous kiosk player's puzzle run", error);
  }
}
