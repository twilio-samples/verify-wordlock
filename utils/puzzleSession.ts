import {
  getMapItem,
  getMapItemWithRevision,
  removeMapItem,
  tryClaim,
  updateMapItemIfMatch,
  upsertMapItem,
} from "./sync";
import type { GameConfig } from "./gameConfig";
import { pickSolutionWord, revealedHintCount, scoreGuess, type ScoredLetter } from "./puzzle";

const PUZZLE_MAP = "puzzle-sessions";
const WIN_MAP = "puzzle-wins";
// When each session last passed a Verify check: the proof of verification,
// since the browser can send any cookie it likes.
const VERIFICATION_MAP = "verifications";
const VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
// Sync drops abandoned sessions on its own a little after the timer would.
const TTL_MARGIN_SECONDS = 300;
// Network slack for a guess submitted as the clock hits zero.
const GRACE_MS = 2_000;
// Optimistic-write retries for overlapping guesses from the same session.
const MAX_WRITE_ATTEMPTS = 5;

/**
 * One attendee's puzzle run, keyed by the `sid` cookie. The answer and hints
 * are snapshotted at start, so an admin editing the word list mid-game can't
 * change a puzzle under someone, and the answer never reaches the browser.
 */
type PuzzleSession = {
  word: string;
  hints: string[];
  guesses: string[];
  startedAt: number;
  timeLimitSeconds: number;
  hintRevealEvery: number;
  solvedAt?: number;
};

/** Everything the browser needs to render the puzzle -- never the answer. */
export type PuzzleView = {
  wordLength: number;
  guesses: ScoredLetter[][];
  revealedHints: string[];
  totalHints: number;
  /** Wrong guesses still needed before the next hint shows; null once all are shown. */
  guessesUntilNextHint: number | null;
  secondsLeft: number;
  solved: boolean;
};

/** How the run that just cracked the word went, for the event stats (#9). */
export type SolveStats = { guesses: number; hintsRevealed: number; solveMs: number };

export type GuessResult =
  | { ok: true; view: PuzzleView; solve?: SolveStats }
  | { ok: false; reason: "no-session" | "expired" | "solved" | "invalid"; message: string };

function toView(session: PuzzleSession, now: number): PuzzleView {
  const wrong = session.guesses.filter((g) => g !== session.word).length;
  const revealed = revealedHintCount(wrong, session.hintRevealEvery, session.hints.length);
  const elapsed = Math.floor((now - session.startedAt) / 1000);
  return {
    wordLength: session.word.length,
    guesses: session.guesses.map((g) => scoreGuess(g, session.word)),
    revealedHints: session.hints.slice(0, revealed),
    totalHints: session.hints.length,
    guessesUntilNextHint:
      revealed >= session.hints.length ? null : session.hintRevealEvery - (wrong % session.hintRevealEvery),
    secondsLeft: Math.max(0, session.timeLimitSeconds - elapsed),
    solved: Boolean(session.solvedAt),
  };
}

function isExpired(session: PuzzleSession, now: number) {
  return !session.solvedAt && now > session.startedAt + session.timeLimitSeconds * 1000 + GRACE_MS;
}

async function load(sessionId: string): Promise<PuzzleSession | null> {
  return (await getMapItem(PUZZLE_MAP, sessionId)) as PuzzleSession | null;
}

async function save(sessionId: string, session: PuzzleSession) {
  await upsertMapItem(PUZZLE_MAP, sessionId, session, false, session.timeLimitSeconds + TTL_MARGIN_SECONDS);
}

/** Resumes this session's puzzle (e.g. after a refresh), or starts a fresh one if none is running. */
export async function startOrResumePuzzle(
  sessionId: string,
  config: GameConfig,
  now = Date.now()
): Promise<PuzzleView> {
  const existing = await load(sessionId);
  if (existing && !isExpired(existing, now)) {
    return toView(existing, now);
  }

  const { word, hints } = pickSolutionWord(config.solutionWords);
  const session: PuzzleSession = {
    word,
    hints: [...hints],
    guesses: [],
    startedAt: now,
    timeLimitSeconds: config.time,
    hintRevealEvery: config.hintRevealEvery,
  };
  await save(sessionId, session);
  return toView(session, now);
}

