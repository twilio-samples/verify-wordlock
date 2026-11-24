import { Box } from "@twilio-paste/core/box";
import { Heading } from "@twilio-paste/core/heading";
import { Paragraph } from "@twilio-paste/core/paragraph";
import { Separator } from "@twilio-paste/core/separator";
import { SkeletonLoader } from "@twilio-paste/core/skeleton-loader";
import { Button } from "@twilio-paste/core/button";
import { Stack } from "@twilio-paste/core/stack";
import { Text } from "@twilio-paste/core/text";
import { Table, THead, TBody, Tr, Th, Td } from "@twilio-paste/core/table";
import react from "react";
import type { NextPage } from "next";
import Head from "next/head";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { FunnelStats } from "../utils/funnel";

const BAR_COLOR = "var(--amber)";
const GRID_COLOR = "var(--border)";
const AXIS_COLOR = "var(--ink-faint)";
const LABEL_COLOR = "var(--ink)";
// Live enough for a booth screen, light enough on Sync.
const REFRESH_MS = 30_000;

const CHANNEL_LABELS: Record<string, string> = { sms: "SMS", call: "Voice call", whatsapp: "WhatsApp" };

/** A horizontal bar chart of `count` per `labelKey`, sized to its rows. */
const CountChart = ({ data, labelKey, labelWidth = 140 }: { data: object[]; labelKey: string; labelWidth?: number }) => (
  <Box height={`${Math.max(120, data.length * 48)}px`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
        <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
        <XAxis type="number" allowDecimals={false} stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR }} />
        <YAxis type="category" dataKey={labelKey} width={labelWidth} stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR }} />
        <Tooltip />
        <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={32}>
          <LabelList dataKey="count" position="right" fill={LABEL_COLOR} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </Box>
);

const Fact = ({ label, value }: { label: string; value: string }) => (
  <Box borderStyle="solid" borderWidth="borderWidth10" borderColor="colorBorderWeak" borderRadius="borderRadius30" padding="space50" minWidth="size20">
    <Text as="div" fontSize="fontSize70" fontWeight="fontWeightBold" lineHeight="lineHeight70">
      {value}
    </Text>
    <Text as="div" color="colorTextWeak">
      {label}
    </Text>
  </Box>
);

const Section = ({ title, children }: { title: string; children: react.ReactNode }) => (
  <>
    <Separator orientation="horizontal" verticalSpacing="space80" />
    <Heading as="h2" variant="heading30">
      {title}
    </Heading>
    {children}
  </>
);

const orDash = (value: number | null, format: (n: number) => string = String) => (value === null ? "—" : format(value));

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

const hourLabel = (hour: number) =>
  new Date(hour).toLocaleString(undefined, { weekday: "short", hour: "numeric" });

