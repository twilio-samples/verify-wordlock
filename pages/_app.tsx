import { Theme } from "@twilio-paste/core/theme";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { IdlePauseContext, KioskContext } from "../components/KioskContext";
import IdleGuard from "../components/IdleGuard";
import type { KioskSettings } from "../utils/kiosk";
import "./global.css";

const KIOSK_STORAGE_KEY = "kiosk";
import "intl-tel-input/styles";
const MyApp: React.FC<React.PropsWithChildren<AppProps<{ kiosk?: KioskSettings | null }>>> = ({
  Component,
  pageProps,
  router,
}) => {
  // Attendee pages pass `kiosk` from getServerSideProps (see utils/kiosk.ts).
  // Pages that can't (the static /error page) keep the last known value --
  // remembered for the tab, so it survives a reload -- and a kiosk that lands
  // on them still resets itself when the player walks away.
  const lastKiosk = useRef<KioskSettings | null>(null);
  const [storedKiosk, setStoredKiosk] = useState<KioskSettings | null>(null);
  // Staff pages never get the kiosk shell.
  const staffPage = /^\/(admin|stats)(\/|$)/.test(router.pathname);
  const known = pageProps.kiosk !== undefined || staffPage;
  if (known) lastKiosk.current = pageProps.kiosk ?? null;
  const kiosk = known ? lastKiosk.current : lastKiosk.current ?? storedKiosk;
  // The puzzle pauses the idle reset while its own clock runs.
  const [idlePaused, setIdlePaused] = useState(false);

  useEffect(() => {
    if (pageProps.kiosk !== undefined) {
      if (pageProps.kiosk) sessionStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(pageProps.kiosk));
      else sessionStorage.removeItem(KIOSK_STORAGE_KEY);
    } else if (!staffPage && !lastKiosk.current) {
      // Read after hydration, so server and client render the same markup.
      const stored = sessionStorage.getItem(KIOSK_STORAGE_KEY);
      setStoredKiosk(stored ? (JSON.parse(stored) as KioskSettings) : null);
    }
  }, [pageProps.kiosk, staffPage]);
  return (
    <Theme.Provider theme="dark">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1a1d22" />
      </Head>
      <KioskContext.Provider value={kiosk}>
        <IdlePauseContext.Provider value={setIdlePaused}>
          <div className={kiosk ? "kiosk" : undefined}>
            <Component {...pageProps} />
          </div>
          {kiosk && <IdleGuard timeoutSeconds={kiosk.idleTimeoutSeconds} paused={idlePaused} />}
        </IdlePauseContext.Provider>
      </KioskContext.Provider>
    </Theme.Provider>
  );
};

export default MyApp;
