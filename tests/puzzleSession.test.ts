import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sync from "../utils/sync";
import { store } from "./fakeSync";
import { endPuzzle, hasSolvedPuzzle, startOrResumePuzzle, submitGuess } from "../utils/puzzleSession";
import { DEFAULT_CONFIG, type GameConfig } from "../utils/gameConfig";

// vi.mock is hoisted above the imports, so these modules load against the fake.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);

const CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  solutionWords: [{ word: "PHONE", hints: ["first", "second", "third"] }],
  time: 60,
  hintRevealEvery: 2,
};
const T0 = 1_000_000;
const SID = "session-1";

beforeEach(() => {
  store.clear();
  vi.mocked(sync.upsertMapItem).mockClear();
  vi.mocked(sync.updateMapItemIfMatch).mockClear();
});

describe("startOrResumePuzzle", () => {
  it("starts a session without exposing the answer or any hints", async () => {
    const view = await startOrResumePuzzle(SID, CONFIG, T0);
    expect(view).toEqual({
      wordLength: 5,
      guesses: [],
      revealedHints: [],
      totalHints: 3,
      guessesUntilNextHint: 2,
      secondsLeft: 60,
      solved: false,
    });
    expect(JSON.stringify(view)).not.toContain("PHONE");
    expect(JSON.stringify(view)).not.toContain("first");
  });

  it("stores the session with a TTL so abandoned runs clean themselves up", async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
    expect(sync.upsertMapItem).toHaveBeenCalledWith("puzzle-sessions", SID, expect.anything(), false, 60 + 300);
  });

  it("resumes the same run after a refresh, with revealed hints intact", async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
    await submitGuess(SID, "PLANE", T0 + 1000);
    await submitGuess(SID, "PLANS", T0 + 2000);

    const view = await startOrResumePuzzle(SID, CONFIG, T0 + 10_000);
    expect(view.guesses).toHaveLength(2);
    expect(view.revealedHints).toEqual(["first"]);
    expect(view.secondsLeft).toBe(50);
  });

  it("snapshots the word, so an admin edit mid-game doesn't change it", async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
    const edited = { ...CONFIG, solutionWords: [{ word: "SMS", hints: [] }] };
    expect((await startOrResumePuzzle(SID, edited, T0 + 1000)).wordLength).toBe(5);
  });

  it("starts over once the previous run has expired", async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
    await submitGuess(SID, "PLANE", T0 + 1000);
    const view = await startOrResumePuzzle(SID, CONFIG, T0 + 120_000);
    expect(view.guesses).toEqual([]);
    expect(view.secondsLeft).toBe(60);
  });
});

describe("submitGuess", () => {
  beforeEach(async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
  });

  it("scores a guess on the server", async () => {
    const result = await submitGuess(SID, "plane", T0 + 1000);
    expect(result.ok && result.view.guesses[0].map((s) => s.color)).toEqual(["green", "grey", "grey", "green", "green"]);
  });

  it("reveals hints in order, one per N misses, and stops when they run out", async () => {
    const seen: string[][] = [];
    for (let i = 0; i < 7; i++) {
      const result = await submitGuess(SID, "XXXXX", T0 + i * 1000);
      if (result.ok) seen.push(result.view.revealedHints);
    }
    expect(seen.map((hints) => hints.length)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(seen[6]).toEqual(["first", "second", "third"]);
    const last = await submitGuess(SID, "XXXXX", T0 + 8000);
    expect(last.ok && last.view.guessesUntilNextHint).toBeNull();
  });

  it("counts down to the next hint", async () => {
    const result = await submitGuess(SID, "XXXXX", T0 + 1000);
    expect(result.ok && result.view.guessesUntilNextHint).toBe(1);
  });

  it("keeps both of two overlapping guesses, and a stale miss can't undo a solve", async () => {
    const [miss, hit] = await Promise.all([submitGuess(SID, "PLANE", T0 + 1000), submitGuess(SID, "PHONE", T0 + 1000)]);
    expect(miss.ok || hit.ok).toBe(true);
    expect(await hasSolvedPuzzle(SID)).toBe(true);
    const view = await startOrResumePuzzle(SID, CONFIG, T0 + 2000);
    // The miss either landed first, or arrived after the solve and was refused.
    expect(view.guesses.length).toBe(miss.ok ? 2 : 1);
    expect(sync.updateMapItemIfMatch).toHaveBeenCalled();
  });

  it("marks the session solved on the right word", async () => {
    const result = await submitGuess(SID, "PHONE", T0 + 1000);
    expect(result.ok && result.view.solved).toBe(true);
    expect(await hasSolvedPuzzle(SID)).toBe(true);
    expect(await submitGuess(SID, "PHONE", T0 + 2000)).toMatchObject({ ok: false, reason: "solved" });
  });

  it("rejects guesses of the wrong length or with non-letters without counting them", async () => {
    expect(await submitGuess(SID, "PHON", T0)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await submitGuess(SID, "PH0NE", T0)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await submitGuess(SID, 12345, T0)).toMatchObject({ ok: false, reason: "invalid" });
    const result = await submitGuess(SID, "PLANE", T0);
    expect(result.ok && result.view.guesses).toHaveLength(1);
  });

  it("refuses guesses after time runs out, allowing a short network grace", async () => {
    expect((await submitGuess(SID, "PLANE", T0 + 61_000)).ok).toBe(true);
    expect(await submitGuess(SID, "PHONE", T0 + 63_000)).toMatchObject({ ok: false, reason: "expired" });
    expect(await hasSolvedPuzzle(SID)).toBe(false);
  });

  it("reports a missing session", async () => {
    expect(await submitGuess("someone-else", "PHONE", T0)).toMatchObject({ ok: false, reason: "no-session" });
  });
});

describe("hasSolvedPuzzle / endPuzzle", () => {
  it("is false without a session id or a solved run", async () => {
    expect(await hasSolvedPuzzle(undefined)).toBe(false);
    await startOrResumePuzzle(SID, CONFIG, T0);
    expect(await hasSolvedPuzzle(SID)).toBe(false);
  });

  it("ending the run makes the next visit start a fresh word", async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
    await submitGuess(SID, "PHONE", T0 + 1000);
    await endPuzzle(SID);
    expect(await hasSolvedPuzzle(SID)).toBe(false);
    expect((await startOrResumePuzzle(SID, CONFIG, T0 + 2000)).guesses).toEqual([]);
  });
});
