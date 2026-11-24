import { beforeEach, describe, expect, it, vi } from "vitest";
import * as locks from "../utils/locks";
import checkHandler from "../pages/api/checkVerification";
import guessHandler from "../pages/api/puzzle/guess";
import unlockHandler from "../pages/api/unlockBox";
import adminUnlockHandler from "../pages/api/admin/unlock";
import { clearGameConfigCache, DEFAULT_CONFIG, type GameConfig } from "../utils/gameConfig";
import { startOrResumePuzzle } from "../utils/puzzleSession";
import { callApi } from "./apiHelpers";
import { getItem, setItem, store } from "./fakeSync";

// vi.mock is hoisted above the imports, so these modules load against the fakes.

const twilio = vi.hoisted(() => ({
  messagesCreate: vi.fn(async (_: Record<string, unknown>) => ({ sid: "SM1" })),
  checkCreate: vi.fn(async ({ code }: { code: string }) => ({ valid: code === "123456", status: "approved" })),
}));
vi.mock("twilio", () => ({
  default: () => ({
    messages: { create: twilio.messagesCreate },
    verify: { v2: { services: () => ({ verificationChecks: { create: twilio.checkCreate } }) } },
  }),
}));
vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
vi.mock("../utils/locks", () => ({
  getBridges: vi.fn(async () => ({ deviceId: "BRIDGE" })),
  unlock: vi.fn(async () => ({})),
}));
vi.mock("../utils/vaultLed", () => ({ setVaultLed: vi.fn() }));

const SID = "sid-1";
const NUMBER = "+17025550123";
const PLAYER = { sid: SID };
const DEVICE: GameConfig = {
  ...DEFAULT_CONFIG,
  solutionWords: [{ word: "PHONE", hints: [] }],
  prizes: [{ name: "Socks", lockId: "SPBOX1" }],
  winnerPolicy: "infinite",
};

beforeEach(() => {
  store.clear();
  clearGameConfigCache();
  vi.mocked(locks.unlock).mockClear();
  twilio.messagesCreate.mockClear();
  setItem("game-config", "active", DEVICE);
});

/** Verifies NUMBER for the session and solves the puzzle, as a player would. */
async function verifyAndSolve() {
  await callApi(checkHandler, { body: { code: "123456", address: NUMBER }, cookies: PLAYER });
  await startOrResumePuzzle(SID, DEVICE);
  await callApi(guessHandler, { body: { guess: "PHONE" }, cookies: PLAYER });
}

const win = (recipient?: unknown) => callApi(unlockHandler, { body: { win: true, recipient }, cookies: PLAYER });

describe("the device-mode prize message", () => {
  it("is sent by the win itself, to the number the session verified", async () => {
    await verifyAndSolve();
    expect((await win({ address: NUMBER, channel: "whatsapp" })).statusCode).toBe(200);
    expect(twilio.messagesCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: `whatsapp:${NUMBER}`, contentVariables: JSON.stringify({ "1": "#1", "2": "Socks" }) })
    );
  });

  it("is never sent to a number the session didn't verify", async () => {
    await verifyAndSolve();
    const res = await win({ address: "+15555550100", channel: "sms" });
    expect(res.statusCode).toBe(200);
    expect(locks.unlock).toHaveBeenCalledOnce();
    expect(twilio.messagesCreate).not.toHaveBeenCalled();
  });

  it("stores a hash of the verified number, never the number", async () => {
    await callApi(checkHandler, { body: { code: "123456", address: NUMBER }, cookies: PLAYER });
    const record = getItem("verifications", SID);
    expect(record).toMatchObject({ recipient: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(record)).not.toContain("5550123");
  });

  it("doesn't fail the win when the message fails", async () => {
    await verifyAndSolve();
    twilio.messagesCreate.mockRejectedValueOnce(new Error("Invalid parameter `To`"));
    const res = await win({ address: NUMBER, channel: "sms" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ prize: "Socks", boxNumber: 1 });
  });

  it("is skipped for a page loaded before the deploy, which sends no recipient", async () => {
    await verifyAndSolve();
    const res = await win();
    expect(res.statusCode).toBe(200);
    expect(locks.unlock).toHaveBeenCalledOnce();
    expect(twilio.messagesCreate).not.toHaveBeenCalled();
  });

  it("is skipped for a session verified before the deploy, which has no number hash", async () => {
    await verifyAndSolve();
    setItem("verifications", SID, { verifiedAt: Date.now() });
    expect((await win({ address: NUMBER, channel: "sms" })).statusCode).toBe(200);
    expect(locks.unlock).toHaveBeenCalledOnce();
    expect(twilio.messagesCreate).not.toHaveBeenCalled();
  });

  it("is skipped, but the box still opens, if the auth token changed since the Verify check", async () => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_AUTH_TOKEN = "before";
    try {
      await verifyAndSolve();
      process.env.TWILIO_AUTH_TOKEN = "after";
      expect((await win({ address: NUMBER, channel: "sms" })).statusCode).toBe(200);
      expect(locks.unlock).toHaveBeenCalledOnce();
      expect(twilio.messagesCreate).not.toHaveBeenCalled();
    } finally {
      process.env.TWILIO_AUTH_TOKEN = token;
    }
  });

  it("isn't sent in kiosk mode", async () => {
    const kiosk: GameConfig = { ...DEVICE, mode: "kiosk", vaultLockId: "SPVAULT" };
    setItem("game-config", "active", kiosk);
    await verifyAndSolve();
    expect((await win({ address: NUMBER, channel: "sms" })).statusCode).toBe(200);
    expect(twilio.messagesCreate).not.toHaveBeenCalled();
  });
});

describe("manual unlocks", () => {
  it("are no longer accepted by the public /api/unlockBox", async () => {
    const res = await callApi(unlockHandler, { body: { lockId: "SPBOX1" } });
    expect(res.statusCode).toBe(400);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it("open the chosen lock from /api/admin/unlock", async () => {
    expect((await callApi(adminUnlockHandler, { body: { lockId: "SPBOX1" } })).statusCode).toBe(200);
    expect(locks.unlock).toHaveBeenCalledWith("SPBOX1", "BRIDGE");
  });

  it("need a lockId and a POST", async () => {
    expect((await callApi(adminUnlockHandler, { body: {} })).statusCode).toBe(400);
    expect((await callApi(adminUnlockHandler, { method: "GET" })).statusCode).toBe(405);
    expect(locks.unlock).not.toHaveBeenCalled();
  });
});
