import { getMapItem, listMapItems, upsertMapItem, clearMap } from "./sync";
import { callingCodeLabel, callingCodeOf } from "./callingCode";

const FUNNEL_MAP = "game-funnel";

export const SESSION_COOKIE = "sid";

export type FunnelStage = "startedAt" | "codeSentAt" | "verifiedAt" | "solvedAt" | "boxOpenedAt";

const CHANNELS = ["sms", "call", "whatsapp"] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * One player session, keyed by the anonymous `sid` cookie. Never holds a
 * phone number: only the country calling code it starts with (#9).
 */
export type FunnelItem = Partial<Record<FunnelStage, number>> & {
  prize?: string;
  channel?: Channel;
  callingCode?: string;
  /** The solving run: guesses it took, hints showing when it was solved, and how long it took. */
  guesses?: number;
  hintsRevealed?: number;
  solveMs?: number;
  /** Verified or won in 2FA-only mode: no puzzle, so `solvedAt` (if set) isn't a puzzle solve. */
  twoFactorOnly?: boolean;
  /** Last time this session ran out of time on the puzzle. */
  timedOutAt?: number;
  /** Ran out of time on the last try (#24): the game is over, so it's never a walk-away. */
  unsolvedAt?: number;
  /** Kiosk: the idle guard sent the tablet back to the start screen mid-run. */
  idleResetAt?: number;
};

export async function trackFunnelEvent(sessionId: string | undefined, patch: FunnelItem) {
  if (!sessionId) return;
  try {
    await upsertMapItem(FUNNEL_MAP, sessionId, patch, true);
  } catch (error) {
    console.error("Error tracking funnel event", patch, error);
  }
}

/** The funnel patch for a sent code: the channel and the calling code, never the number. */
export function codeSentEvent(channel: unknown, address: unknown, now = Date.now()): FunnelItem {
  const event: FunnelItem = { codeSentAt: now };
  if (CHANNELS.includes(channel as Channel)) event.channel = channel as Channel;
  const callingCode = callingCodeOf(typeof address === "string" ? address.replace(/^whatsapp:/, "") : address);
  if (callingCode) event.callingCode = callingCode;
  return event;
}

/**
 * Kiosk: records that a player walked away mid-run. Only counts sessions
 * that started and hadn't opened the vault or used up their tries, and only
 * the first reset, so a player leaving the tablet on a final page isn't an
 * abandonment.
 */
export async function trackIdleReset(sessionId: string | undefined, now = Date.now()) {
  if (!sessionId) return;
  try {
    const item = (await getMapItem(FUNNEL_MAP, sessionId)) as FunnelItem | null;
    if (!item?.startedAt || item.boxOpenedAt || item.unsolvedAt || item.idleResetAt) return;
    await upsertMapItem(FUNNEL_MAP, sessionId, { idleResetAt: now }, true);
  } catch (error) {
    console.error("Error tracking idle reset", error);
  }
}

export type FunnelStats = {
  stages: { stage: string; count: number }[];
  prizes: { name: string; count: number }[];
  puzzle: {
    /** Puzzle solves; 2FA-only wins have no puzzle and aren't counted here. Averages cover solves with run details. */
    solved: number;
    /** Solves per verified puzzle player, 0-1; null until someone has solved or timed out (e.g. 2FA-only mode). */
    solveRate: number | null;
    avgGuesses: number | null;
    avgSolveSeconds: number | null;
    medianSolveSeconds: number | null;
    /** How many hints were showing when the word was cracked. */
    hintsAtSolve: { hints: number; count: number }[];
    /** Sessions that ran out of time at least once. */
    timedOut: number;
    /** Sessions that used every try without solving (#24). */
    unsolved: number;
  };
  idleResets: { total: number; byStep: { step: string; count: number }[] };
  channels: { channel: string; count: number }[];
  callingCodes: { code: string; label: string; count: number }[];
  /** Sessions started per hour; `hour` is the hour's start in epoch ms. */
  hourly: { hour: number; count: number }[];
};

const STAGE_LABELS: [FunnelStage, string][] = [
  ["startedAt", "Started"],
  ["codeSentAt", "Code Sent"],
  ["verifiedAt", "Verified"],
  ["solvedAt", "Solved Puzzle"],
  ["boxOpenedAt", "Opened Box"],
];

const IDLE_STEPS = [
  "Choosing a channel",
  "Entering the code",
  "Playing the puzzle",
  // With tries left: out of tries is an unsolved puzzle, not a walk-away.
  "After timing out",
  "After solving",
] as const;

/** Where an idle-reset player walked away, from the furthest stage they reached. */
function idleStep(item: FunnelItem): (typeof IDLE_STEPS)[number] {
  if (item.solvedAt) return "After solving";
  if (item.timedOutAt) return "After timing out";
  if (item.verifiedAt) return "Playing the puzzle";
  if (item.codeSentAt) return "Entering the code";
  return "Choosing a channel";
}

const HOUR_MS = 60 * 60 * 1000;
// Fill in quiet hours up to two weeks of span; past that, list only active hours.
const MAX_FILLED_HOURS = 14 * 24;

/** Whether a session belongs in the puzzle stats: not 2FA-only, unless it then played anyway (the config changed). */
const inPuzzle = (item: FunnelItem) => !item.twoFactorOnly || typeof item.guesses === "number" || Boolean(item.timedOutAt);

function tally<T>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

/** Counts of each present value of `pick`, most common first. */
function countBy<K extends string>(items: FunnelItem[], pick: (item: FunnelItem) => string | undefined, key: K) {
  return [...tally(items.flatMap((item) => pick(item) ?? []))]
    .map(([value, count]) => ({ [key]: value, count }) as { [k in K]: string } & { count: number })
    .sort((a, b) => b.count - a.count);
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

function hourly(items: FunnelItem[]) {
  const counts = tally(items.flatMap((item) => (item.startedAt ? [Math.floor(item.startedAt / HOUR_MS) * HOUR_MS] : [])));
  let hours = [...counts.keys()].sort((a, b) => a - b);
  if (!hours.length) return [];
  const first = hours[0];
  const last = hours[hours.length - 1];
  // Quiet hours in between show as zero, so the chart's x-axis is real time.
  if ((last - first) / HOUR_MS <= MAX_FILLED_HOURS) {
    hours = [];
    for (let hour = first; hour <= last; hour += HOUR_MS) hours.push(hour);
  }
  return hours.map((hour) => ({ hour, count: counts.get(hour) || 0 }));
}

/** Aggregates the per-session funnel items into event-level stats; never returns a single session. */
export function summarizeFunnel(items: FunnelItem[]): FunnelStats {
  const stages = STAGE_LABELS.map(([key, label]) => ({
    stage: label,
    count: items.filter((item) => Boolean(item[key])).length,
  }));

  // Sessions recorded before #9 have solvedAt but none of the run details;
  // they still count as solves, just not towards guesses, time, or hints.
  const solves = items.filter((item) => item.solvedAt && inPuzzle(item));
  const detailed = solves.filter((item) => typeof item.guesses === "number");
  const verified = items.filter((item) => item.verifiedAt && inPuzzle(item)).length;
  const solveSeconds = detailed.flatMap((item) => (typeof item.solveMs === "number" ? [item.solveMs / 1000] : []));
  const hints = tally(detailed.flatMap((item) => (typeof item.hintsRevealed === "number" ? [item.hintsRevealed] : [])));
  const timedOut = items.filter((item) => item.timedOutAt).length;
  const puzzlePlayed = solves.length > 0 || timedOut > 0;
  const unsolved = items.filter((item) => item.unsolvedAt && !item.solvedAt).length;
  const idle = tally(items.filter((item) => item.idleResetAt && !item.unsolvedAt).map(idleStep));

  return {
    stages,
    prizes: countBy(items, (item) => item.prize, "name"),
    puzzle: {
      solved: solves.length,
      solveRate: puzzlePlayed && verified ? Math.min(1, solves.length / verified) : null,
      avgGuesses: round1(mean(detailed.map((item) => item.guesses as number))),
      avgSolveSeconds: round1(mean(solveSeconds)),
      medianSolveSeconds: round1(median(solveSeconds)),
      hintsAtSolve: [...hints.keys()].sort((a, b) => a - b).map((n) => ({ hints: n, count: hints.get(n) as number })),
      timedOut,
      unsolved,
    },
    idleResets: {
      total: [...idle.values()].reduce((a, b) => a + b, 0),
      byStep: IDLE_STEPS.filter((step) => idle.has(step)).map((step) => ({ step, count: idle.get(step) as number })),
    },
    channels: countBy(items, (item) => item.channel, "channel"),
    callingCodes: countBy(items, (item) => item.callingCode, "code").map((row) => ({
      ...row,
      label: callingCodeLabel(row.code),
    })),
    hourly: hourly(items),
  };
}

export async function getFunnelStats(): Promise<FunnelStats> {
  return summarizeFunnel((await listMapItems(FUNNEL_MAP)) as FunnelItem[]);
}

export async function resetFunnelStats() {
  await clearMap(FUNNEL_MAP);
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  // Quote anything with a delimiter, and defuse spreadsheet formulas (=, +, -, @).
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The stats as one long `section,label,value` table, for post-event
 * analysis in a spreadsheet. Aggregates only, the same as the page.
 */
export function funnelStatsCsv(stats: FunnelStats) {
  type Row = readonly [string, string | number, number | null];
  const rows: Row[] = [
    ...stats.stages.map((s) => ["funnel", s.stage, s.count] as Row),
    ["puzzle", "Solved", stats.puzzle.solved],
    ["puzzle", "Solve rate (of verified)", stats.puzzle.solveRate === null ? null : round1(stats.puzzle.solveRate * 100)],
    ["puzzle", "Average guesses", stats.puzzle.avgGuesses],
    ["puzzle", "Average seconds to solve", stats.puzzle.avgSolveSeconds],
    ["puzzle", "Median seconds to solve", stats.puzzle.medianSolveSeconds],
    ["puzzle", "Timed out", stats.puzzle.timedOut],
    ["puzzle", "Unsolved (out of tries)", stats.puzzle.unsolved],
    ...stats.puzzle.hintsAtSolve.map((h) => ["hints at solve", h.hints, h.count] as Row),
    ["idle resets", "Total", stats.idleResets.total],
    ...stats.idleResets.byStep.map((s) => ["idle resets", s.step, s.count] as Row),
    ...stats.prizes.map((p) => ["prizes", p.name, p.count] as Row),
    ...stats.channels.map((c) => ["channels", c.channel, c.count] as Row),
    ...stats.callingCodes.map((c) => ["calling codes", c.label, c.count] as Row),
    ...stats.hourly.map((h) => ["sessions per hour (UTC)", new Date(h.hour).toISOString(), h.count] as Row),
  ];
  return [["section", "label", "value"], ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
