import { beforeEach, describe, expect, it, vi } from "vitest";
import * as locks from "../utils/locks";
import * as sync from "../utils/sync";
import { setVaultLed } from "../utils/vaultLed";
import guessHandler from "../pages/api/puzzle/guess";
import unlockHandler from "../pages/api/unlockBox";
import { clearGameConfigCache, DEFAULT_CONFIG, type GameConfig } from "../utils/gameConfig";
import { recordVerification, startOrResumePuzzle, submitGuess } from "../utils/puzzleSession";
import { getServerSideProps as puzzleProps } from "../pages/puzzle";
import { callApi } from "./apiHelpers";
import { deleteItem, getItem, setItem, store } from "./fakeSync";

// vi.mock is hoisted above the imports, so these modules load against the fakes.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
vi.mock("../utils/locks", () => ({
  getBridges: vi.fn(async () => ({ deviceId: "BRIDGE" })),
  unlock: vi.fn(async () => ({})),
}));
vi.mock("../utils/vaultLed", () => ({ setVaultLed: vi.fn() }));

const SID = "sid-1";
const PLAYER = { sid: SID, verified: "true" };
const DEVICE: GameConfig = {
  ...DEFAULT_CONFIG,
  solutionWords: [{ word: "PHONE", hints: ["h1"] }],
  prizes: [{ name: "Socks", lockId: "SPBOX1" }],
  winnerPolicy: "infinite",
};

function useConfig(config: GameConfig) {
  setItem("game-config", "active", config);
}

// A cookie anyone could set, without the server's record of a Verify check.
const forgetVerification = () => deleteItem("verifications", SID);

beforeEach(async () => {
  store.clear();
  clearGameConfigCache();
  vi.mocked(locks.unlock).mockClear();
  vi.mocked(setVaultLed).mockClear();
  useConfig(DEVICE);
  // The player passed a Verify check, as /api/checkVerification records.
  await recordVerification(SID);
});

describe("POST /api/puzzle/guess", () => {
  it("requires a verified session", async () => {
    expect((await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: { verified: "true" } })).statusCode).toBe(401);
  });

  it("checks the server's record of the Verify check, not the cookie", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    forgetVerification();
    const res = await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    expect(res.statusCode).toBe(401);
    expect(setVaultLed).not.toHaveBeenCalled();
  });

  it("returns the scored view, never the answer", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    const res = await callApi(guessHandler, { body: { guess: "PLANE" }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(res.body.guesses).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("PHONE");
  });

  it("maps failures to status codes the client can act on", async () => {
    expect((await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER })).statusCode).toBe(404);
    await startOrResumePuzzle(SID, DEVICE);
    expect((await callApi(guessHandler, { body: { guess: "PH" }, cookies: PLAYER })).statusCode).toBe(400);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    expect((await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER })).statusCode).toBe(409);
  });

  it("turns the vault LED green on the solving guess only", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PLANE" }, cookies: PLAYER });
    expect(setVaultLed).not.toHaveBeenCalled();
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    expect(setVaultLed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ mode: "device" }), "solved");
  });

  it("only accepts POST", async () => {
    expect((await callApi(guessHandler, { method: "GET", cookies: PLAYER })).statusCode).toBe(405);
  });
});

