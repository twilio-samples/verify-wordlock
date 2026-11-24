import { describe, expect, it } from "vitest";
import { GameConfigInputSchema, migrateConfig as migrate, type GameConfig } from "../utils/configSchema";

// Shape of the config main currently writes to Sync (pre-versioning).
const V1_STORED = {
  words: ["PHONE", "TEXTS"],
  time: 120,
  attempts: 5,
  hints: ["Think about Twilio products.", "Communication methods."],
  prizes: [{ name: "Twilio T-shirt", lockId: "SP3R11d53b7a" }],
  winnerPolicy: "oncePerDay",
  winnerResetAt: 1759000000000,
};

const DEFAULTS: GameConfig = {
  version: 5,
  mode: "device",
  puzzleEnabled: true,
  solutionWords: [{ word: "INBOX", hints: ["default hint"] }],
  time: 90,
  attempts: 4,
  hintRevealEvery: 3,
  idleTimeoutSeconds: 45,
  vaultLedRoute: "server",
  prizes: [{ name: "Default prize", lockId: "SP0" }],
  winnerPolicy: "oncePerDay",
  winnerResetAt: 0,
  defaultCountry: "US",
  commonCountries: ["US", "GB"],
};
const migrateConfig = (stored: unknown) => migrate(stored, DEFAULTS);

const VALID_INPUT = {
  mode: "device",
  puzzleEnabled: true,
  solutionWords: [{ word: "PHONE", hints: [] }],
  time: 120,
  attempts: 5,
  hintRevealEvery: 2,
  idleTimeoutSeconds: 60,
  vaultLedRoute: "server",
  prizes: [{ name: "Socks", lockId: "SP1" }],
  winnerPolicy: "oncePerDay",
  defaultCountry: "DE",
  commonCountries: ["DE", "AT", "CH"],
};

