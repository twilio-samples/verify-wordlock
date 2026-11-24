import { useEffect, useRef, useState } from "react";
import { BACKSPACE, ENTER, LAYOUTS, SPACER, type KeyboardLayout } from "../utils/virtualKeyboard";

const LABELS: Record<string, string> = { [BACKSPACE]: "⌫", [ENTER]: "Enter" };
const ARIA: Record<string, string> = { [BACKSPACE]: "Delete", [ENTER]: "Submit" };

type VirtualKeyboardProps = {
  layout: KeyboardLayout;
  onKey: (key: string) => void;
  /** Disables the Enter key, e.g. while a guess is being checked. */
  enterDisabled?: boolean;
};

/**
 * Kiosk-only on-screen keyboard (#7). Inputs it drives set inputMode="none"
 * so the OS keyboard stays down; keys don't take focus, so the input keeps
 * its focus ring while the attendee taps.
 */
const VirtualKeyboard = ({ layout, onKey, enterDisabled = false }: VirtualKeyboardProps) => {
  const [pressed, setPressed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const press = (key: string) => {
    // :active alone is unreliable on touchscreens, so flash the key too.
    setPressed(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPressed(null), 140);
    navigator.vibrate?.(10);
    onKey(key);
  };

  return (
    <div className={`vkb${layout === "alpha" ? "" : " vkb--pad"}`} role="group" aria-label="On-screen keyboard">
      {LAYOUTS[layout].map((row, r) => (
        <div key={r} className="vkb__row">
          {row.map((key, k) => {
            if (key === SPACER) return <span key={`spacer-${k}`} className="vkb__key vkb__key--spacer" aria-hidden="true" />;
            const special = key === BACKSPACE || key === ENTER;
            return (
              <button
                key={key}
                type="button"
                className={[
                  "vkb__key",
                  special && layout === "alpha" ? "vkb__key--wide" : "",
                  key === ENTER ? "vkb__key--enter" : "",
                  pressed === key ? "vkb__key--pressed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={ARIA[key]}
                disabled={key === ENTER && enterDisabled}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => press(key)}
              >
                {LABELS[key] ?? key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default VirtualKeyboard;
