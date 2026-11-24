import type { NextPage } from "next";
import ChannelPicker from "../components/ChannelPicker";
import { randomUUID } from "crypto";
import { parseCookie, stringifySetCookie } from "cookie";
import { SESSION_COOKIE, trackFunnelEvent } from "../utils/funnel";
import { getGameConfig } from "../utils/gameConfig";
import { hasAlreadyWon } from "../utils/winnerPolicy";
import PageShell from "../components/PageShell";
import { getCopy } from "../utils/copy";
import type { Mode } from "../utils/configSchema";
import { kioskProps } from "../utils/kiosk";

type Props = { mode: Mode; defaultCountry: string; commonCountries: string[] };

const Channel: NextPage<Props> = ({ mode, defaultCountry, commonCountries }) => {
  const copy = getCopy(mode).channel;
  return (
    <PageShell
      stage="verify"
      className="channel-page"
      title={copy.title}
      subtitle={copy.subtitle}
      backHref="/"
    >
      <p className="fine channel-page__storage">
        {copy.storageNote}
        {mode === "device" && " (Yes, you can build things like this with Twilio.)"}
      </p>

      <ChannelPicker
        phoneHint={copy.personalNumber}
        countryHelp={copy.countryHelp}
        defaultCountry={defaultCountry}
        commonCountries={commonCountries}
      />

      <p className="fine channel-page__consent">
        {copy.consent} See our{" "}
        <a href="/privacy-policy" target="_blank">
          Privacy Policy
        </a>
        .
      </p>
    </PageShell>
  );
};

export async function getServerSideProps(ctx: any) {
  const cookies = parseCookie(ctx.req.headers.cookie || "");

  const config = await getGameConfig();
  if (hasAlreadyWon(config.winnerPolicy, cookies.winner, config.winnerResetAt)) {
    return { redirect: { destination: "/previousWinner", permanent: false } };
  }

  let sessionId = cookies[SESSION_COOKIE];

  if (!sessionId) {
    sessionId = randomUUID();
    const cookie = stringifySetCookie({
      name: SESSION_COOKIE,
      value: sessionId,
      maxAge: 60 * 60 * 24,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    ctx.res.setHeader("Set-Cookie", cookie);
  }

  await trackFunnelEvent(sessionId, { startedAt: Date.now() });

  return {
    props: {
      mode: config.mode,
      defaultCountry: config.defaultCountry,
      commonCountries: config.commonCountries,
      ...kioskProps(config),
    },
  };
}

export default Channel;
