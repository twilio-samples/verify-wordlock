import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config as proxyConfig } from "../proxy";

describe("Basic Auth", () => {
  const guarded = (url: string) => unstable_doesMiddlewareMatch({ config: proxyConfig, url });

  it("covers every route that opens a lock or reads the lock list", () => {
    expect(guarded("/api/admin/unlock")).toBe(true);
    expect(guarded("/api/admin/devices")).toBe(true);
    expect(guarded("/admin")).toBe(true);
    expect(guarded("/stats")).toBe(true);
  });

  it("leaves the player routes open", () => {
    for (const route of ["/", "/puzzle", "/api/unlockBox", "/api/checkVerification", "/api/puzzle/guess"]) {
      expect(guarded(route)).toBe(false);
    }
  });
});
