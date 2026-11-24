import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function service() {
  return client.sync.v1.services(process.env.SYNC_SERVICE_SID as string);
}

function isNotFound(error: unknown) {
  return (error as { status?: number })?.status === 404;
}

function isConflict(error: unknown) {
  return (error as { status?: number })?.status === 409;
}

async function ensureMap(mapName: string) {
  try {
    await service().syncMaps(mapName).fetch();
  } catch (error) {
    if (!isNotFound(error)) throw error;
    try {
      await service().syncMaps.create({ uniqueName: mapName });
    } catch (createError) {
      if (!isConflict(createError)) throw createError;
    }
  }
}

export async function getMapItem(mapName: string, key: string) {
  try {
    const item = await service().syncMaps(mapName).syncMapItems(key).fetch();
    return item.data;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Like getMapItem, plus the revision to pass to updateMapItemIfMatch. */
export async function getMapItemWithRevision(mapName: string, key: string) {
  try {
    const item = await service().syncMaps(mapName).syncMapItems(key).fetch();
    return { data: item.data, revision: item.revision };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Optimistic write: replaces the item only if nobody changed it since
 * `revision` was read. Returns false on a lost race (Sync answers 412).
 */
export async function updateMapItemIfMatch(
  mapName: string,
  key: string,
  data: Record<string, unknown>,
  revision: string,
  ttlSeconds?: number
): Promise<boolean> {
  try {
    await service()
      .syncMaps(mapName)
      .syncMapItems(key)
      .update({ data, ifMatch: revision, ...(ttlSeconds === undefined ? {} : { ttl: ttlSeconds }) });
    return true;
  } catch (error) {
    if ((error as { status?: number })?.status === 412) return false;
    throw error;
  }
}

export async function upsertMapItem(
  mapName: string,
  key: string,
  data: Record<string, unknown>,
  merge = false,
  ttlSeconds?: number
) {
  await ensureMap(mapName);
  const context = service().syncMaps(mapName).syncMapItems(key);

  const existing = merge ? await getMapItem(mapName, key) : null;
  const nextData = merge ? { ...existing, ...data } : data;
  const ttl = ttlSeconds === undefined ? {} : { ttl: ttlSeconds };

  try {
    return await context.update({ data: nextData, ...ttl });
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return await service().syncMaps(mapName).syncMapItems.create({ key, data: nextData, ...ttl });
  }
}

export async function removeMapItem(mapName: string, key: string) {
  try {
    await service().syncMaps(mapName).syncMapItems(key).remove();
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/**
 * Atomically claims `key` in `mapName` by relying on Sync's create-if-absent
 * semantics: the create call only succeeds if no item with this key exists yet,
 * so concurrent callers racing for the same key can never both "win".
 * Without `ttlSeconds` the item never expires.
 */
export async function tryClaim(
  mapName: string,
  key: string,
  data: Record<string, unknown>,
  ttlSeconds?: number
): Promise<boolean> {
  await ensureMap(mapName);
  try {
    await service()
      .syncMaps(mapName)
      .syncMapItems.create({ key, data, ...(ttlSeconds === undefined ? {} : { ttl: ttlSeconds }) });
    return true;
  } catch (error) {
    if (isConflict(error) || (error as { code?: number })?.code === 54208) return false;
    throw error;
  }
}

export async function listMapItems(mapName: string) {
  await ensureMap(mapName);
  const items = await service().syncMaps(mapName).syncMapItems.list({ pageSize: 100 });
  return items.map((item) => item.data);
}

export async function clearMap(mapName: string) {
  await ensureMap(mapName);
  const items = await service().syncMaps(mapName).syncMapItems.list({ pageSize: 100 });
  await Promise.all(
    items.map((item) => service().syncMaps(mapName).syncMapItems(item.key).remove())
  );
}
