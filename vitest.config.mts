import { transformAsync } from "@babel/core";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [{
    name: "component-jsx",
    enforce: "pre",
    async transform(code, id) {
      if (!id.includes("/components/") || !id.endsWith(".js")) return;
      const result = await transformAsync(code, {
        filename: id,
        presets: [["@babel/preset-react", { runtime: "automatic" }]],
        babelrc: false,
        configFile: false,
      });
      return result?.code ?? undefined;
    },
  }],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Some tests fail Sync or the lock on purpose, and the app logs it. Show
    // those logs only when a test fails, so a passing run reads clean.
    silent: "passed-only",
  },
});
