import { beforeEach, describe, expect, it, vi } from "vitest";
import { callingCodeLabel, callingCodeOf } from "../utils/callingCode";
import {
  codeSentEvent,
  funnelStatsCsv,
  getFunnelStats,
  summarizeFunnel,
  trackIdleReset,
  type FunnelItem,
} from "../utils/funnel";
import { clearGameConfigCache, DEFAULT_CONFIG, type GameConfig } from "../utils/gameConfig";
import { recordVerification, startOrResumePuzzle, submitGuess } from "../utils/puzzleSession";
import guessHandler from "../pages/api/puzzle/guess";
import failedHandler from "../pages/api/failed";
import statsHandler from "../pages/api/admin/stats";
import { getServerSideProps as homeProps } from "../pages/index";
import { callApi } from "./apiHelpers";
import { getItem, setItem, store } from "./fakeSync";

// vi.mock is hoisted above the imports, so these modules load against the fakes.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
vi.mock("../utils/vaultLed", () => ({ setVaultLed: vi.fn() }));
vi.mock("../utils/iglooToken", () => ({ ensureIglooToken: vi.fn(async () => "token") }));

const FUNNEL = "game-funnel";
const SID = "sid-1";
const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 26, 9, 15); // Mon 26 Oct 2026, 09:15 UTC
const CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  solutionWords: [{ word: "PHONE", hints: ["first", "second"] }],
  hintRevealEvery: 1,
  winnerPolicy: "infinite",
};

beforeEach(() => {
  store.clear();
  clearGameConfigCache();
  setItem("game-config", "active", CONFIG);
});

describe("callingCodeOf", () => {
  it("keeps only the country calling code", () => {
    expect(callingCodeOf("+4915112345678")).toBe("+49");
    expect(callingCodeOf("+1 (415) 555-0100")).toBe("+1");
    expect(callingCodeOf("+447700900123")).toBe("+44");
  });

  it("matches multi-digit country codes", () => {
    expect(callingCodeOf("+3584012345")).toBe("+358");
    expect(callingCodeOf("+85291234567")).toBe("+852");
  });

  it("never keeps a +1 area code, which would say where in the US or Caribbean a player is", () => {
    expect(callingCodeOf("+16845550100")).toBe("+1"); // American Samoa
    expect(callingCodeOf("+18765550100")).toBe("+1"); // Jamaica
  });

  it("ignores anything that isn't an international number", () => {
    for (const value of ["015112345678", "", "+", "+abc", undefined, 4915112345678]) {
      expect(callingCodeOf(value)).toBeUndefined();
    }
  });

  it("labels codes with their countries, preferred first", () => {
    expect(callingCodeLabel("+49")).toBe("Germany (+49)");
    expect(callingCodeLabel("+1")).toBe("United States, Canada (+1)");
    expect(callingCodeLabel("+44")).toMatch(/^United Kingdom, .+ and 2 more \(\+44\)$/);
    expect(callingCodeLabel("+999")).toBe("Unknown (+999)");
  });
});

describe("codeSentEvent", () => {
  it("records the channel and calling code, never the number", () => {
    const event = codeSentEvent("whatsapp", "whatsapp:+4915112345678", T0);
    expect(event).toEqual({ codeSentAt: T0, channel: "whatsapp", callingCode: "+49" });
    expect(JSON.stringify(event)).not.toContain("15112345678");
  });

  it("drops an unknown channel or unparseable number", () => {
    expect(codeSentEvent("pigeon", "0151", T0)).toEqual({ codeSentAt: T0 });
  });
});

