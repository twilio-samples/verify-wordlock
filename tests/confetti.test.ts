import { describe, expect, it } from "vitest";
import { CONFETTI_COLORS, CONFETTI_MAX_MS, makeConfetti } from "../utils/confetti";

describe("makeConfetti", () => {
  it("makes the requested number of pieces", () => {
    expect(makeConfetti(80)).toHaveLength(80);
    expect(makeConfetti(0)).toEqual([]);
  });

  it("keeps every piece on screen, in palette, and landed by CONFETTI_MAX_MS", () => {
    for (const random of [() => 0, () => 0.999999, Math.random]) {
      for (const p of makeConfetti(50, random)) {
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.left).toBeLessThanOrEqual(100);
        expect(CONFETTI_COLORS).toContain(p.color);
        expect(p.delayMs + p.durationMs).toBeLessThanOrEqual(CONFETTI_MAX_MS);
        expect(p.height).toBeGreaterThan(0);
      }
    }
  });
});
