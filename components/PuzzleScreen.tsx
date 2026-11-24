import { useEffect, useRef, useState } from "react";
import type { PuzzleView } from "../utils/puzzleSession";
import { applyKey, ENTER } from "../utils/virtualKeyboard";
import { setBrowserVaultLed } from "../utils/vaultLedBrowser";
import { useKiosk, usePauseIdle } from "./KioskContext";
import VirtualKeyboard from "./VirtualKeyboard";

const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

type PuzzleScreenProps = {
  initialView: PuzzleView;
  /** Called once: true when solved and the attendee taps the open button, false on timeout. */
  onSubmit: (success: boolean) => void;
  openLabel: string;
};

/**
 * The passphrase cracker. Scoring happens on the server (/api/puzzle/guess);
 * this component only ever sees the word's length, scored guesses, and the
 * hints revealed so far.
 *
 * Typing goes into one real <input> laid over the tiles, so native mobile
 * keyboards, paste, and autocapitalize all work for any word length; the
 * tiles just render its value. In kiosk mode the branded on-screen keyboard
 * types into it instead and the OS keyboard stays down (#7).
 */
const PuzzleScreen = ({ initialView, onSubmit, openLabel }: PuzzleScreenProps) => {
  const [view, setView] = useState(initialView);
  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialView.secondsLeft);
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const kiosk = useKiosk();
  const { wordLength } = view;
  // No "Still there?" while the clock runs; it ends an abandoned game itself.
  // Once solved, the idle reset is back on in case nobody taps to open.
  usePauseIdle(!view.solved && secondsLeft > 0);

  const finish = (success: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onSubmit(success);
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (view.solved) return;
    if (secondsLeft <= 0) {
      // A guess sent as the clock ran out may still be the winner: the
      // server allows a short grace, so wait for its answer.
      if (!submitting) finish(false);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, view.solved, submitting]);

  const submit = async () => {
    if (submitting || view.solved || finished.current) return;
    if (guess.length !== wordLength) {
      setMessage(`Please enter all ${wordLength} letters.`);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/puzzle/guess", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.reason === "expired" || data.reason === "no-session") {
          finish(false);
          return;
        }
        if (data.reason === "solved") {
          // Already cracked: a winning answer got lost on the way back, or
          // another tab solved it. Show the open button.
          setView((current) => ({ ...current, solved: true }));
          setMessage("");
          return;
        }
        setMessage(data.message || "Something went wrong. Try again.");
        return;
      }
      const next = data as PuzzleView;
      // Green on the solving guess, like the server route (pages/api/puzzle/guess.ts).
      if (next.solved) setBrowserVaultLed(kiosk, "solved");
      setView(next);
      // Re-sync with the server clock on every guess.
      setSecondsLeft(next.secondsLeft);
      setGuess("");
      setMessage("");
    } catch {
      setMessage("Network hiccup — try that guess again.");
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const onChange = (value: string) => {
    setGuess(value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, wordLength));
    setMessage("");
  };

  const onVirtualKey = (key: string) => {
    if (key === ENTER) {
      submit();
      return;
    }
    onChange(applyKey(guess, key, "alpha", wordLength));
  };

  const isLow = secondsLeft <= 30;
  const hintCount = view.revealedHints.length;

  return (
    <div>
      <div className={`timer${isLow ? " timer--low" : ""}`} role="timer">
        <span className="timer__label">Time left</span>
        {formatClock(Math.max(0, secondsLeft))}
      </div>

      <div className="guesses" style={{ ["--tiles" as string]: wordLength }}>
        {view.guesses.map((scored, gIndex) => (
          <div
            key={gIndex}
            className="tiles"
            role="img"
            aria-label={`Guess ${gIndex + 1}: ${scored.map((s) => `${s.letter} ${s.color}`).join(", ")}`}
          >
            {scored.map((s, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`tile tile--static tile--${s.color} tile--reveal`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {s.letter}
              </span>
            ))}
          </div>
        ))}

        {!view.solved && (
          <label className="tiles tiles--entry" style={{ marginTop: view.guesses.length ? 4 : 0 }}>
            <span className="sr-only">Your {wordLength}-letter guess</span>
            <input
              ref={inputRef}
              className="tiles__input"
              value={guess}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              maxLength={wordLength}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              inputMode={kiosk ? "none" : undefined}
            />
            {Array.from({ length: wordLength }, (_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`tile tile--static${guess[i] ? " tile--filled" : ""}${i === guess.length ? " tile--cursor" : ""}`}
              >
                {guess[i] ?? ""}
              </span>
            ))}
          </label>
        )}
      </div>

      {view.solved ? (
        <button className="btn btn-primary" onClick={() => finish(true)}>
          {openLabel}
        </button>
      ) : (
        <>
          {hintCount > 0 && (
            <ol className="hints" aria-live="polite" aria-label="Hints">
              {view.revealedHints.map((hint, i) => (
                <li key={i} className={`banner banner--hint${i === hintCount - 1 ? " banner--fresh" : ""}`}>
                  <strong>Hint {i + 1}:</strong> {hint}
                </li>
              ))}
            </ol>
          )}
          {view.guessesUntilNextHint !== null && view.guesses.length > 0 && (
            <p className="fine center">
              Next hint after {view.guessesUntilNextHint} more wrong{" "}
              {view.guessesUntilNextHint === 1 ? "guess" : "guesses"}.
            </p>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Checking…" : "Submit guess"}
          </button>
          {message && (
            <span className="hint-text center" role="alert">
              {message}
            </span>
          )}
          {kiosk && <VirtualKeyboard layout="alpha" onKey={onVirtualKey} enterDisabled={submitting} />}
        </>
      )}
    </div>
  );
};

export default PuzzleScreen;
