import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { getBridges, getLockInfo, getLocks, unlock } from "../utils/locks";
import { refreshIglooToken } from "../utils/iglooToken";
import { IglooError } from "../utils/iglooError";

// vi.mock is hoisted above the imports, so these modules load against the fakes.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
vi.mock("../utils/iglooToken", async (original) => ({
  ...(await original<typeof import("../utils/iglooToken")>()),
  ensureIglooToken: vi.fn(async () => ({ accessToken: TOKEN, expiresAt: Date.now() + 3600_000 })),
}));

const TOKEN = "igloo-access-token-SECRET";
const CLIENT = { CLIENT_ID: "client-id-SECRET", CLIENT_SECRET: "client-secret-SECRET" };

/** An axios failure as igloohome sends it, with the request's headers attached like the real thing. */
function iglooFailure(status: number, data: unknown, authorization: string) {
  const config = { headers: new AxiosHeaders({ Authorization: authorization }) };
  const response = { status, statusText: "", data, headers: {}, config };
  return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, {}, response);
}

/** Everything the code under test logged, as one string. */
function logged(...spies: ReturnType<typeof vi.spyOn>[]) {
  return spies.flatMap((spy) => spy.mock.calls.flat()).map((arg) => (arg instanceof Error ? `${arg.stack} ${JSON.stringify(arg)}` : JSON.stringify(arg))).join("\n");
}

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(process.env, CLIENT);
});
afterEach(() => vi.restoreAllMocks());

describe("igloohome failures", () => {
  const offline = { error: "Unable to contact bridge as it appears to be offline" };

  it.each([
    ["unlock", () => unlock("SPBOX1", "BRIDGE")],
    ["getLocks", () => getLocks()],
    ["getLockInfo", () => getLockInfo("SPBOX1")],
    ["getBridges", () => getBridges()],
  ])("%s logs and throws the status and igloohome's message, never the access token", async (_name, call) => {
    vi.spyOn(axios, "request").mockRejectedValueOnce(iglooFailure(406, offline, `Bearer ${TOKEN}`));

    const thrown = await call().catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(IglooError);
    expect((thrown as IglooError).status).toBe(406);
    expect((thrown as IglooError).message).toContain("406 Unable to contact bridge as it appears to be offline");
    expect(JSON.stringify(thrown)).not.toContain(TOKEN);
    expect(logged(log, error)).toContain("Unable to contact bridge");
    expect(logged(log, error)).not.toContain(TOKEN);
  });

  it("falls back to axios's message when igloohome sends no body", async () => {
    vi.spyOn(axios, "request").mockRejectedValueOnce(iglooFailure(502, "", `Bearer ${TOKEN}`));
    await expect(getBridges()).rejects.toThrow("Error Getting Bridges: 502 Request failed with status code 502");
  });

  it("the token request never surfaces the client ID or secret", async () => {
    const basic = `Basic ${Buffer.from(`${CLIENT.CLIENT_ID}:${CLIENT.CLIENT_SECRET}`).toString("base64")}`;
    vi.spyOn(axios, "post").mockRejectedValueOnce(iglooFailure(401, { error: "invalid_client" }, basic));

    const thrown = await refreshIglooToken().catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(IglooError);
    expect((thrown as Error).message).toBe("Igloo token request failed: 401 invalid_client");
    for (const secret of [basic, CLIENT.CLIENT_ID, CLIENT.CLIENT_SECRET]) {
      expect(`${(thrown as Error).stack} ${JSON.stringify(thrown)}`).not.toContain(secret);
    }
  });
});
