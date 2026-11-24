import { useKiosk } from "./KioskContext";

/**
 * Kiosk final pages (#23): hands the tablet to the next player without
 * waiting out the idle timeout. The start screen clears the last player's
 * run and cookies; with no idle tag, it isn't counted as a walk-away.
 */
const StartOverButton = () => {
  const kiosk = useKiosk();
  if (!kiosk) return null;
  return (
    <a className="btn btn-ghost" href="/">
      Start over
    </a>
  );
};

export default StartOverButton;
