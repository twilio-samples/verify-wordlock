import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addressSpace, createBrowserVaultLed, setBrowserVaultLed } from "../utils/vaultLedBrowser";

/** Stands in for the browser's fetch to the Pi: each test decides how the two kinds of request end. */
type Outcome = Response | Error;
let cors: () => Outcome;
let noCors: () => Outcome;
const calls: { url: string; init: RequestInit }[] = [];

const blocked = () => new TypeError("Failed to fetch");
const timedOut = () => Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
const opaque = () => new Response(null, { status: 200 });

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const outcome = init.mode === "no-cors" ? noCors() : cors();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const BASE = "http://192.168.0.48";

describe("addressSpace", () => {
  it("declares only what the Pi's address shows", () => {
    expect(addressSpace("http://192.168.0.48")).toBe("local");
    expect(addressSpace("http://10.1.2.3:8080")).toBe("local");
    expect(addressSpace("http://172.20.0.5")).toBe("local");
    expect(addressSpace("http://vault-pi.local")).toBe("local");
    expect(addressSpace("http://[fd00::5]")).toBe("local");
    expect(addressSpace("http://127.0.0.1:8765")).toBe("loopback");
    expect(addressSpace("http://localhost:8765")).toBe("loopback");
    expect(addressSpace("http://172.32.0.5")).toBeUndefined();
    expect(addressSpace("https://vault-pi.example.com")).toBeUndefined();
  });
});

describe("createBrowserVaultLed", () => {
  it("is accepted when the Pi allows CORS and answers 2xx", async () => {
    cors = () => new Response("OK", { status: 200 });
    const status = await createBrowserVaultLed(`${BASE}/`).test("green");
    expect(status).toMatchObject({ color: "green", result: "accepted" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/setGreen`);
    expect(calls[0].init).toMatchObject({ cache: "no-store", keepalive: true, targetAddressSpace: "local" });
    const tunnel = createBrowserVaultLed("https://vault-pi.example.com");
    await tunnel.test("green");
    expect(calls[1].init).not.toHaveProperty("targetAddressSpace");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries an error status like the server does", async () => {
    let status = 503;
    cors = () => new Response(null, { status });
    const led = createBrowserVaultLed(BASE);
    expect(await led.test("red")).toMatchObject({ result: "unconfirmed", detail: "HTTP 503" });
    status = 200;
    await vi.advanceTimersByTimeAsync(1000);
    expect(led.status()).toMatchObject({ color: "red", result: "accepted" });
  });

  it("is unconfirmed, without retrying, when the Pi answers but doesn't allow CORS", async () => {
    cors = blocked;
    noCors = opaque;
    const led = createBrowserVaultLed(BASE);
    const status = await led.test("green");
    expect(status).toMatchObject({ result: "unconfirmed", detail: expect.stringContaining("CORS") });
    expect(calls.map((call) => call.init.mode)).toEqual([undefined, "no-cors"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(2);
  });

  it("retries when the Pi can't be reached or the browser blocks the request", async () => {
    cors = blocked;
    noCors = blocked;
    const led = createBrowserVaultLed(BASE);
    expect(await led.test("green")).toMatchObject({ result: "unconfirmed", detail: expect.stringContaining("local network") });
    cors = opaque;
    await vi.advanceTimersByTimeAsync(1000);
    expect(led.status()).toMatchObject({ result: "accepted" });
  });

  it("reports a timeout without a second request", async () => {
    cors = timedOut;
    const status = await createBrowserVaultLed(BASE).test("off");
    expect(status).toMatchObject({ result: "unconfirmed", detail: "timed out after 5s" });
    expect(calls).toHaveLength(1);
  });
});

describe("setBrowserVaultLed", () => {
  it("only sends when kioskProps handed the browser the Pi's address", async () => {
    cors = opaque;
    setBrowserVaultLed(null, "solved");
    setBrowserVaultLed({ idleTimeoutSeconds: 60, vaultLedUrl: null }, "solved");
    expect(calls).toHaveLength(0);
    setBrowserVaultLed({ idleTimeoutSeconds: 60, vaultLedUrl: BASE }, "reset");
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((call) => call.url)).toEqual([`${BASE}/setRed`]);
  });
});