describe("summarizeFunnel", () => {
  const items: FunnelItem[] = [
    // Solved on the 3rd guess with 2 hints showing, in 40s; won socks.
    { startedAt: T0, codeSentAt: T0, channel: "sms", callingCode: "+49", verifiedAt: T0, solvedAt: T0, boxOpenedAt: T0, prize: "Socks", guesses: 3, hintsRevealed: 2, solveMs: 40_000 },
    // Solved first try, 20s, after an earlier timeout.
    { startedAt: T0 + 10 * 60_000, codeSentAt: T0, channel: "sms", callingCode: "+1", verifiedAt: T0, timedOutAt: T0, solvedAt: T0 + 1, guesses: 1, hintsRevealed: 0, solveMs: 20_000 },
    // Timed out and walked away.
    { startedAt: T0 + 2 * H, codeSentAt: T0, channel: "whatsapp", callingCode: "+49", verifiedAt: T0, timedOutAt: T0, idleResetAt: T0 },
    // Walked away while entering the code.
    { startedAt: T0 + 2 * H, codeSentAt: T0, channel: "call", callingCode: "+44", idleResetAt: T0 },
    // Walked away on the channel screen.
    { startedAt: T0 + 2 * H, idleResetAt: T0 },
    // Used every try, then the kiosk reset: lost, didn't walk away (#24).
    { startedAt: T0 + 2 * H, codeSentAt: T0, verifiedAt: T0, timedOutAt: T0, unsolvedAt: T0, idleResetAt: T0 },
  ];
  const stats = summarizeFunnel(items);

  it("counts every funnel stage", () => {
    expect(stats.stages.map((s) => s.count)).toEqual([6, 5, 4, 2, 1]);
  });

  it("summarizes the puzzle runs", () => {
    expect(stats.puzzle).toEqual({
      solved: 2,
      solveRate: 2 / 4,
      avgGuesses: 2,
      avgSolveSeconds: 30,
      medianSolveSeconds: 30,
      hintsAtSolve: [
        { hints: 0, count: 1 },
        { hints: 2, count: 1 },
      ],
      timedOut: 3,
      unsolved: 1,
    });
  });

  it("buckets walk-aways by the step they stopped at, leaving out unsolved puzzles", () => {
    expect(stats.idleResets).toEqual({
      total: 3,
      byStep: [
        { step: "Choosing a channel", count: 1 },
        { step: "Entering the code", count: 1 },
        { step: "After timing out", count: 1 },
      ],
    });
  });

  it("ranks channels, calling codes, and prizes", () => {
    expect(stats.channels).toEqual([
      { channel: "sms", count: 2 },
      { channel: "whatsapp", count: 1 },
      { channel: "call", count: 1 },
    ]);
    expect(stats.callingCodes[0]).toEqual({ code: "+49", label: "Germany (+49)", count: 2 });
    expect(stats.prizes).toEqual([{ name: "Socks", count: 1 }]);
  });

  it("buckets sessions by hour, filling quiet hours with zero", () => {
    expect(stats.hourly).toEqual([
      { hour: T0 - 15 * 60_000, count: 2 },
      { hour: T0 - 15 * 60_000 + H, count: 0 },
      { hour: T0 - 15 * 60_000 + 2 * H, count: 4 },
    ]);
  });

  it("only lists active hours across a long span", () => {
    const hourly = summarizeFunnel([{ startedAt: T0 }, { startedAt: T0 + 30 * 24 * H }]).hourly;
    expect(hourly).toHaveLength(2);
  });

  it("is all empty, not NaN, with no data", () => {
    const empty = summarizeFunnel([]);
    expect(empty.puzzle).toMatchObject({ solved: 0, solveRate: null, avgGuesses: null, medianSolveSeconds: null });
    expect(empty.hourly).toEqual([]);
  });

  it("has no solve rate when nobody played the puzzle (2FA-only mode)", () => {
    const win = { startedAt: T0, verifiedAt: T0, solvedAt: T0, boxOpenedAt: T0, twoFactorOnly: true };
    expect(summarizeFunnel([win]).puzzle).toMatchObject({ solved: 0, solveRate: null });
  });

  it("leaves 2FA-only sessions out of the solve rate when the mode changed mid-event", () => {
    const twoFactor = { startedAt: T0, verifiedAt: T0, twoFactorOnly: true };
    const winner = { ...twoFactor, solvedAt: T0, boxOpenedAt: T0 };
    // Verified while 2FA-only, then the puzzle was switched on before they won.
    const switched = { ...twoFactor, solvedAt: T0, guesses: 2, hintsRevealed: 0, solveMs: 10_000 };
    const puzzle = summarizeFunnel([twoFactor, winner, switched, items[0], items[2]]).puzzle;
    expect(puzzle).toMatchObject({ solved: 2, solveRate: 2 / 3, avgGuesses: 2.5 });
  });

  it("still counts solves recorded before the run details existed", () => {
    const legacy = { startedAt: T0, verifiedAt: T0, solvedAt: T0, boxOpenedAt: T0 };
    const puzzle = summarizeFunnel([legacy, items[0]]).puzzle;
    expect(puzzle).toMatchObject({ solved: 2, solveRate: 1, avgGuesses: 3, medianSolveSeconds: 40 });
    expect(puzzle.hintsAtSolve).toEqual([{ hints: 2, count: 1 }]);
  });
});

