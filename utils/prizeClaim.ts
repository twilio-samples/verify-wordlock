import { getGameConfig, type Prize } from "./gameConfig";
import { tryClaim } from "./sync";

const CLAIM_MAP = "prize-claims";
// How long a prize stays reserved once claimed, giving the winner time to
// physically open the box before it becomes assignable to someone else again.
const CLAIM_TTL_SECONDS = 20;

function shuffle<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type ClaimedPrize = { prize: Prize & { lockId: string }; boxNumber: number };

/**
 * Atomically reserves one available prize for this session. Sync's
 * create-if-absent semantics make the reservation itself race-free: if two
 * sessions solve at the same instant, at most one of them can win a given
 * lockId, so concurrent winners can never be handed the same box.
 */
export async function claimPrize(sessionId: string | undefined): Promise<ClaimedPrize | null> {
  const { prizes } = await getGameConfig();
  // The schema requires a lockId on every prize in device mode, the only
  // mode that claims per-prize boxes; the filter just narrows the type.
  const boxed = prizes.filter((p): p is Prize & { lockId: string } => Boolean(p.lockId));

  for (const prize of shuffle(boxed)) {
    const claimed = await tryClaim(
      CLAIM_MAP,
      prize.lockId,
      { sessionId, prize: prize.name, claimedAt: Date.now() },
      CLAIM_TTL_SECONDS
    );
    if (claimed) {
      const boxNumber = prizes.findIndex((p: Prize) => p.lockId === prize.lockId) + 1;
      return { prize, boxNumber };
    }
  }

  return null;
}
