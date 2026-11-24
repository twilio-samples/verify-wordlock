import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSetCookie } from "cookie";
import { KioskContext } from "../components/KioskContext";
import { clearGameConfigCache, DEFAULT_CONFIG, type GameConfig } from "../utils/gameConfig";
import { remainingTries } from "../utils/playerSession";
import Failed, { getServerSideProps as failedProps } from "../pages/failed";
import Complete from "../pages/complete";
import PreviousWinner from "../pages/previousWinner";
import ErrorPage from "../pages/error";
import failedHandler from "../pages/api/failed";
import { getServerSideProps as puzzleProps } from "../pages/puzzle";
import { recordVerification } from "../utils/puzzleSession";
import { callApi } from "./apiHelpers";
import { setItem, store } from "./fakeSync";

// vi.mock is hoisted above the imports, so these modules load against the fakes.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
vi.mock("../utils/vaultLed", () => ({ setVaultLed: vi.fn() }));

const SID = "sid-1";
const CONFIG: GameConfig = { ...DEFAULT_CONFIG, attempts: 3 };

beforeEach(() => {
  store.clear();
  clearGameConfigCache();
  setItem("game-config", "active", CONFIG);
});

/** Renders a page as _app would, in kiosk or device mode. */
function render(page: ComponentType<any>, props: object, kiosk: boolean) {
  const value = kiosk ? { idleTimeoutSeconds: 60, vaultLedUrl: null } : null;
  return renderToStaticMarkup(createElement(KioskContext.Provider, { value }, createElement(page, props)));
}

const ctx = (cookie: string) => ({ req: { headers: { cookie } }, res: { setHeader: () => {} }, query: {} });

describe("remainingTries", () => {
  it("counts down from the configured tries, never below zero", () => {
    expect(remainingTries(undefined, 3)).toBe(3);
    expect(remainingTries("1", 3)).toBe(2);
    expect(remainingTries("3", 3)).toBe(0);
    expect(remainingTries("9", 3)).toBe(0);
    expect(remainingTries("junk", 3)).toBe(3);
  });
});

describe("retries (#22)", () => {
  it("offers another try while tries are left, in both modes", async () => {
    const { props } = (await failedProps(ctx("attempt=1"))) as { props: any };
    expect(props.triesLeft).toBe(2);
    for (const kiosk of [true, false]) {
      const html = render(Failed, { ...props, mode: kiosk ? "kiosk" : "device" }, kiosk);
      expect(html).toContain('href="/puzzle"');
      expect(html).toContain("Try again (2 left)");
      expect(html).toContain("2 tries left");
      expect(html).not.toContain("Start over");
    }
  });

  it("says 1 try, not 1 tries", () => {
    expect(render(Failed, { mode: "device", triesLeft: 1 }, false)).toContain("1 try left");
  });

  it("is the final page once every try is used", async () => {
    const { props } = (await failedProps(ctx("attempt=3"))) as { props: any };
    expect(props.triesLeft).toBe(0);
    const html = render(Failed, props, false);
    expect(html).not.toContain('href="/puzzle"');
    expect(html).toContain("Delivery not released");
  });

  it("each timeout uses a try, and /puzzle starts a new run until they're gone", async () => {
    await recordVerification(SID);
    let attempt = 0;
    for (let tried = 1; tried <= CONFIG.attempts; tried++) {
      expect(await puzzleProps(ctx(`sid=${SID}; attempt=${attempt}`))).toHaveProperty("props.view");
      const res = await callApi(failedHandler, { cookies: { sid: SID, attempt: String(attempt) } });
      const set = res.headers["Set-Cookie"];
      if (set) attempt = Number(parseSetCookie(set as string).value);
      const { props } = (await failedProps(ctx(`attempt=${attempt}`))) as { props: any };
      expect(props.triesLeft).toBe(CONFIG.attempts - tried);
    }
    expect(await puzzleProps(ctx(`sid=${SID}; attempt=${attempt}`))).toMatchObject({ redirect: { destination: "/failed" } });
  });
});

describe("Start over (#23)", () => {
  const pages: [string, ComponentType<any>, object][] = [
    ["/failed (final)", Failed, { mode: "kiosk", triesLeft: 0 }],
    ["/complete", Complete, { mode: "kiosk", prize: "Socks", boxNumber: "2" }],
    ["/previousWinner", PreviousWinner, { winnerPolicy: "lifetime" }],
    ["/error", ErrorPage, {}],
  ];

  it.each(pages)("%s has a Start over link to the untagged start screen in kiosk mode", (_name, page, props) => {
    const html = render(page, props, true);
    // Plain "/": only the idle guard's "/?idle=1" counts as a walk-away.
    expect(html).toContain('<a class="btn btn-ghost" href="/">Start over</a>');
  });

  it.each(pages)("%s has no Start over in device mode", (_name, page, props) => {
    expect(render(page, props, false)).not.toContain("Start over");
  });
});
