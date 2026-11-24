import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sync from "../utils/sync";
import { getGameConfig, saveGameConfig, resetWinners, clearGameConfigCache, DEFAULT_CONFIG } from "../utils/gameConfig";
import { getItem, setItem, store } from "./fakeSync";

// vi.mock is hoisted above the imports, so these modules load against the fake.

vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);

const MAP = "game-config";
const KEY = "active";

beforeEach(() => {
  store.clear();
  clearGameConfigCache();
  vi.mocked(sync.upsertMapItem).mockClear();
  vi.mocked(sync.updateMapItemIfMatch).mockClear();
});

describe("getGameConfig", () => {
  it("seeds the default config when nothing is stored", async () => {
    expect(await getGameConfig()).toEqual(DEFAULT_CONFIG);
    expect(getItem(MAP, KEY)).toEqual(DEFAULT_CONFIG);
  });

  it("migrates a stored v1 config and persists the upgrade once", async () => {
    setItem(MAP, KEY, {
      words: ["PHONE"],
      hints: ["h1"],
      time: 60,
      attempts: 3,
      prizes: [{ name: "Socks", lockId: "SP1" }],
      winnerPolicy: "lifetime",
      winnerResetAt: 42,
    });

    const config = await getGameConfig();
    expect(config.version).toBe(5);
    expect(config.solutionWords).toEqual([{ word: "PHONE", hints: ["h1"] }]);
    expect(config.winnerResetAt).toBe(42);
    expect(getItem(MAP, KEY)).toEqual(config);

    clearGameConfigCache();
    vi.mocked(sync.updateMapItemIfMatch).mockClear();
    await getGameConfig();
    expect(sync.updateMapItemIfMatch).not.toHaveBeenCalled();
  });

  it("serves the migrated config even if persisting the upgrade fails", async () => {
    const v1 = { words: ["PHONE"], hints: [], time: 60, attempts: 3, prizes: [{ name: "Mug", lockId: "SP9" }], winnerPolicy: "lifetime" };
    setItem(MAP, KEY, v1);
    vi.mocked(sync.updateMapItemIfMatch).mockRejectedValueOnce(new Error("sync write failed"));

    const config = await getGameConfig();
    expect(config.prizes).toEqual(v1.prizes);
    expect(getItem(MAP, KEY)).toEqual(v1);
  });

  it("falls back to defaults without overwriting an unreadable stored config", async () => {
    const broken = { version: 5, prizes: "not-an-array" };
    setItem(MAP, KEY, broken);

    expect(await getGameConfig()).toEqual(DEFAULT_CONFIG);
    expect(getItem(MAP, KEY)).toEqual(broken);
  });

  it("falls back to defaults when Sync is unreachable", async () => {
    vi.mocked(sync.getMapItemWithRevision).mockRejectedValueOnce(new Error("network"));
    expect(await getGameConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe("saveGameConfig / resetWinners", () => {
  it("keeps the stored winnerResetAt when the admin form saves", async () => {
    setItem(MAP, KEY, { ...DEFAULT_CONFIG, winnerResetAt: 1234 });
    const { version: _v, winnerResetAt: _w, ...input } = DEFAULT_CONFIG;

    const saved = await saveGameConfig({ ...input, time: 30 });
    expect(saved.winnerResetAt).toBe(1234);
    expect(saved.version).toBe(5);
    expect(saved.time).toBe(30);
  });

  it("does not roll back a reset made by another instance while this one's cache is warm", async () => {
    setItem(MAP, KEY, { ...DEFAULT_CONFIG, winnerResetAt: 100 });
    await getGameConfig(); // cache holds winnerResetAt=100
    setItem(MAP, KEY, { ...DEFAULT_CONFIG, winnerResetAt: 200 }); // another instance resets
    const { version: _v, winnerResetAt: _w, ...input } = DEFAULT_CONFIG;

    expect((await saveGameConfig(input)).winnerResetAt).toBe(200);
  });

  it("never lets an admin save and a winner reset overwrite each other", async () => {
    setItem(MAP, KEY, { ...DEFAULT_CONFIG, winnerResetAt: 100 });
    const { version: _v, winnerResetAt: _w, ...input } = DEFAULT_CONFIG;
    // Another instance resets winners after this save reads the config, before it writes.
    vi.mocked(sync.getMapItemWithRevision).mockImplementationOnce(async (map, key) => {
      const read = structuredClone(store.get(`${map}/${key}`)!);
      setItem(MAP, KEY, { ...DEFAULT_CONFIG, winnerResetAt: 200 });
      return { data: read.data, revision: String(read.revision) };
    });

    const saved = await saveGameConfig({ ...input, time: 30 });
    expect(saved).toMatchObject({ time: 30, winnerResetAt: 200 });
    expect(getItem(MAP, KEY)).toEqual(saved);
  });

  it("does not undo an admin save when a stale instance persists a migration", async () => {
    setItem(MAP, KEY, { words: ["PHONE"], hints: [], time: 60, attempts: 3, prizes: [{ name: "Mug", lockId: "SP9" }] });
    // An admin save lands between this instance reading the v1 config and persisting its migration.
    vi.mocked(sync.getMapItemWithRevision).mockImplementationOnce(async (map, key) => {
      const read = structuredClone(store.get(`${map}/${key}`)!);
      setItem(MAP, KEY, { ...DEFAULT_CONFIG, time: 45 });
      return { data: read.data, revision: String(read.revision) };
    });

    await getGameConfig();
    expect(getItem(MAP, KEY)).toMatchObject({ time: 45 });
  });

  it("saves onto an empty store", async () => {
    const { version: _v, winnerResetAt: _w, ...input } = DEFAULT_CONFIG;
    expect(await saveGameConfig({ ...input, time: 30 })).toMatchObject({ time: 30, winnerResetAt: 0, version: 5 });
    expect(getItem(MAP, KEY)).toMatchObject({ time: 30 });
  });

  it("never seeds the default over a config another instance just saved", async () => {
    const { version: _v, winnerResetAt: _w, ...input } = DEFAULT_CONFIG;
    // Both instances find the store empty; the other one's save lands first.
    vi.mocked(sync.getMapItemWithRevision).mockImplementationOnce(async () => {
      setItem(MAP, KEY, { ...DEFAULT_CONFIG, time: 45 });
      return null;
    });
    expect(await getGameConfig()).toMatchObject({ time: 45 });
    expect(getItem(MAP, KEY)).toMatchObject({ time: 45 });

    vi.mocked(sync.getMapItemWithRevision).mockImplementationOnce(async () => {
      setItem(MAP, KEY, { ...DEFAULT_CONFIG, time: 45, winnerResetAt: 9 });
      return null;
    });
    // Our save retries against the stored config instead of overwriting it.
    expect(await saveGameConfig({ ...input, time: 30 })).toMatchObject({ time: 30, winnerResetAt: 9 });
  });

  it("resetWinners bumps winnerResetAt and leaves the rest alone", async () => {
    setItem(MAP, KEY, DEFAULT_CONFIG);
    const before = Date.now();
    const saved = await resetWinners();
    expect(saved.winnerResetAt).toBeGreaterThanOrEqual(before);
    expect({ ...saved, winnerResetAt: 0 }).toEqual(DEFAULT_CONFIG);
  });
});