export async function submitGuess(sessionId: string, rawGuess: unknown, now = Date.now()): Promise<GuessResult> {
  // Read-modify-write guarded by the item's revision, so overlapping
  // guesses (double tap, two tabs) can't drop each other or wipe a solve.
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const stored = await getMapItemWithRevision(PUZZLE_MAP, sessionId);
    const session = stored?.data as PuzzleSession | undefined;
    if (!stored || !session) return { ok: false, reason: "no-session", message: "Your puzzle expired. Start again." };
    if (session.solvedAt) return { ok: false, reason: "solved", message: "Already solved." };
    if (isExpired(session, now)) return { ok: false, reason: "expired", message: "Time's up." };

    const guess = typeof rawGuess === "string" ? rawGuess.trim().toUpperCase() : "";
    if (guess.length !== session.word.length || !/^[A-Z]+$/.test(guess)) {
      return { ok: false, reason: "invalid", message: `Enter all ${session.word.length} letters.` };
    }

    session.guesses.push(guess);
    if (guess === session.word) session.solvedAt = now;
    const written = await updateMapItemIfMatch(
      PUZZLE_MAP,
      sessionId,
      session,
      stored.revision,
      session.timeLimitSeconds + TTL_MARGIN_SECONDS
    );
    if (!written) continue;
    const view = toView(session, now);
    if (!session.solvedAt) return { ok: true, view };
    const solve = { guesses: view.guesses.length, hintsRevealed: view.revealedHints.length, solveMs: now - session.startedAt };
    return { ok: true, view, solve };
  }
  throw new Error("Puzzle session is too busy; try again");
}

/** True once this session has solved its puzzle. */
export async function hasSolvedPuzzle(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return false;
  return Boolean((await load(sessionId))?.solvedAt);
}

/**
 * The gate for the win path: succeeds exactly once per solved run. Sync's
 * create-if-absent makes it atomic, so parallel win requests from one
 * solved session can't each open a box. Returns a release function for
 * when the win then fails (no free box, lock error) and the attendee
 * should be able to retry; null if this run hasn't been solved or its win
 * is already taken.
 */
export async function consumeSolvedPuzzle(sessionId: string | undefined): Promise<(() => Promise<void>) | null> {
  if (!sessionId) return null;
  const session = await load(sessionId);
  if (!session?.solvedAt) return null;
  const key = `${sessionId}:${session.startedAt}`;
  const claimed = await tryClaim(WIN_MAP, key, { solvedAt: session.solvedAt }, session.timeLimitSeconds + TTL_MARGIN_SECONDS);
  return claimed ? () => removeMapItem(WIN_MAP, key) : null;
}

/**
 * Records a passed Verify check; in 2FA-only mode, each one is good for one
 * win. `recipient` is utils/prizeMessage.ts's hash of the verified number,
 * never the number itself.
 */
export async function recordVerification(sessionId: string | undefined, now = Date.now(), recipient?: string) {
  if (!sessionId) return;
  const record = recipient ? { verifiedAt: now, recipient } : { verifiedAt: now };
  await upsertMapItem(VERIFICATION_MAP, sessionId, record, false, VERIFICATION_TTL_SECONDS);
}

/** The hash of the number this session verified, if it verified one. */
export async function verifiedRecipient(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const record = (await getMapItem(VERIFICATION_MAP, sessionId)) as { recipient?: string } | null;
  return record?.recipient ?? null;
}

/** True if this session passed a Verify check in the last 24 hours. */
export async function isVerified(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return false;
  const record = (await getMapItem(VERIFICATION_MAP, sessionId)) as { verifiedAt?: number } | null;
  return Boolean(record?.verifiedAt);
}

/**
 * The 2FA-only counterpart of consumeSolvedPuzzle(): succeeds once per
 * passed Verify check, so two overlapping win requests (a double-submitted
 * code) can't both open a lock -- which matters in kiosk mode, where no
 * winner cookie stops a replay.
 */
export async function consumeVerification(sessionId: string | undefined): Promise<(() => Promise<void>) | null> {
  if (!sessionId) return null;
  const record = (await getMapItem(VERIFICATION_MAP, sessionId)) as { verifiedAt?: number } | null;
  if (!record?.verifiedAt) return null;
  const key = `${sessionId}:verified:${record.verifiedAt}`;
  const claimed = await tryClaim(WIN_MAP, key, { verifiedAt: record.verifiedAt }, VERIFICATION_TTL_SECONDS);
  return claimed ? () => removeMapItem(WIN_MAP, key) : null;
}

/** Ends the run (prize claimed, time out, or kiosk reset) so the next visit starts a new word. */
export async function endPuzzle(sessionId: string | undefined) {
  if (!sessionId) return;
  await removeMapItem(PUZZLE_MAP, sessionId);
}
