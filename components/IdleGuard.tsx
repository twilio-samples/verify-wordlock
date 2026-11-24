import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { clearPlayerStorage, IDLE_RESET_PARAM, idleState, type IdleState } from "../utils/kiosk";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "input"] as const;

/**
 * Kiosk idle reset (#4) with the "Still there?" warning (#10). After
 * `timeoutSeconds` without a touch or keypress, sends the tablet back to the
 * start screen, whose getServerSideProps ends the run and clears the
 * player's cookies. Any interaction, including with the dialog, counts as
 * activity and restarts the full window; extends are unlimited.
 *
 * `paused` holds it off entirely, e.g. while the puzzle clock runs: that
 * clock already ends an abandoned game, so the dialog would only interrupt
 * someone thinking. Unpausing restarts the full window.
 */
const IdleGuard = ({ timeoutSeconds, paused = false }: { timeoutSeconds: number; paused?: boolean }) => {
  const router = useRouter();
  const lastActivity = useRef(Date.now());
  const [state, setState] = useState<IdleState>({ phase: "active" });
  const extendRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The start screen is already the reset state.
  const enabled = router.pathname !== "/" && !paused;

  const extend = () => {
    lastActivity.current = Date.now();
    setState({ phase: "active" });
  };

  const resetNow = () => {
    setState({ phase: "reset" });
    // Here as well as on the start screen, in case it redirects to /error.
    clearPlayerStorage();
    // Tagged so the start screen can count the walk-away in /stats (#9).
    window.location.assign(`/?${IDLE_RESET_PARAM}=1`);
  };

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    setState({ phase: "active" });

    const onActivity = (event: Event) => {
      // Taps inside the dialog are handled by its buttons; dismissing it on
      // pointerdown would swallow a "Start over" tap.
      if (dialogRef.current?.contains(event.target as Node)) return;
      extend();
    };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { capture: true, passive: true });

    const tick = setInterval(() => {
      const next = idleState(Date.now() - lastActivity.current, timeoutSeconds);
      if (next.phase === "reset") {
        clearInterval(tick);
        resetNow();
        return;
      }
      setState((prev) =>
        prev.phase === next.phase && (prev.phase !== "warning" || prev.secondsLeft === (next as typeof prev).secondsLeft)
          ? prev
          : next
      );
    }, 250);

    return () => {
      clearInterval(tick);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, { capture: true });
    };
  }, [enabled, timeoutSeconds, router.asPath]);

  const warning = state.phase === "warning";
  useEffect(() => {
    if (warning) extendRef.current?.focus();
  }, [warning]);

  if (!enabled || state.phase === "active") return null;

  return (
    <div className="idle-overlay">
      <div
        ref={dialogRef}
        className="plate idle-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-desc"
      >
        <div className="plate__rivet-tl" />
        <div className="plate__rivet-tr" />
        <h2 id="idle-title" className="display">
          Still there?
        </h2>
        {state.phase === "warning" ? (
          <>
            <p id="idle-desc" className="lede">
              This kiosk resets for the next player in
            </p>
            <p className="idle-dialog__count" aria-live="polite" aria-atomic="true">
              {state.secondsLeft}
              <span className="sr-only"> seconds</span>
            </p>
            <div className="stack idle-dialog__actions">
              <button ref={extendRef} type="button" className="btn btn-primary" onClick={extend}>
                I&apos;m still here
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetNow}>
                Start over
              </button>
            </div>
          </>
        ) : (
          <p id="idle-desc" className="lede">
            Resetting…
          </p>
        )}
      </div>
    </div>
  );
};

export default IdleGuard;
