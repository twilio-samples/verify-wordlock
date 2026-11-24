import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../pages/api/admin/vaultLed";
import { backoffMs, cancelVaultLedRetries, setVaultLed, startVaultLed, stopVaultLed } from "../utils/vaultLed";

/**
 * Stands in for the Pi: each request waits until the test answers it, so the
 * test controls ordering and timing.
 */
type Pending = { url: string; init: RequestInit; reply(status?: number): Promise<void>; fail(error: Error): Promise<void> };
let pending: Pending[] = [];
const urls = () => pending.map((request) => request.url);

// Lets the client's awaits after a reply run before the test checks the result.
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

function fakeFetch(url: string, init: RequestInit) {
  return new Promise<Response>((resolve, reject) => {
    pending.push({
      url,
      init,
      reply: (status = 200) => (resolve(new Response(status === 204 ? null : "OK", { status })), settle()),
      fail: (error) => (reject(error), settle()),
    });
  });
}

const refused = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
const timedOut = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

const BASE = "http://192.168.0.48";
const KIOSK = { mode: "kiosk", vaultLedRoute: "server" } as const;
const last = () => pending[pending.length - 1];

beforeEach(() => {
  pending = [];
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stopVaultLed();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backoffMs", () => {
  it("doubles from 1s and caps at 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
});

describe("startVaultLed", () => {
  it("is off without PI_BASE_URL", () => {
    vi.stubEnv("PI_BASE_URL", "");
    expect(startVaultLed()).toBeNull();
    setVaultLed(KIOSK, "solved");
    expect(pending).toHaveLength(0);
  });

  it("refuses a URL that isn't http:// or https://", () => {
    expect(startVaultLed("ws://192.168.0.48")).toBeNull();
    stopVaultLed();
    expect(startVaultLed("192.168.0.48")).toBeNull();
    stopVaultLed();
    expect(startVaultLed("https://twilio:100%@tunnel.example")).toBeNull();
  });

  it("makes one client per process and sends nothing until asked", () => {
    vi.stubEnv("PI_BASE_URL", BASE);
    expect(startVaultLed()).toBe(startVaultLed());
    expect(pending).toHaveLength(0);
  });

  it("keeps a path prefix and drops a trailing slash", () => {
    expect(startVaultLed("https://tunnel.example/vault/")?.target).toBe("https://tunnel.example/vault");
  });

  it("moves user:pass@ into a Basic Auth header and out of the target", () => {
    const led = startVaultLed("https://twilio:s%40fe@tunnel.example");
    expect(led?.target).toBe("https://tunnel.example");
    led?.set("red");
    expect(last().url).toBe("https://tunnel.example/setRed");
    expect(last().init.headers).toEqual({ Authorization: `Basic ${Buffer.from("twilio:s@fe").toString("base64")}` });
  });
});

describe("setVaultLed", () => {
  beforeEach(() => vi.stubEnv("PI_BASE_URL", BASE));

  it("calls /setGreen on a solve and /setRed on a reset, uncached with a 5s timeout", async () => {
    setVaultLed(KIOSK, "solved");
    expect(urls()).toEqual([`${BASE}/setGreen`]);
    expect(last().init).toMatchObject({ cache: "no-store", signal: expect.any(AbortSignal) });
    await last().reply();
    setVaultLed(KIOSK, "reset");
    expect(urls()).toEqual([`${BASE}/setGreen`, `${BASE}/setRed`]);
  });

  it("does nothing in device mode", () => {
    setVaultLed({ mode: "device", vaultLedRoute: "server" }, "solved");
    expect(pending).toHaveLength(0);
  });

  it("leaves the LED to the kiosk browser when the browser route is on", () => {
    setVaultLed({ mode: "kiosk", vaultLedRoute: "browser" }, "solved");
    expect(pending).toHaveLength(0);
  });

  it("sends one request at a time and skips colors that were replaced while waiting", async () => {
    setVaultLed(KIOSK, "reset");
    setVaultLed(KIOSK, "solved");
    setVaultLed(KIOSK, "reset");
    setVaultLed(KIOSK, "solved");
    expect(urls()).toEqual([`${BASE}/setRed`]);
    await pending[0].reply();
    expect(urls()).toEqual([`${BASE}/setRed`, `${BASE}/setGreen`]);
    await pending[1].reply();
    expect(pending).toHaveLength(2);
  });

  it("marks a 2xx as accepted", async () => {
    const led = startVaultLed()!;
    setVaultLed(KIOSK, "solved");
    expect(led.status()).toMatchObject({ color: "green", result: "sending" });
    await last().reply(204);
    expect(led.status()).toMatchObject({ color: "green", result: "accepted" });
  });

  it("retries an unconfirmed color with backoff until the Pi accepts it", async () => {
    const led = startVaultLed()!;
    setVaultLed(KIOSK, "solved");
    await last().reply(500);
    expect(led.status()).toMatchObject({ color: "green", result: "unconfirmed", detail: "HTTP 500" });

    await vi.advanceTimersByTimeAsync(999);
    expect(pending).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pending).toHaveLength(2);
    await last().fail(refused());
    expect(led.status()).toMatchObject({ result: "unconfirmed", detail: "ECONNREFUSED" });

    await vi.advanceTimersByTimeAsync(1999); // second failure in a row waits longer
    expect(pending).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(pending).toHaveLength(3);
    await last().reply();
    expect(led.status()).toMatchObject({ result: "accepted" });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(pending).toHaveLength(3);
  });

  it("reports a timeout as unconfirmed, since the light may still have changed", async () => {
    const led = startVaultLed()!;
    setVaultLed(KIOSK, "reset");
    await last().fail(timedOut());
    expect(led.status()).toMatchObject({ color: "red", result: "unconfirmed", detail: "timed out after 5s" });
  });

  it("sends a newer color right away instead of waiting out the retry", async () => {
    setVaultLed(KIOSK, "solved");
    await last().fail(refused());
    setVaultLed(KIOSK, "reset");
    expect(urls()).toEqual([`${BASE}/setGreen`, `${BASE}/setRed`]);
    await last().reply();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pending).toHaveLength(2); // the green retry was dropped
  });

  it("never throws into the request when fetch throws synchronously", () => {
    vi.stubGlobal("fetch", () => {
      throw new TypeError("bad");
    });
    expect(() => setVaultLed(KIOSK, "solved")).not.toThrow();
  });

  it("drops a pending server retry once the kiosk browser drives the LED", async () => {
    setVaultLed(KIOSK, "solved");
    await last().fail(refused());
    setVaultLed({ mode: "kiosk", vaultLedRoute: "browser" }, "reset");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(urls()).toEqual([`${BASE}/setGreen`]);
  });

  it("lets a request already in flight finish when its retries are cancelled", async () => {
    const led = startVaultLed()!;
    setVaultLed(KIOSK, "solved");
    cancelVaultLedRetries({ vaultLedRoute: "browser" });
    await last().fail(refused());
    expect(led.status()).toMatchObject({ color: "green", result: "unconfirmed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pending).toHaveLength(1);
  });

  it("keeps retrying when the server still drives the LED", async () => {
    setVaultLed(KIOSK, "solved");
    await last().fail(refused());
    cancelVaultLedRetries({ vaultLedRoute: "server" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(pending).toHaveLength(2);
  });

  it("stops retrying once stopped", async () => {
    setVaultLed(KIOSK, "solved");
    await last().fail(refused());
    stopVaultLed();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pending).toHaveLength(1);
  });
});

describe("/api/admin/vaultLed", () => {
  function call(method: string, body?: unknown) {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      setHeader() {
        return this;
      },
    };
    const done = handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse);
    return { res, done };
  }

  it("reports when the LED isn't configured", async () => {
    vi.stubEnv("PI_BASE_URL", "");
    const get = call("GET");
    await get.done;
    expect(get.res.body).toEqual({ configured: false, target: null, status: null });
    const post = call("POST", { color: "green" });
    await post.done;
    expect(post.res.statusCode).toBe(409);
  });

  it("rejects an unknown color", async () => {
    vi.stubEnv("PI_BASE_URL", BASE);
    const { res, done } = call("POST", { color: "blue" });
    await done;
    expect(res.statusCode).toBe(400);
    expect(pending).toHaveLength(0);
  });

  it("sends the color and answers with the Pi's outcome", async () => {
    vi.stubEnv("PI_BASE_URL", BASE);
    const { res, done } = call("POST", { color: "off" });
    expect(last().url).toBe(`${BASE}/setOff`);
    await last().reply(503);
    await done;
    expect(res.body).toMatchObject({
      configured: true,
      target: BASE,
      status: { color: "off", result: "unconfirmed", detail: "HTTP 503" },
    });
  });

  it("says so when its color is replaced before it's sent", async () => {
    vi.stubEnv("PI_BASE_URL", BASE);
    setVaultLed(KIOSK, "reset");
    const { res, done } = call("POST", { color: "green" });
    setVaultLed(KIOSK, "reset"); // a new player starts while green is queued
    await done;
    expect(res.body).toMatchObject({
      status: { color: "green", result: "unconfirmed", detail: "replaced by red before it was sent" },
    });
    await pending[0].reply();
    expect(urls()).toEqual([`${BASE}/setRed`]);
  });

  it("still reports a color that was already in flight when replaced", async () => {
    vi.stubEnv("PI_BASE_URL", BASE);
    const { res, done } = call("POST", { color: "green" });
    setVaultLed(KIOSK, "reset");
    await pending[0].reply();
    await done;
    expect(res.body).toMatchObject({ status: { color: "green", result: "accepted" } });
    expect(urls()).toEqual([`${BASE}/setGreen`, `${BASE}/setRed`]);
  });

  it("waits for its own color when another request is in flight", async () => {
    vi.stubEnv("PI_BASE_URL", BASE);
    setVaultLed(KIOSK, "reset");
    const { res, done } = call("POST", { color: "green" });
    await pending[0].reply();
    expect(res.statusCode).toBe(0);
    await pending[1].reply();
    await done;
    expect(res.body).toMatchObject({ status: { color: "green", result: "accepted" } });
  });
});
