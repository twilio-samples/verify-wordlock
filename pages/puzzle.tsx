import type { NextPage } from "next";
import PuzzleScreen from "../components/PuzzleScreen";
import { useRouter } from "next/router";
import { parseCookie } from "cookie";
import { getGameConfig } from "../utils/gameConfig";
import type { Mode } from "../utils/configSchema";
import { SESSION_COOKIE } from "../utils/funnel";
import { isVerified, startOrResumePuzzle, type PuzzleView } from "../utils/puzzleSession";
import { hasAlreadyWon } from "../utils/winnerPolicy";
import { claimBox, completeRoute } from "../utils/claimBox";
import PageShell from "../components/PageShell";
import { getCopy } from "../utils/copy";
import { kioskProps } from "../utils/kiosk";

type PuzzleProps = {
  attemptCount: number;
  maxAttempts: number;
  mode: Mode;
  view: PuzzleView;
};

const Puzzle: NextPage<PuzzleProps> = ({ attemptCount, maxAttempts, mode, view }) => {
  const copy = getCopy(mode).puzzle;
  const router = useRouter();

  const handlePuzzleSubmit = async (success: boolean) => {
    if (!success) {
      const response = await fetch("/api/failed", {
        method: "POST",
      });

      if (response.ok) {
        router.push("/failed");
        return;
      }
    } else {
      const channel = localStorage.getItem("channel");
      const address = localStorage.getItem("number");
      const claim = await claimBox(channel && address ? { channel, address } : undefined);
      if (!claim) {
        router.push({
          pathname: "/error",
        });
        return;
      }

      router.push(completeRoute(claim));
    }
  };

  return (
    <PageShell
      stage="crack"
      title={copy.title}
      subtitle={copy.subtitle}
    >
      <div className="puzzle-legend">
        <div className="puzzle-legend__row">
          <span className="legend-chip" style={{ background: "var(--amber)" }} />
          Right letter, wrong place
        </div>
        <div className="puzzle-legend__row">
          <span className="legend-chip" style={{ background: "var(--green)" }} />
          Right letter, right place
        </div>
      </div>

      <PuzzleScreen initialView={view} onSubmit={handlePuzzleSubmit} openLabel={copy.open} />

      <p className="fine center" style={{ marginTop: 18 }}>
        {maxAttempts - attemptCount} {maxAttempts - attemptCount === 1 ? "try" : "tries"} remaining
      </p>
    </PageShell>
  );
};

export async function getServerSideProps(ctx: any) {
  const cookies = parseCookie(ctx.req.headers.cookie || "");

  // The server's record, not the `verified` cookie, which anyone can set.
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId || !(await isVerified(sessionId))) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const config = await getGameConfig();

  if (hasAlreadyWon(config.winnerPolicy, cookies.winner, config.winnerResetAt)) {
    return { redirect: { destination: "/previousWinner", permanent: false } };
  }

  if (!config.puzzleEnabled) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const attemptCount = parseInt(cookies.attempt || "0", 10);
  if (attemptCount >= config.attempts) {
    return { redirect: { destination: "/failed", permanent: false } };
  }

  // The answer stays on the server; the page only gets what it renders.
  const view = await startOrResumePuzzle(sessionId, config);
  return { props: { attemptCount, maxAttempts: config.attempts, mode: config.mode, view, ...kioskProps(config) } };
}

export default Puzzle;
