import type { NextPage } from "next";
import PageShell from "../components/PageShell";
import StartOverButton from "../components/StartOverButton";
import { COPY } from "../utils/copy";

// Static on purpose: this page is where we land when config or Igloo
// loading fails, so it must not depend on either.
const copy = COPY.device.error;

const ErrorPage: NextPage = () => {
  return (
    <PageShell
      hideStrip
      eyebrow={copy.eyebrow}
      title={copy.title}
    >
      <p className="lede">{copy.lede}</p>
      {/* Kiosk settings come from the last page (see _app). */}
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

export default ErrorPage;
