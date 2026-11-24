import type { NextPage } from "next";
import PageShell from "../components/PageShell";
import { getCopy } from "../utils/copy";
import { getGameConfig } from "../utils/gameConfig";
import type { Mode } from "../utils/configSchema";
import { kioskProps } from "../utils/kiosk";
import Confetti from "../components/Confetti";
import StartOverButton from "../components/StartOverButton";

const Complete: NextPage<{ prize: string; boxNumber: string; mode: Mode }> = ({
  prize,
  boxNumber,
  mode,
}) => {
  const copy = getCopy(mode).complete;
  return (
    <PageShell
      stage="claim"
      stageState="success"
      eyebrow={copy.eyebrow}
      title={copy.title}
    >
      <Confetti />
      <p className="win-cta">
        <span className="win-cta__icon" aria-hidden="true">
          ➜
        </span>
        {copy.claim(prize, boxNumber)}
      </p>
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

export async function getServerSideProps(ctx: any) {
  const config = await getGameConfig();
  return {
    props: { prize: String(ctx.query.prize ?? ""), boxNumber: String(ctx.query.boxNumber ?? ""), mode: config.mode, ...kioskProps(config) },
  };
}

export default Complete;