describe("migrateConfig", () => {
  it("upgrades a v1 config without losing data", () => {
    const config = migrateConfig(V1_STORED);
    expect(config.version).toBe(5);
    expect(config.vaultLedRoute).toBe("server");
    expect(config.defaultCountry).toBe("US");
    expect(config.commonCountries).toEqual(["US", "GB"]);
    expect(config.mode).toBe("device");
    expect(config.hintRevealEvery).toBe(3);
    expect(config.idleTimeoutSeconds).toBe(45);
    expect(config.puzzleEnabled).toBe(true);
    expect(config.solutionWords).toEqual([
      { word: "PHONE", hints: V1_STORED.hints },
      { word: "TEXTS", hints: V1_STORED.hints },
    ]);
    expect(config.time).toBe(120);
    expect(config.attempts).toBe(5);
    expect(config.prizes).toEqual(V1_STORED.prizes);
    expect(config.winnerPolicy).toBe("oncePerDay");
    expect(config.winnerResetAt).toBe(1759000000000);
    expect(config).not.toHaveProperty("words");
    expect(config).not.toHaveProperty("hints");
  });

  it("treats an empty v1 word list as 2FA-only mode", () => {
    const config = migrateConfig({ ...V1_STORED, words: [] });
    expect(config.puzzleEnabled).toBe(false);
    expect(config.solutionWords).toEqual([]);
  });

  it("fills winnerResetAt for v1 configs saved before it existed", () => {
    const { winnerResetAt: _omit, ...older } = V1_STORED;
    expect(migrateConfig(older).winnerResetAt).toBe(0);
  });

  it("fills fields missing from older v1 configs from the defaults, like the v1 loader did", () => {
    const { winnerPolicy: _omit, ...preWinnerPolicy } = V1_STORED;
    const config = migrateConfig(preWinnerPolicy);
    expect(config.winnerPolicy).toBe("oncePerDay");
    expect(config.solutionWords.map((w) => w.word)).toEqual(["PHONE", "TEXTS"]);
    expect(config.prizes).toEqual(V1_STORED.prizes);
  });

  it("rounds up fractional time and attempts the v1 validator allowed", () => {
    const config = migrateConfig({ ...V1_STORED, time: 120.5, attempts: 0.5 });
    expect(config.time).toBe(121);
    expect(config.attempts).toBe(1);
  });

  it("uses the default words and hints if a v1 config has neither", () => {
    const { words: _w, hints: _h, ...noWords } = V1_STORED;
    expect(migrateConfig(noWords).solutionWords).toEqual(DEFAULTS.solutionWords);
  });

  it("does not share hint arrays between migrated words", () => {
    const config = migrateConfig(V1_STORED);
    expect(config.solutionWords[0].hints).not.toBe(config.solutionWords[1].hints);
  });

  it("upgrades a v2 config with the default hint threshold, idle timeout and countries", () => {
    const {
      hintRevealEvery: _h,
      idleTimeoutSeconds: _i,
      defaultCountry: _d,
      commonCountries: _c,
      vaultLedRoute: _r,
      ...v2Fields
    } = VALID_INPUT;
    const config = migrateConfig({ ...v2Fields, version: 2, winnerResetAt: 5 });
    expect(config).toEqual({
      ...v2Fields,
      version: 5,
      vaultLedRoute: "server",
      winnerResetAt: 5,
      hintRevealEvery: 3,
      idleTimeoutSeconds: 45,
      defaultCountry: "US",
      commonCountries: ["US", "GB"],
    });
  });

  it("upgrades a v3 config with the default countries and keeps the rest", () => {
    const { defaultCountry: _d, commonCountries: _c, vaultLedRoute: _r, ...v3Fields } = VALID_INPUT;
    const config = migrateConfig({ ...v3Fields, version: 3, winnerResetAt: 5 });
    expect(config).toEqual({
      ...v3Fields,
      version: 5,
      winnerResetAt: 5,
      vaultLedRoute: "server",
      defaultCountry: "US",
      commonCountries: ["US", "GB"],
    });
  });

  it("upgrades a v4 config to send the vault LED from the server, as before", () => {
    const { vaultLedRoute: _r, ...v4Fields } = VALID_INPUT;
    const config = migrateConfig({ ...v4Fields, mode: "kiosk", vaultLockId: "SP9", version: 4, winnerResetAt: 5 });
    expect(config).toEqual({ ...v4Fields, mode: "kiosk", vaultLockId: "SP9", version: 5, winnerResetAt: 5, vaultLedRoute: "server" });
  });

  it("does not share the default country list with a migrated config", () => {
    const { defaultCountry: _d, commonCountries: _c, vaultLedRoute: _r, ...v3Fields } = VALID_INPUT;
    const config = migrateConfig({ ...v3Fields, version: 3, winnerResetAt: 5 });
    expect(config.commonCountries).not.toBe(DEFAULTS.commonCountries);
  });

  it("passes a valid v5 config through unchanged", () => {
    const v5 = { ...VALID_INPUT, version: 5, winnerResetAt: 5, vaultLedRoute: "browser", vaultLedBrowserUrl: "http://192.168.0.48" };
    expect(migrateConfig(v5)).toEqual(v5);
  });

  it("rejects an unknown future version instead of guessing", () => {
    expect(() => migrateConfig({ ...VALID_INPUT, version: 6, winnerResetAt: 0 })).toThrow();
  });

  it("rejects non-objects", () => {
    expect(() => migrateConfig(null)).toThrow();
    expect(() => migrateConfig("nope")).toThrow();
    expect(() => migrateConfig([])).toThrow();
  });
});