const Stats: NextPage = () => {
  const [stats, setStats] = react.useState<FunnelStats | null>(null);
  const [error, setError] = react.useState("");
  const [updatedAt, setUpdatedAt] = react.useState<Date | null>(null);
  const [resetting, setResetting] = react.useState(false);

  const fetchStats = react.useCallback(async () => {
    try {
      const response = await fetch("/api/admin/stats");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStats(await response.json());
      setUpdatedAt(new Date());
      setError("");
    } catch {
      setError("Couldn't refresh the stats; showing the last numbers loaded.");
    }
  }, []);

  react.useEffect(() => {
    fetchStats();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchStats();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchStats]);

  const resetStats = async () => {
    if (!window.confirm("Reset all funnel stats? This can't be undone. Download the CSV first if you need it.")) {
      return;
    }
    setResetting(true);
    await fetch("/api/admin/resetStats", { method: "POST" });
    await fetchStats();
    setResetting(false);
  };

  const stages = stats?.stages || [];
  const started = stages[0]?.count || 0;
  const verified = stages.find((s) => s.stage === "Verified")?.count || 0;
  const hourly = (stats?.hourly || []).map((h) => ({ ...h, label: hourLabel(h.hour) }));
  const busiest = hourly.reduce<(typeof hourly)[number] | null>((top, h) => (!top || h.count > top.count ? h : top), null);

  return (
    <Box as="main" padding="space70">
      <Head>
        <title>Stats · Twilio Wordlock</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Heading as="h1" variant="heading10">
        Stats
      </Heading>
      <Paragraph>
        Event-wide numbers, powered by Twilio Sync. Aggregates only: no phone numbers are stored, just the country
        calling code.
        {updatedAt && ` Updated ${updatedAt.toLocaleTimeString()}; refreshes every ${REFRESH_MS / 1000}s.`}
      </Paragraph>
      {error && (
        <Paragraph>
          <Text as="span" color="colorTextError">
            {error}
          </Text>
        </Paragraph>
      )}
      <Separator orientation="horizontal" verticalSpacing="space80" />

      {!stats && <SkeletonLoader />}

      {stats && (
        <>
          <Stack orientation={["vertical", "horizontal"]} spacing="space50">
            <Fact label="Sessions started" value={String(started)} />
            <Fact label="Verified a phone" value={String(verified)} />
            <Fact label="Solve rate (of verified)" value={orDash(stats.puzzle.solveRate, (r) => `${Math.round(r * 100)}%`)} />
            <Fact label="Average guesses to solve" value={orDash(stats.puzzle.avgGuesses)} />
            <Fact label="Median time to solve" value={orDash(stats.puzzle.medianSolveSeconds, formatDuration)} />
            <Fact label="Busiest hour (local time)" value={busiest && busiest.count ? `${busiest.label} (${busiest.count})` : "—"} />
          </Stack>

          <Section title="Funnel">
            <CountChart data={stages} labelKey="stage" labelWidth={110} />
            <Table>
              <THead>
                <Tr>
                  <Th>Stage</Th>
                  <Th>Count</Th>
                  <Th>% of started</Th>
                  <Th>Drop-off from previous</Th>
                </Tr>
              </THead>
              <TBody>
                {stages.map((s, i) => {
                  const pctOfStarted = started ? Math.round((s.count / started) * 100) : 0;
                  const prev = stages[i - 1]?.count;
                  const dropOff = i > 0 && prev ? Math.round(((prev - s.count) / prev) * 100) : 0;
                  return (
                    <Tr key={s.stage}>
                      <Td>{s.stage}</Td>
                      <Td>{s.count}</Td>
                      <Td>{pctOfStarted}%</Td>
                      <Td>{i === 0 ? "—" : `${dropOff}%`}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Section>

          <Section title="Puzzle">
            <Table>
              <TBody>
                <Tr>
                  <Td>Puzzles solved</Td>
                  <Td>{stats.puzzle.solved}</Td>
                </Tr>
                <Tr>
                  <Td>Average / median time to solve</Td>
                  <Td>
                    {orDash(stats.puzzle.avgSolveSeconds, formatDuration)} /{" "}
                    {orDash(stats.puzzle.medianSolveSeconds, formatDuration)}
                  </Td>
                </Tr>
                <Tr>
                  <Td>Sessions that ran out of time</Td>
                  <Td>{stats.puzzle.timedOut}</Td>
                </Tr>
                <Tr>
                  <Td>Unsolved puzzles (used every try)</Td>
                  <Td>{stats.puzzle.unsolved}</Td>
                </Tr>
              </TBody>
            </Table>
            <Heading as="h3" variant="heading40">
              Hints showing when the word was cracked
            </Heading>
            {stats.puzzle.hintsAtSolve.length === 0 ? (
              <Paragraph>No puzzles solved yet.</Paragraph>
            ) : (
              <CountChart
                data={stats.puzzle.hintsAtSolve.map((h) => ({ ...h, label: h.hints === 1 ? "1 hint" : `${h.hints} hints` }))}
                labelKey="label"
                labelWidth={80}
              />
            )}
          </Section>

          <Section title="Walk-aways (kiosk idle resets)">
            {stats.idleResets.total === 0 ? (
              <Paragraph>No idle resets yet.</Paragraph>
            ) : (
              <>
                <Paragraph>
                  {stats.idleResets.total} player{stats.idleResets.total === 1 ? "" : "s"} left the kiosk mid-run, by
                  where they stopped:
                </Paragraph>
                <CountChart data={stats.idleResets.byStep} labelKey="step" labelWidth={150} />
              </>
            )}
          </Section>

          <Section title="Verification channel">
            {stats.channels.length === 0 ? (
              <Paragraph>No codes sent yet.</Paragraph>
            ) : (
              <CountChart
                data={stats.channels.map((c) => ({ ...c, label: CHANNEL_LABELS[c.channel] || c.channel }))}
                labelKey="label"
                labelWidth={110}
              />
            )}
          </Section>

          <Section title="Where players are from (calling code)">
            {stats.callingCodes.length === 0 ? (
              <Paragraph>No codes sent yet.</Paragraph>
            ) : (
              <>
                <CountChart data={stats.callingCodes.slice(0, 15)} labelKey="label" labelWidth={220} />
                {stats.callingCodes.length > 15 && (
                  <Paragraph>Top 15 of {stats.callingCodes.length} codes. The CSV has all of them.</Paragraph>
                )}
              </>
            )}
          </Section>

          <Section title="Sessions started per hour (your local time)">
            {hourly.length === 0 ? (
              <Paragraph>No sessions yet.</Paragraph>
            ) : (
              <Box height="260px">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourly} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                    <XAxis dataKey="label" stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR }} minTickGap={16} />
                    <YAxis allowDecimals={false} stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR }} />
                    <Tooltip />
                    <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Section>

          <Section title="Prizes won">
            {stats.prizes.length === 0 ? (
              <Paragraph>No prizes won yet.</Paragraph>
            ) : (
              <CountChart data={stats.prizes} labelKey="name" />
            )}
          </Section>

          <Separator orientation="horizontal" verticalSpacing="space80" />
          <Stack orientation="horizontal" spacing="space50">
            <Button variant="secondary" as="a" href="/api/admin/stats?format=csv">
              Download CSV
            </Button>
            <Button variant="destructive_secondary" onClick={resetStats} disabled={resetting}>
              {resetting ? "Resetting..." : "Reset stats"}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
};

export default Stats;
