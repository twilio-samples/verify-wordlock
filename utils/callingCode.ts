import CountryList from "country-list-with-dial-code-and-flag";
import metadata from "libphonenumber-js/min/metadata";

// Dial code -> country names, preferred country first ("+1": United States, Canada).
const COUNTRIES = new Map<string, string[]>();
for (const country of CountryList.getAll()) {
  if (!/^\+\d+$/.test(country.dialCode)) continue;
  const names = COUNTRIES.get(country.dialCode) ?? [];
  if (!names.includes(country.name)) {
    if (country.preferred) names.unshift(country.name);
    else names.push(country.name);
  }
  COUNTRIES.set(country.dialCode, names);
}
// E.164 country codes only. The country list also has "+1684" (American
// Samoa) and other +1 area codes, which would store where in the US or
// Caribbean a player is from. No country code is a prefix of another.
const DIAL_CODES = Object.keys(metadata.country_calling_codes).map((code) => `+${code}`);

/**
 * The international calling code of an E.164 number ("+4915112345678" ->
 * "+49"), for coarse where-are-players-from stats (#9). Only this prefix is
 * ever stored, never the number. Undefined when it doesn't match a country.
 */
export function callingCodeOf(address: unknown): string | undefined {
  if (typeof address !== "string") return undefined;
  const number = address.replace(/[\s().-]/g, "");
  if (!/^\+\d+$/.test(number)) return undefined;
  return DIAL_CODES.find((code) => number.startsWith(code));
}

/**
 * "Germany (+49)", "United States, Canada (+1)", "United Kingdom, Guernsey
 * and 2 more (+44)". Names first, so a spreadsheet never reads it as a formula.
 */
export function callingCodeLabel(code: string) {
  const names = COUNTRIES.get(code);
  if (!names?.length) return `Unknown (${code})`;
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? `${shown} and ${names.length - 2} more (${code})` : `${shown} (${code})`;
}
