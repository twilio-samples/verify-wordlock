import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../pages/api/admin/config";
import { clearGameConfigCache, DEFAULT_CONFIG } from "../utils/gameConfig";
import { setItem, store } from "./fakeSync";

// vi.mock is hoisted above the imports, so these modules load against the fake.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);

function call(method: string, body?: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: unknown) {
      this.headers[name] = value;
      return this;
    },
  };
  return handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse).then(() => res);
}

const { version: _v, winnerResetAt: _w, ...VALID_INPUT } = DEFAULT_CONFIG;

beforeEach(() => {
  store.clear();
  clearGameConfigCache();
  setItem("game-config", "active", { ...DEFAULT_CONFIG, winnerResetAt: 777 });
});

describe("/api/admin/config", () => {
  it("GET returns the current config", async () => {
    const res = await call("GET");
    expect(res.statusCode).toBe(200);
    expect((res.body as { winnerResetAt: number }).winnerResetAt).toBe(777);
  });

  it("PUT saves a valid config and ignores a client-sent winnerResetAt", async () => {
    const res = await call("PUT", { ...VALID_INPUT, attempts: 9, winnerResetAt: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ attempts: 9, winnerResetAt: 777, version: 5 });
  });

  it("PUT rejects an invalid config with field-level issues", async () => {
    const res = await call("PUT", { ...VALID_INPUT, prizes: [] });
    expect(res.statusCode).toBe(400);
    expect((res.body as { issues: { path: string }[] }).issues[0].path).toBe("prizes");
  });

  it("PUT rejects the old v1 payload shape", async () => {
    const res = await call("PUT", { words: ["PHONE"], hints: [], time: 1, attempts: 1, prizes: [], winnerPolicy: "infinite" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects other methods", async () => {
    const res = await call("DELETE");
    expect(res.statusCode).toBe(405);
  });
});
