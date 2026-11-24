import { vi } from "vitest";

/**
 * In-memory stand-in for utils/sync.ts. Items are cloned on the way in and
 * out like a real network store, and carry a revision so optimistic writes
 * behave like Sync's If-Match.
 *
 *   vi.mock("../utils/sync", async () => (await import("./fakeSync")).fakeSync);
 */
export const store = new Map<string, { data: unknown; revision: number }>();
const k = (map: string, key: string) => `${map}/${key}`;

export const getItem = (map: string, key: string) => store.get(k(map, key))?.data;
export const setItem = (map: string, key: string, data: unknown) => {
  const prev = store.get(k(map, key));
  store.set(k(map, key), { data: structuredClone(data), revision: (prev?.revision ?? 0) + 1 });
};
export const deleteItem = (map: string, key: string) => store.delete(k(map, key));

export const fakeSync = {
  getMapItem: vi.fn(async (map: string, key: string) => structuredClone(getItem(map, key) ?? null)),
  getMapItemWithRevision: vi.fn(async (map: string, key: string) => {
    const item = store.get(k(map, key));
    return item ? { data: structuredClone(item.data), revision: String(item.revision) } : null;
  }),
  updateMapItemIfMatch: vi.fn(async (map: string, key: string, data: unknown, revision: string) => {
    const item = store.get(k(map, key));
    if (!item || String(item.revision) !== revision) return false;
    setItem(map, key, data);
    return true;
  }),
  upsertMapItem: vi.fn(async (map: string, key: string, data: unknown) => setItem(map, key, data)),
  removeMapItem: vi.fn(async (map: string, key: string) => {
    deleteItem(map, key);
  }),
  tryClaim: vi.fn(async (map: string, key: string, data: unknown) => {
    if (store.has(k(map, key))) return false;
    setItem(map, key, data);
    return true;
  }),
  listMapItems: vi.fn(async (map: string) =>
    [...store.entries()].filter(([key]) => key.startsWith(`${map}/`)).map(([, item]) => structuredClone(item.data))
  ),
  clearMap: vi.fn(async (map: string) => {
    for (const key of store.keys()) if (key.startsWith(`${map}/`)) store.delete(key);
  }),
};
