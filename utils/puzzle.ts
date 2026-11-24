import type { SolutionWord } from "./gameConfig";

export type TileColor = "green" | "amber" | "grey";
export type ScoredLetter = { letter: string; color: TileColor };

/**
 * Wordle-style scoring. Exact matches go green first; the remaining letters
 * go amber only while the solution still has unmatched copies of them, so a
 * guess with a repeated letter never gets more colored tiles than the
 * solution has of that letter.
 */
export function scoreGuess(guess: string, solution: string): ScoredLetter[] {
  const g = guess.toUpperCase().split("");
  const s = solution.toUpperCase().split("");
  const result: ScoredLetter[] = g.map((letter) => ({ letter, color: "grey" }));
  const unmatched = new Map<string, number>();

  s.forEach((letter, i) => {
    if (g[i] === letter) {
      result[i].color = "green";
    } else {
      unmatched.set(letter, (unmatched.get(letter) ?? 0) + 1);
    }
  });
  g.forEach((letter, i) => {
    if (result[i].color === "green") return;
    const left = unmatched.get(letter) ?? 0;
    if (left > 0) {
      result[i].color = "amber";
      unmatched.set(letter, left - 1);
    }
  });

  return result;
}

/** How many of a word's hints are visible after `wrongGuesses` misses: one more every `every`. */
export function revealedHintCount(wrongGuesses: number, every: number, totalHints: number): number {
  if (every <= 0) return 0;
  return Math.min(totalHints, Math.floor(wrongGuesses / every));
}

/** Uniformly random word from the pool. */
export function pickSolutionWord(words: SolutionWord[], random: () => number = Math.random): SolutionWord {
  if (words.length === 0) throw new Error("No solution words configured");
  return words[Math.min(words.length - 1, Math.floor(random() * words.length))];
}
