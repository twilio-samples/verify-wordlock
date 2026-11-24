import CountryList from "country-list-with-dial-code-and-flag";
import { AsYouType, getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import metadata from "libphonenumber-js/min/metadata";

export type Country = { code: CountryCode; name: string; flag: string; dialCode: string };

/** Every country the phone field offers, A-Z. Dial codes come from libphonenumber, so "+1" covers the Caribbean too. */
export const COUNTRIES: Country[] = (() => {
  const byCode = new Map<string, Country>();
  // Entries keep their fields in `data` behind getters; destructuring reads the getters.
  for (const { code, name, flag } of CountryList.getAll()) {
    if (byCode.has(code) || !isSupportedCountry(code)) continue;
    byCode.set(code, { code, name, flag, dialCode: `+${getCountryCallingCode(code)}` });
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export const findCountry = (code: string) => BY_CODE.get(code.toUpperCase() as CountryCode);

/**
 * The country a number typed with its own "+" belongs to, for the flag next
 * to the field: an exact match when the digits say which ("+1 416" is
 * Canada), otherwise `preferred` if it shares the calling code, otherwise the
 * main country for that code ("+44" is the UK). Undefined until the calling
 * code is complete.
 */
export function countryOfInternational(number: string, preferred: string): Country | undefined {
  const typing = new AsYouType();
  typing.input(number);
  const exact = typing.getCountry();
  if (exact) return findCountry(exact);
  const callingCode = typing.getCallingCode();
  if (!callingCode) return undefined;
  if (findCountry(preferred)?.dialCode === `+${callingCode}`) return findCountry(preferred);
  const main = metadata.country_calling_codes[callingCode]?.[0];
  return main ? findCountry(main) : undefined;
}

/**
 * The E.164 form of what the player typed, or undefined if it isn't a
 * plausible number for that country (wrong length, unknown calling code).
 * A number starting with "+" ignores `country`. A national trunk prefix is
 * handled per country: Germany's leading 0 is dropped, Italy's is kept.
 */
export function toE164(number: string, country: string): string | undefined {
  if (!isSupportedCountry(country.toUpperCase())) return undefined;
  const parsed = parsePhoneNumberFromString(number, country.toUpperCase() as CountryCode);
  return parsed?.isValid() ? parsed.number : undefined;
}
