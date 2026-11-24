import { describe, expect, it } from "vitest";
import { pickSolutionWord, revealedHintCount, scoreGuess } from "../utils/puzzle";

// G = green (right place), A = amber (wrong place), . = grey (absent)
const SYMBOL = { green: "G", amber: "A", grey: "." } as const;
const pattern = (guess: string, solution: string) =>
  scoreGuess(guess, solution)
    .map((s) => SYMBOL[s.color])
    .join("");

describe("scoreGuess", () => {
  it("marks exact, misplaced, and absent letters", () => {
    expect(pattern("PHONE", "PHONE")).toBe("GGGGG");
    expect(pattern("EPHON", "PHONE")).toBe("AAAAA");
    expect(pattern("XXXXX", "PHONE")).toBe(".....");
    expect(pattern("PLANE", "PHONE")).toBe("G..GG");
  });

  it("never colors more copies of a letter than the solution has", () => {
    // One E in the answer, already matched at the end: the other Es stay grey.
    expect(pattern("EERIE", "PHONE")).toBe("....G");
    // One E, unmatched: only the first misplaced copy goes amber.
    expect(pattern("EEXXX", "PHONE")).toBe("A....");
    // HELLO has two Ls; both of LLAMA's are misplaced.
    expect(pattern("LLAMA", "HELLO")).toBe("AA...");
    expect(pattern("HOLLY", "HELLO")).toBe("GAGG.");
  });

  it("is case-insensitive and works for any word length", () => {
    expect(pattern("sms", "SMS")).toBe("GGG");
    expect(pattern("PASSKEYS", "PASSWORD")).toBe("GGGG....");
    expect(scoreGuess("abc", "CAB").map((s) => s.letter)).toEqual(["A", "B", "C"]);
  });
});

describe("revealedHintCount", () => {
  it("reveals one hint per N wrong guesses, capped at the hint count", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map((wrong) => revealedHintCount(wrong, 2, 3))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("reveals after every miss when N is 1, and never when there are no hints", () => {
    expect(revealedHintCount(2, 1, 5)).toBe(2);
    expect(revealedHintCount(10, 1, 0)).toBe(0);
  });
});

describe("pickSolutionWord", () => {
  const words = ["AAA", "BBB", "CCC"].map((word) => ({ word, hints: [] }));

  it("picks uniformly across the pool", () => {
    expect(pickSolutionWord(words, () => 0).word).toBe("AAA");
    expect(pickSolutionWord(words, () => 0.5).word).toBe("BBB");
    expect(pickSolutionWord(words, () => 0.9999).word).toBe("CCC");
  });

  it("throws on an empty pool", () => {
    expect(() => pickSolutionWord([])).toThrow();
  });
});
