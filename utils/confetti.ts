export const CONFETTI_COLORS = ["#ffb020", "#34c77b", "#f2394a", "#f4f1ea", "#5b8def"];

export type ConfettiPiece = {
  /** Horizontal start, % of the viewport width. */
  left: number;
  /** Sideways drift while falling, px. */
  drift: number;
  delayMs: number;
  durationMs: number;
  /** Total spin while falling, degrees. */
  spin: number;
  width: number;
  height: number;
  color: string;
};

/** The longest a piece can take to land, so the burst can unmount after it. */
export const CONFETTI_MAX_MS = 400 + 2600;

/** One burst of confetti; `random` is injectable for tests. */
export function makeConfetti(count: number, random: () => number = Math.random): ConfettiPiece[] {
  return Array.from({ length: count }, () => {
    const width = 6 + Math.round(random() * 6);
    return {
      left: Math.round(random() * 1000) / 10,
      drift: Math.round((random() - 0.5) * 240),
      delayMs: Math.round(random() * 400),
      durationMs: 1800 + Math.round(random() * 800),
      spin: Math.round((random() - 0.5) * 1440),
      width,
      height: Math.round(width * (0.4 + random() * 0.6)),
      color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
    };
  });
}
