import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSetCookie } from "cookie";
import { idleState, kioskProps, warningSeconds } from "../utils/kiosk";
import { applyKey, BACKSPACE, ENTER } from "../utils/virtualKeyboard";
import { PLAYER_COOKIES, resetPlayer } from "../utils/playerSession";
import { hasSolvedPuzzle, startOrResumePuzzle, submitGuess } from "../utils/puzzleSession";
import { clearGameConfigCache, DEFAULT_CONFIG, type GameConfig } from "../utils/gameConfig";
import * as sync from "../utils/sync";
import { setItem, store } from "./fakeSync";
import { getServerSideProps as homeProps } from "../pages/index";
import { setVaultLed } from "../utils/vaultLed";

// vi.mock is hoisted above the imports, so these modules load against the fakes.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
vi.mock("../utils/iglooToken", () => ({ ensureIglooToken: vi.fn(async () => null) }));
vi.mock("../utils/vaultLed", () => ({ setVaultLed: vi.fn() }));

beforeEach(() => {
  store.clear();
  clearGameConfigCache();
  vi.mocked(setVaultLed).mockClear();
});

describe("kioskProps", () => {
  it("only switches the kiosk shell on in kiosk mode", () => {
    expect(kioskProps({ mode: "device", idleTimeoutSeconds: 60, vaultLedRoute: "server" })).toEqual({ kiosk: null });
    expect(kioskProps({ mode: "kiosk", idleTimeoutSeconds: 45, vaultLedRoute: "server" })).toEqual({
      kiosk: { idleTimeoutSeconds: 45, vaultLedUrl: null },
    });
  });

  it("hands the browser the Pi's address only when the browser drives the vault LED", () => {
    const vaultLedBrowserUrl = "http://192.168.0.48";
    const kiosk = { mode: "kiosk", idleTimeoutSeconds: 45, vaultLedBrowserUrl } as const;
    expect(kioskProps({ ...kiosk, vaultLedRoute: "server" }).kiosk?.vaultLedUrl).toBeNull();
    expect(kioskProps({ ...kiosk, vaultLedRoute: "browser" }).kiosk?.vaultLedUrl).toBe(vaultLedBrowserUrl);
    expect(kioskProps({ ...kiosk, mode: "device", vaultLedRoute: "browser" }).kiosk).toBeNull();
  });
});

describe("idleState", () => {
  it("warns 15 seconds before the reset, counting down whole seconds", () => {
    expect(idleState(44_999, 60)).toEqual({ phase: "active" });
    expect(idleState(45_000, 60)).toEqual({ phase: "warning", secondsLeft: 15 });
    expect(idleState(58_100, 60)).toEqual({ phase: "warning", secondsLeft: 2 });
    expect(idleState(59_999, 60)).toEqual({ phase: "warning", secondsLeft: 1 });
    expect(idleState(60_000, 60)).toEqual({ phase: "reset" });
  });

  it("leaves half the window before warning when the timeout is short", () => {
    expect(warningSeconds(60)).toBe(15);
    expect(warningSeconds(15)).toBe(7);
    expect(idleState(7_000, 15)).toEqual({ phase: "active" });
    expect(idleState(8_000, 15)).toEqual({ phase: "warning", secondsLeft: 7 });
  });
});

describe("applyKey", () => {
  it("types and deletes letters up to the word length", () => {
    expect(applyKey("PHO", "N", "alpha", 5)).toBe("PHON");
    expect(applyKey("PHONE", "S", "alpha", 5)).toBe("PHONE");
    expect(applyKey("PHO", BACKSPACE, "alpha", 5)).toBe("PH");
    expect(applyKey("", BACKSPACE, "alpha", 5)).toBe("");
    expect(applyKey("PHO", ENTER, "alpha", 5)).toBe("PHO");
  });

  it("only accepts keys from the active layout", () => {
    expect(applyKey("12", "A", "digits", 6)).toBe("12");
    expect(applyKey("12", "+", "digits", 6)).toBe("12");
    expect(applyKey("PH", "1", "alpha", 5)).toBe("PH");
  });

  it("allows + only at the start of a phone number", () => {
    expect(applyKey("", "+", "phone", 16)).toBe("+");
    expect(applyKey("+1", "+", "phone", 16)).toBe("+1");
    expect(applyKey("151", "+", "phone", 16)).toBe("151");
  });
});

describe("resetPlayer", () => {
  const CONFIG: GameConfig = { ...DEFAULT_CONFIG, solutionWords: [{ word: "PHONE", hints: [] }] };

  it("ends the previous player's run and expires all of their cookies", async () => {
    await startOrResumePuzzle("sid-1", CONFIG);
    await submitGuess("sid-1", "PHONE");
    const headers: Record<string, string[]> = {};
    await resetPlayer("sid=sid-1; verified=true; attempt=2; winner=123", {
      setHeader: (name, value) => (headers[name] = value),
    });

    expect(await hasSolvedPuzzle("sid-1")).toBe(false);
    const cleared = headers["Set-Cookie"].map((c) => parseSetCookie(c));
    expect(cleared.map((c) => c.name).sort()).toEqual([...PLAYER_COOKIES].sort());
    expect(cleared.every((c) => c.value === "" && c.maxAge === 0)).toBe(true);
  });

  it("still clears the cookies when Sync is down", async () => {
    vi.mocked(sync.removeMapItem).mockRejectedValueOnce(new Error("Sync unavailable"));
    const headers: Record<string, string[]> = {};
    await resetPlayer("sid=sid-1; verified=true", { setHeader: (name, value) => (headers[name] = value) });
    expect(headers["Set-Cookie"]).toHaveLength(PLAYER_COOKIES.length);
  });

  it("is a no-op for the run when there is no session yet", async () => {
    const headers: Record<string, string[]> = {};
    await resetPlayer(undefined, { setHeader: (name, value) => (headers[name] = value) });
    expect(headers["Set-Cookie"]).toHaveLength(PLAYER_COOKIES.length);
  });
});

describe("start screen", () => {
  const ctx = () => {
    const headers: Record<string, unknown> = {};
    return { headers, req: { headers: { cookie: "sid=sid-1; verified=true" } }, res: { setHeader: (n: string, v: unknown) => (headers[n] = v) } };
  };

  it("resets the kiosk player even when it then redirects to /error", async () => {
    setItem("game-config", "active", { ...DEFAULT_CONFIG, mode: "kiosk", vaultLockId: "SPVAULT" });
    const c = ctx();
    const result = await homeProps(c);
    expect(result).toMatchObject({ redirect: { destination: "/error" } });
    expect(c.headers["Set-Cookie"]).toHaveLength(PLAYER_COOKIES.length);
    expect(setVaultLed).toHaveBeenCalledWith(expect.objectContaining({ mode: "kiosk" }), "reset");
  });

  it("leaves device-mode players alone", async () => {
    setItem("game-config", "active", DEFAULT_CONFIG);
    const c = ctx();
    await homeProps(c);
    expect(c.headers["Set-Cookie"]).toBeUndefined();
  });
});
