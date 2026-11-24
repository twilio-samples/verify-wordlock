import { describe, expect, it } from "vitest";
import { COUNTRIES, countryOfInternational, findCountry, toE164 } from "../utils/phone";

describe("COUNTRIES", () => {
  it("lists each country once, A-Z, with its calling code", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(COUNTRIES.map((c) => c.name)).toEqual([...COUNTRIES.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
    expect(findCountry("us")).toMatchObject({ code: "US", dialCode: "+1" });
    expect(findCountry("DO")?.dialCode).toBe("+1");
    expect(findCountry("ZZ")).toBeUndefined();
  });
});

describe("toE164", () => {
  it("formats a national number for the chosen country", () => {
    expect(toE164("(702) 555-0123", "US")).toBe("+17025550123");
    expect(toE164("07911 123456", "GB")).toBe("+447911123456");
  });

  it("handles each country's trunk prefix", () => {
    expect(toE164("030 12345678", "DE")).toBe("+493012345678");
    expect(toE164("02 1234 5678", "IT")).toBe("+390212345678");
  });

  it("uses a typed + number as is, whatever country is picked", () => {
    expect(toE164("+44 7911 123456", "US")).toBe("+447911123456");
  });

  it("rejects incomplete numbers and unknown countries", () => {
    expect(toE164("555", "US")).toBeUndefined();
    expect(toE164("", "US")).toBeUndefined();
    expect(toE164("7025550123", "ZZ")).toBeUndefined();
  });
});

describe("countryOfInternational", () => {
  it("waits for a complete calling code", () => {
    expect(countryOfInternational("+", "US")).toBeUndefined();
    expect(countryOfInternational("+4", "US")).toBeUndefined();
  });

  it("finds the main country for a calling code", () => {
    expect(countryOfInternational("+44", "US")?.code).toBe("GB");
    expect(countryOfInternational("+49 30", "US")?.code).toBe("DE");
  });

  it("prefers the picked country when it shares the calling code", () => {
    expect(countryOfInternational("+1", "CA")?.code).toBe("CA");
    expect(countryOfInternational("+1", "DE")?.code).toBe("US");
  });

  it("switches to the exact country once the digits say which", () => {
    expect(countryOfInternational("+1 416 555 0123", "US")?.code).toBe("CA");
  });
});
