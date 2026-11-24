export type WinnerPolicy = "infinite" | "oncePerDay" | "lifetime";

function localDateKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local (server) calendar date as YYYY-MM-DD. Deliberately not toISOString(), which is UTC. */
export function todayKey(): string {
  return localDateKey(Date.now());
}

/** Value to store in the `winner` cookie when a box is won under `policy`: the win's own timestamp. Null means: don't set a cookie. */
export function winnerCookieValue(policy: WinnerPolicy): string | null {
  if (policy === "infinite") return null;
  return String(Date.now());
}

/**
 * Re-evaluates a stored `winner` cookie value against whatever policy (and
 * reset point) is active right now, rather than trusting the cookie's own
 * expiry. This is what makes an admin flipping the policy -- or hitting
 * "Reset winners" -- take effect immediately for everyone, with no cookie
 * migration step: a win timestamp at or before `winnerResetAt` no longer
 * counts, regardless of what policy is (or was) active.
 */
export function hasAlreadyWon(
  policy: WinnerPolicy,
  cookieValue: string | undefined,
  winnerResetAt = 0
): boolean {
  if (policy === "infinite" || !cookieValue) return false;

  const wonAt = Number(cookieValue);
  if (!Number.isFinite(wonAt) || wonAt <= winnerResetAt) return false;

  if (policy === "lifetime") return true;
  return localDateKey(wonAt) === todayKey();
}