describe("GameConfigInputSchema", () => {
  it("accepts a valid config and uppercases words", () => {
    const parsed = GameConfigInputSchema.parse({
      ...VALID_INPUT,
      solutionWords: [{ word: " phone ", hints: [] }],
    });
    expect(parsed.solutionWords[0].word).toBe("PHONE");
  });

  it("requires all words to be the same length", () => {
    const result = GameConfigInputSchema.safeParse({
      ...VALID_INPUT,
      solutionWords: [
        { word: "PHONE", hints: [] },
        { word: "SMS", hints: [] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts any shared word length from 3 to 8 letters", () => {
    const words = (...list: string[]) => ({ ...VALID_INPUT, solutionWords: list.map((word) => ({ word, hints: [] })) });
    expect(GameConfigInputSchema.safeParse(words("VERIFY", "TWILIO")).success).toBe(true);
    expect(GameConfigInputSchema.safeParse(words("SMS")).success).toBe(true);
    expect(GameConfigInputSchema.safeParse(words("PASSKEYS")).success).toBe(true);
    expect(GameConfigInputSchema.safeParse(words("OK")).success).toBe(false);
    expect(GameConfigInputSchema.safeParse(words("AUTHENTIC")).success).toBe(false);
  });

  it("allows words with no hints, and rejects blank hints", () => {
    expect(GameConfigInputSchema.safeParse(VALID_INPUT).success).toBe(true);
    expect(
      GameConfigInputSchema.safeParse({ ...VALID_INPUT, solutionWords: [{ word: "PHONE", hints: [" "] }] }).success
    ).toBe(false);
  });

  it("requires a word when the puzzle is enabled", () => {
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, solutionWords: [] }).success).toBe(false);
  });

  it("allows no words in 2FA-only mode", () => {
    expect(
      GameConfigInputSchema.safeParse({ ...VALID_INPUT, puzzleEnabled: false, solutionWords: [] }).success
    ).toBe(true);
  });

  it("rejects non-letter words", () => {
    expect(
      GameConfigInputSchema.safeParse({ ...VALID_INPUT, solutionWords: [{ word: "PH0NE", hints: [] }] }).success
    ).toBe(false);
  });

  it("device mode requires at least one prize, each with a lock", () => {
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, prizes: [] }).success).toBe(false);
    expect(
      GameConfigInputSchema.safeParse({ ...VALID_INPUT, prizes: [{ name: "Socks", lockId: " " }] }).success
    ).toBe(false);
    const result = GameConfigInputSchema.safeParse({ ...VALID_INPUT, prizes: [{ name: "Socks" }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["prizes", 0, "lockId"]);
  });

  it("kiosk mode allows a vault lock or none (LED only), and zero or more lock-less prize labels", () => {
    const kiosk = { ...VALID_INPUT, mode: "kiosk", vaultLockId: "SPVAULT" };
    expect(GameConfigInputSchema.safeParse({ ...kiosk, prizes: [] }).success).toBe(true);
    expect(GameConfigInputSchema.safeParse({ ...kiosk, prizes: [{ name: "Socks" }, { name: "Mug" }] }).success).toBe(true);
    expect(GameConfigInputSchema.safeParse({ ...kiosk, vaultLockId: undefined }).success).toBe(true);
  });

  it("requires a positive hint threshold and an idle timeout of at least 15s", () => {
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, hintRevealEvery: 0 }).success).toBe(false);
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, idleTimeoutSeconds: 14 }).success).toBe(false);
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, idleTimeoutSeconds: 15 }).success).toBe(true);
  });

  it("rejects non-integer or non-positive time and attempts", () => {
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, time: 0 }).success).toBe(false);
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, attempts: 1.5 }).success).toBe(false);
  });

  it("upper-cases country codes and rejects ones without phone numbers", () => {
    const parsed = GameConfigInputSchema.parse({ ...VALID_INPUT, defaultCountry: " us ", commonCountries: ["gb"] });
    expect(parsed.defaultCountry).toBe("US");
    expect(parsed.commonCountries).toEqual(["GB"]);
    const bad = GameConfigInputSchema.safeParse({ ...VALID_INPUT, commonCountries: ["DE", "ZZ"] });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual(["commonCountries", 1]);
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, defaultCountry: "" }).success).toBe(false);
  });

  it("allows no common countries but at most 10", () => {
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, commonCountries: [] }).success).toBe(true);
    const eleven = ["US", "CA", "GB", "DE", "IN", "BR", "FR", "ES", "IT", "NL", "MX"];
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, commonCountries: eleven }).success).toBe(false);
  });

  it("needs the Pi's LAN address to send the vault LED from the browser", () => {
    const missing = GameConfigInputSchema.safeParse({ ...VALID_INPUT, vaultLedRoute: "browser" });
    expect(missing.error?.issues.map((issue) => issue.path)).toEqual([["vaultLedBrowserUrl"]]);
    const ok = GameConfigInputSchema.parse({ ...VALID_INPUT, vaultLedRoute: "browser", vaultLedBrowserUrl: " http://192.168.0.48 " });
    expect(ok.vaultLedBrowserUrl).toBe("http://192.168.0.48");
    // Kept while the server sends, so the /admin browser test can still use it.
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, vaultLedBrowserUrl: "http://192.168.0.48" }).success).toBe(true);
  });

  it("only takes an http(s) Pi address without credentials", () => {
    for (const vaultLedBrowserUrl of ["192.168.0.48", "ws://192.168.0.48", "http://user:pass@192.168.0.48", "nope"]) {
      const parsed = GameConfigInputSchema.safeParse({ ...VALID_INPUT, vaultLedRoute: "browser", vaultLedBrowserUrl });
      expect(parsed.error?.issues[0].path, vaultLedBrowserUrl).toEqual(["vaultLedBrowserUrl"]);
    }
    expect(GameConfigInputSchema.safeParse({ ...VALID_INPUT, vaultLedRoute: "nope" }).success).toBe(false);
  });

  it("strips server-managed fields sent by the client", () => {
    const parsed = GameConfigInputSchema.parse({ ...VALID_INPUT, winnerResetAt: 0, version: 99 });
    expect(parsed).not.toHaveProperty("winnerResetAt");
    expect(parsed).not.toHaveProperty("version");
  });
});
