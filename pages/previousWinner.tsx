import type { NextPage } from "next";
import PageShell from "../components/PageShell";
import StartOverButton from "../components/StartOverButton";
import { getGameConfig } from "../utils/gameConfig";
import type { WinnerPolicy } from "../utils/winnerPolicy";
import { kioskProps } from "../utils/kiosk";

type PreviousWinnerProps = {
  winnerPolicy: Exclude<WinnerPolicy, "infinite">;
};

const COPY: Record<PreviousWinnerProps["winnerPolicy"], { eyebrow: string; title: string; lede: string }> = {
  oncePerDay: {
    eyebrow: "Already claimed today",
    title: "You've won already today 🥳",
    lede: "Come back tomorrow to play again!",
  },
  lifetime: {
    eyebrow: "Already claimed",
    title: "You've already won 🥳",
    lede: "Thanks for playing — it's a one-time prize per person.",
  },
};

const PreviousWinner: NextPage<PreviousWinnerProps> = ({ winnerPolicy }) => {
  const { eyebrow, title, lede } = COPY[winnerPolicy];

  return (
    <PageShell stage="claim" stageState="success" eyebrow={eyebrow} title={title}>
      <p className="lede">{lede}</p>
      <StartOverButton />
      <hr className="rule" />
      <p className="fine">
        To learn more about how you can use Verify to solve your user
        authentication and identity puzzles, visit{" "}
        <a href="https://twilio.com/verify">twilio.com/verify</a>
      </p>
    </PageShell>
  );
};

export async function getServerSideProps() {
  const config = await getGameConfig();

  if (config.winnerPolicy === "infinite") {
    return { redirect: { destination: "/", permanent: false } };
  }

  return { props: { winnerPolicy: config.winnerPolicy, ...kioskProps(config) } };
}

export default PreviousWinner;
