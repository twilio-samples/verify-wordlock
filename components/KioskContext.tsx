import { createContext, useContext, useEffect } from "react";
import type { KioskSettings } from "../utils/kiosk";

/** Provided by _app from the page's `kiosk` prop; null in device mode. */
export const KioskContext = createContext<KioskSettings | null>(null);

export const useKiosk = () => useContext(KioskContext);

/** Provided by _app: lets a page hold off the idle reset (see usePauseIdle). */
export const IdlePauseContext = createContext<(paused: boolean) => void>(() => {});

/** Holds off the kiosk idle reset and its "Still there?" dialog while `paused` is true; unmounting lets it run again. */
export function usePauseIdle(paused: boolean) {
  const setPaused = useContext(IdlePauseContext);
  useEffect(() => {
    setPaused(paused);
    return () => setPaused(false);
  }, [paused, setPaused]);
}
