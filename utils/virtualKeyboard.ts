/** Layouts for the kiosk's on-screen keyboard (#7): letters for the puzzle, a phone pad, and a code pad. */
export type KeyboardLayout = "alpha" | "phone" | "digits";

export const BACKSPACE = "backspace";
export const ENTER = "enter";
/** An empty cell that keeps the numpad grid aligned. */
export const SPACER = "";

export const LAYOUTS: Record<KeyboardLayout, string[][]> = {
  alpha: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    [ENTER, "Z", "X", "C", "V", "B", "N", "M", BACKSPACE],
  ],
  phone: [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["+", "0", BACKSPACE],
  ],
  digits: [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [SPACER, "0", BACKSPACE],
  ],
};

/**
 * The value after pressing `key`. Enter leaves it alone (the caller submits),
 * "+" is only accepted as the first character of a phone number, and input
 * stops at `maxLength`.
 */
export function applyKey(value: string, key: string, layout: KeyboardLayout, maxLength: number): string {
  if (key === BACKSPACE) return value.slice(0, -1);
  if (key === ENTER || key === SPACER) return value;
  if (!LAYOUTS[layout].some((row) => row.includes(key))) return value;
  if (key === "+" && value !== "") return value;
  if (value.length >= maxLength) return value;
  return value + key;
}
