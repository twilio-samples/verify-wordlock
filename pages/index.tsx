import type { NextPage } from "next";
import { useEffect } from "react";
import PageShell from "../components/PageShell";
import { getGameConfig } from "../utils/gameConfig";
import { ensureIglooToken } from "../utils/iglooToken";
import { getCopy } from "../utils/copy";
import type { Mode } from "../utils/configSchema";
import { parseCookie } from "cookie";
import { clearPlayerStorage, IDLE_RESET_PARAM, kioskProps, type KioskSettings } from "../utils/kiosk";
import { SESSION_COOKIE, trackIdleReset } from "../utils/funnel";
import { resetPlayer } from "../utils/playerSession";
import { setVaultLed } from "../utils/vaultLed";
import { setBrowserVaultLed } from "../utils/vaultLedBrowser";

type HomeProps = { skipPuzzle: boolean; mode: Mode; kiosk: KioskSettings | null };

const Home: NextPage<HomeProps> = ({ skipPuzzle, mode, kiosk }) => {
  const copy = getCopy(mode).home;
  useEffect(() => {
    if (!kiosk) return;
    clearPlayerStorage();
    // The server already sent red, unless the kiosk browser drives the LED.
    setBrowserVaultLed(kiosk, "reset");
    // Counted once server-side; drop the idle tag so a reload can't count it again.
    if (window.location.search) window.history.replaceState(null, "", "/");
  }, [kiosk]);
  return (
    <PageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={skipPuzzle ? copy.subtitle2faOnly : copy.subtitlePuzzle}
    >
      <a className="btn btn-primary" href="/channel">
        {copy.cta}
      </a>
    </PageShell>
  );
};

export async function getServerSideProps(ctx: any) {
  const config = await getGameConfig();
  // Kiosk: the start screen is where the next person begins, so nothing of
  // the last player's run (verification, attempts, win) carries over. Done
  // before anything that can redirect away.
  if (config.mode === "kiosk") {
    if (ctx.query?.[IDLE_RESET_PARAM]) {
      await trackIdleReset(parseCookie(ctx.req.headers.cookie || "")[SESSION_COOKIE]);
    }
    await resetPlayer(ctx.req.headers.cookie, ctx.res);
    setVaultLed(config, "reset");
  }

  const iglooToken = await ensureIglooToken();
  if (!iglooToken) {
    return { redirect: { destination: "/error", permanent: false } };
  }

  return { props: { skipPuzzle: !config.puzzleEnabled, mode: config.mode, ...kioskProps(config) } };
}

export default Home;
