import { useEffect, useState } from "react";
import { CONFETTI_MAX_MS, makeConfetti, type ConfettiPiece } from "../utils/confetti";

/**
 * A one-shot confetti burst for the win state (#8). Decorative only: hidden
 * from screen readers, never takes taps, and skipped entirely when the
 * attendee has asked for reduced motion. Rendered after mount, so the random
 * pieces can't cause a hydration mismatch.
 */
const Confetti = ({ count = 80 }: { count?: number }) => {
  const [pieces, setPieces] = useState<ConfettiPiece[] | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setPieces(makeConfetti(count));
    const done = setTimeout(() => setPieces(null), CONFETTI_MAX_MS);
    return () => clearTimeout(done);
  }, [count]);

  if (!pieces) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti__piece"
          style={{
            left: `${p.left}%`,
            width: p.width,
            height: p.height,
            background: p.color,
            animationDelay: `${p.delayMs}ms`,
            animationDuration: `${p.durationMs}ms`,
            ["--drift" as string]: `${p.drift}px`,
            ["--spin" as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
};

export default Confetti;
