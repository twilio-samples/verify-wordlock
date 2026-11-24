import { describe, expect, it } from "vitest";
import { COPY, getCopy } from "../utils/copy";

describe("copy", () => {
  it("defines every key in every mode", () => {
    const shape = (obj: object): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === "object" ? shape(v).map((s) => `${k}.${s}`) : [k]
      );
    expect(shape(COPY.kiosk).sort()).toEqual(shape(COPY.device).sort());
  });

  it("uses vault wording in kiosk mode and box wording in device mode", () => {
    expect(getCopy("kiosk").complete.claim("Socks", "2")).toMatch(/vault/i);
    expect(getCopy("device").complete.claim("Socks", "2")).toMatch(/box 2/);
  });

  it("keeps the device phone instructions and uses shorter kiosk copy", () => {
    expect(getCopy("device").channel.personalNumber).toMatch(/personal/i);
    expect(getCopy("device").channel.countryHelp).toContain("start with +");
    expect(getCopy("kiosk").channel).toEqual({
      title: "Get your code",
      subtitle: "Choose where to receive your code.",
      storageNote: "Your number is used only to send this code.",
      personalNumber: "Use a mobile number you can access.",
      countryHelp: "Change country code if needed.",
      consent: "By continuing, you agree to receive a verification code. Message and data rates may apply.",
    });
  });
});