describe("funnelStatsCsv", () => {
  it("exports aggregates only, one row per figure", () => {
    const csv = funnelStatsCsv(
      summarizeFunnel([{ startedAt: T0, codeSentAt: T0, channel: "sms", callingCode: "+1", prize: 'Mug, "large"' }])
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("section,label,value");
    expect(lines).toContain("funnel,Started,1");
    expect(lines).toContain('calling codes,"United States, Canada (+1)",1');
    expect(lines).toContain('prizes,"Mug, ""large""",1');
    expect(lines).toContain("sessions per hour (UTC),2026-10-26T09:00:00.000Z,1");
    expect(lines).toContain("puzzle,Average guesses,");
  });

  it("defuses spreadsheet formulas in prize names", () => {
    const csv = funnelStatsCsv(summarizeFunnel([{ prize: "=HYPERLINK(1)" }]));
    expect(csv).toContain("prizes,'=HYPERLINK(1),1");
  });
});

describe("tracking", () => {
  it("records the solving run's guesses, hints, and time", async () => {
    await recordVerification(SID);
    await startOrResumePuzzle(SID, CONFIG);
    await callApi(guessHandler, { body: { guess: "PLANE" }, cookies: { sid: SID, verified: "true" } });
    expect(getItem(FUNNEL, SID)).toBeUndefined();
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: { sid: SID, verified: "true" } });
    expect(getItem(FUNNEL, SID)).toMatchObject({ guesses: 2, hintsRevealed: 1, solvedAt: expect.any(Number) });
  });

  it("reports solve stats only for the solving guess", async () => {
    await startOrResumePuzzle(SID, CONFIG, T0);
    expect(await submitGuess(SID, "PLANE", T0 + 1000)).not.toHaveProperty("solve");
    expect(await submitGuess(SID, "PHONE", T0 + 5000)).toMatchObject({
      solve: { guesses: 2, hintsRevealed: 1, solveMs: 5000 },
    });
  });

  it("records a timeout", async () => {
    await callApi(failedHandler, { cookies: { sid: SID } });
    expect(getItem(FUNNEL, SID)).toMatchObject({ timedOutAt: expect.any(Number) });
    expect(getItem(FUNNEL, SID)).not.toHaveProperty("unsolvedAt");
  });

  it("marks the puzzle unsolved when the last try times out", async () => {
    const last = String(CONFIG.attempts - 1);
    await callApi(failedHandler, { cookies: { sid: SID, attempt: last } });
    expect(getItem(FUNNEL, SID)).toMatchObject({ timedOutAt: expect.any(Number), unsolvedAt: expect.any(Number) });
  });

  it("never counts an idle reset after the last try as a walk-away", async () => {
    setItem(FUNNEL, SID, { startedAt: T0, timedOutAt: T0, unsolvedAt: T0 });
    await trackIdleReset(SID, T0 + 1);
    expect(getItem(FUNNEL, SID)).not.toHaveProperty("idleResetAt");
  });

  it("counts a kiosk idle reset once, and never for a winner", async () => {
    setItem(FUNNEL, SID, { startedAt: T0 });
    await trackIdleReset(SID, T0 + 1);
    await trackIdleReset(SID, T0 + 2);
    expect(getItem(FUNNEL, SID)).toMatchObject({ idleResetAt: T0 + 1 });

    setItem(FUNNEL, "winner", { startedAt: T0, boxOpenedAt: T0 });
    await trackIdleReset("winner", T0 + 1);
    expect(getItem(FUNNEL, "winner")).not.toHaveProperty("idleResetAt");
  });

  it("counts the idle reset when the kiosk start screen is reached by the idle guard", async () => {
    setItem("game-config", "active", { ...CONFIG, mode: "kiosk", vaultLockId: "SPVAULT" });
    setItem(FUNNEL, SID, { startedAt: T0 });
    const ctx = (query: Record<string, string>) => ({
      query,
      req: { headers: { cookie: `sid=${SID}` } },
      res: { setHeader: () => {} },
    });
    await homeProps(ctx({}));
    expect(getItem(FUNNEL, SID)).not.toHaveProperty("idleResetAt");
    await homeProps(ctx({ idle: "1" }));
    expect(getItem(FUNNEL, SID)).toHaveProperty("idleResetAt");
  });
});

describe("GET /api/admin/stats", () => {
  it("serves JSON, or a CSV download", async () => {
    setItem(FUNNEL, SID, { startedAt: T0 });
    const json = await callApi(statsHandler, { method: "GET" });
    expect(json.body).toMatchObject({ stages: expect.any(Array), hourly: [{ hour: expect.any(Number), count: 1 }] });
    expect(await getFunnelStats()).toEqual(json.body);

    const csv = await callApi(statsHandler, { method: "GET", query: { format: "csv" } });
    expect(csv.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(csv.headers["Content-Disposition"]).toMatch(/^attachment; filename="wordlock-stats-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(csv.body).toContain("funnel,Started,1");
  });
});