describe("POST /api/unlockBox { win: true }", () => {
  it("refuses to open a box for a session that hasn't solved its puzzle", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(403);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it("refuses an unverified session even in 2FA-only mode", async () => {
    useConfig({ ...DEVICE, puzzleEnabled: false });
    forgetVerification();
    const res = await callApi(unlockHandler, { body: { win: true }, cookies: { sid: SID } });
    expect(res.statusCode).toBe(403);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it("opens a box once the puzzle is solved, and ends the run", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });

    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ prize: "Socks", boxNumber: 1 });
    expect(locks.unlock).toHaveBeenCalledWith("SPBOX1", "BRIDGE");

    // The solved run is consumed: replaying the win request opens nothing.
    vi.mocked(locks.unlock).mockClear();
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(403);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it("refuses a solved run whose session has no Verify record, whatever its cookies say", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await submitGuess(SID, "PHONE");
    forgetVerification();
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(403);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it("lets only one of two parallel win requests from a solved run through", async () => {
    useConfig({ ...DEVICE, prizes: [{ name: "Socks", lockId: "SPBOX1" }, { name: "Mug", lockId: "SPBOX2" }] });
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });

    const results = await Promise.all([
      callApi(unlockHandler, { body: { win: true }, cookies: PLAYER }),
      callApi(unlockHandler, { body: { win: true }, cookies: PLAYER }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 403]);
    expect(locks.unlock).toHaveBeenCalledTimes(1);
  });

  it("gives the solve back when no box is free, so the client's retry can still win", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    setItem("prize-claims", "SPBOX1", { sessionId: "someone-else" });

    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(409);
    deleteItem("prize-claims", "SPBOX1");
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(200);
  });

  it("gives the solve back when the lock fails to open", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    vi.mocked(locks.unlock).mockRejectedValueOnce(new Error("bridge offline"));

    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(500);
    deleteItem("prize-claims", "SPBOX1"); // the 20s reservation would lapse on its own
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(200);
  });

  it("gives the solve back when reserving a box fails, so the retry can still win", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    // The first claim is the solve itself; the second, the box reservation.
    const claim = vi.mocked(sync.tryClaim).getMockImplementation()!;
    vi.mocked(sync.tryClaim).mockImplementationOnce(claim).mockRejectedValueOnce(new Error("Sync unavailable"));

    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(500);
    expect(locks.unlock).not.toHaveBeenCalled();
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(200);
  });

  it("finds the bridge before reserving a box, and gives the solve back if that fails", async () => {
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    vi.mocked(locks.getBridges).mockRejectedValueOnce(new Error("igloohome unavailable"));

    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(500);
    expect(getItem("prize-claims", "SPBOX1")).toBeUndefined();
    expect(locks.unlock).not.toHaveBeenCalled();

    // A slow bridge lookup mustn't eat into the reservation's 20s window.
    vi.mocked(locks.getBridges).mockImplementationOnce(async () => {
      expect(getItem("prize-claims", "SPBOX1")).toBeUndefined();
      return { deviceId: "BRIDGE", deviceName: "bridge", type: "Bridge" };
    });
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(200);
    expect(locks.unlock).toHaveBeenCalledWith("SPBOX1", "BRIDGE");
  });

  it("opens a box once per passed Verify check in 2FA-only mode", async () => {
    useConfig({ ...DEVICE, puzzleEnabled: false });
    await recordVerification(SID);
    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(locks.unlock).toHaveBeenCalledWith("SPBOX1", "BRIDGE");
    // /stats keeps this out of the puzzle solves.
    expect(getItem("game-funnel", SID)).toMatchObject({ boxOpenedAt: expect.any(Number), twoFactorOnly: true });
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(403);
  });

  it("2FA-only mode needs the server-side record, not just the cookie", async () => {
    useConfig({ ...DEVICE, puzzleEnabled: false });
    forgetVerification();
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(403);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it("a double-submitted code opens the kiosk vault only once", async () => {
    useConfig({ ...DEVICE, mode: "kiosk", vaultLockId: "SPVAULT", puzzleEnabled: false });
    await recordVerification(SID);
    const results = await Promise.all([
      callApi(unlockHandler, { body: { win: true }, cookies: PLAYER }),
      callApi(unlockHandler, { body: { win: true }, cookies: PLAYER }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 403]);
    expect(locks.unlock).toHaveBeenCalledTimes(1);
  });

  it("a new Verify check earns a new 2FA-only win", async () => {
    useConfig({ ...DEVICE, puzzleEnabled: false });
    await recordVerification(SID, 1000);
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(200);
    deleteItem("prize-claims", "SPBOX1"); // the 20s reservation would lapse on its own
    await recordVerification(SID, 2000);
    expect((await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER })).statusCode).toBe(200);
  });

  it("kiosk mode opens the vault and names no box", async () => {
    const kiosk: GameConfig = { ...DEVICE, mode: "kiosk", vaultLockId: "SPVAULT", prizes: [{ name: "Socks" }] };
    useConfig(kiosk);
    await startOrResumePuzzle(SID, kiosk);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });

    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: "Vault Unlocked", vault: true });
    expect(locks.unlock).toHaveBeenCalledWith("SPVAULT", "BRIDGE");
    expect(setVaultLed).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "kiosk" }), "solved");
    expect(getItem("game-funnel", SID)).not.toHaveProperty("twoFactorOnly");
  });

  it("kiosk mode without a vault lock wins without calling igloohome", async () => {
    const kiosk: GameConfig = { ...DEVICE, mode: "kiosk", vaultLockId: undefined, prizes: [] };
    useConfig(kiosk);
    await startOrResumePuzzle(SID, kiosk);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
    vi.mocked(locks.getBridges).mockClear();

    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: "Vault Unlocked", vault: true });
    expect(locks.getBridges).not.toHaveBeenCalled();
    expect(locks.unlock).not.toHaveBeenCalled();
    expect(setVaultLed).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "kiosk" }), "solved");
    expect(getItem("game-funnel", SID)).toHaveProperty("boxOpenedAt");
  });

  it("kiosk mode doesn't mark the shared tablet as a winner", async () => {
    const kiosk: GameConfig = { ...DEVICE, mode: "kiosk", vaultLockId: "SPVAULT", winnerPolicy: "oncePerDay" };
    useConfig(kiosk);
    await startOrResumePuzzle(SID, kiosk);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });

    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Set-Cookie"]).toBeUndefined();
  });

  it("device mode still sets the winner cookie under a limiting policy", async () => {
    useConfig({ ...DEVICE, winnerPolicy: "oncePerDay" });
    await startOrResumePuzzle(SID, DEVICE);
    await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });

    const res = await callApi(unlockHandler, { body: { win: true }, cookies: PLAYER });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["Set-Cookie"])).toMatch(/^winner=/);
  });
});

describe("/puzzle", () => {
  const load = (cookies: Record<string, string>) =>
    puzzleProps({ req: { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } } });

  it("starts the puzzle for a verified session", async () => {
    expect(await load(PLAYER)).toHaveProperty("props.view.wordLength", 5);
  });

  it("sends a session without a Verify record back to the start, whatever its cookies say", async () => {
    forgetVerification();
    expect(await load(PLAYER)).toEqual({ redirect: { destination: "/", permanent: false } });
  });
});
