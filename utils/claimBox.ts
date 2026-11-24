/** Device mode: a prize in a numbered box. Kiosk mode: the vault opened, prize picked in person. */
export type Claim = { prize: string; boxNumber: number } | { vault: true };

/** Where the device-mode prize message goes: the number and channel the player verified. */
export type Recipient = { address: string; channel: string };

/**
 * Claims a prize server-side (race-free via claimPrize/tryClaim, invoked
 * through the `win: true` path in pages/api/unlockBox.ts) and unlocks its
 * box. Shared by the puzzle-win path and the puzzle-skipped path so both go
 * through the same concurrency-safe reservation instead of picking a prize
 * client-side. In device mode the server also texts the prize to
 * `recipient`, if that's the number this session verified.
 */
export async function claimBox(recipient?: Recipient, attempt = 0): Promise<Claim | null> {
  const response = await fetch("/api/unlockBox", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ win: true, recipient }),
  });

  if (response.status === 409 && attempt < 5) {
    // All boxes are momentarily reserved by other winners; a box frees up
    // again shortly, so back off briefly and try to claim one again.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return claimBox(recipient, attempt + 1);
  }

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (data.vault) {
    return { vault: true };
  }
  if (!data.prize || !data.boxNumber) {
    return null;
  }

  return { prize: data.prize, boxNumber: data.boxNumber };
}

/** Where to send a winner (kiosk mode has no box to name). */
export function completeRoute(claim: Claim) {
  if ("vault" in claim) return { pathname: "/complete", query: {} };
  return { pathname: "/complete", query: { boxNumber: String(claim.boxNumber), prize: claim.prize } };
}
