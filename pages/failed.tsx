import type { NextPage } from "next";
import { parseCookie } from "cookie";
import PageShell from "../components/PageShell";
import StartOverButton from "../components/StartOverButton";
import { getCopy } from "../utils/copy";
import { getGameConfig } from "../utils/gameConfig";
import type { Mode } from "../utils/configSchema";
import { kioskProps } from "../utils/kiosk";
import { remainingTries } from "../utils/playerSession";

type FailedProps = { mode: Mode; triesLeft: number };

const Failed: NextPage<FailedProps> = ({ mode, triesLeft }) => {
  const copy = getCopy(mode).failed;

  // Timed out with tries left (#22): the next try is a new run with a full clock.
  if (triesLeft > 0) {
    return (
      <PageShell stage="crack" stageState="fail" eyebrow={copy.eyebrow} title={copy.retryTitle}>
        <p className="lede">{copy.retryLede(triesLeft)}</p>
        <a className="btn btn-primary" href="/puzzle">
          {copy.retry(triesLeft)}
        </a>
      </PageShell>
    );
  }

  return (
    <PageShell
      stage="crack"
      stageState="fail"
      eyebrow={copy.eyebrow}
      title={copy.title}
    >
      <p className="lede">{copy.lede}</p>
      <StartOverButton />
      <hr className="rule" />
      <p className="fine">{copy.consolation}</p>
      <p className="fine" style={{ marginTop: 10 }}>
        Learn how Twilio Verify secures sign-ups, step-up auth, and trusted
        pickups using SMS, Voice, WhatsApp, email OTP, and push at{" "}
        <a href="https://twilio.com/verify">twilio.com/verify</a>.
      </p>
    </PageShell>
  );
};

export async function getServerSideProps(ctx: any) {
  const config = await getGameConfig();
  // The attempt cookie is httpOnly, so the count is read here.
  const { attempt } = parseCookie(ctx.req.headers.cookie || "");
  return { props: { mode: config.mode, triesLeft: remainingTries(attempt, config.attempts), ...kioskProps(config) } };
}

export default Failed;
