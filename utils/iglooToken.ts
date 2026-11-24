import axios from "axios";
import { iglooError } from "./iglooError";
import { getMapItem, upsertMapItem, tryClaim } from "./sync";

const TOKEN_MAP = "igloo-auth";
const TOKEN_KEY = "token";
const REFRESH_LOCK_KEY = "refresh-lock";

// Refresh proactively instead of waiting for the token to actually expire, so
// a request never races a token that's still on file but no longer valid.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_LOCK_TTL_SECONDS = 15;
const LOCK_POLL_MS = 500;
const LOCK_POLL_ATTEMPTS = 10;

export type IglooToken = {
  accessToken: string;
  expiresAt: number;
};

export async function getIglooToken(): Promise<IglooToken | null> {
  const stored = await getMapItem(TOKEN_MAP, TOKEN_KEY);
  return (stored as IglooToken) || null;
}

export async function saveIglooToken(accessToken: string, expiresAt: number): Promise<void> {
  await upsertMapItem(TOKEN_MAP, TOKEN_KEY, { accessToken, expiresAt });
}

// Deliberately not a type predicate: a token can be non-null yet "not fresh"
// (stale but not truly expired), so narrowing the false branch to `null`
// would be wrong.
function isFresh(token: IglooToken | null): boolean {
  return !!token && token.expiresAt - REFRESH_BUFFER_MS > Date.now();
}

/** Always calls igloohome's OAuth endpoint and stores the result, regardless of what's on file. */
export async function refreshIglooToken(): Promise<IglooToken> {
  const { CLIENT_ID, CLIENT_SECRET } = process.env;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("CLIENT_ID/CLIENT_SECRET is not configured");
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  let data;
  try {
    ({ data } = await axios.post(
      "https://auth.igloohome.co/oauth2/token",
      new URLSearchParams({ grant_type: "client_credentials" }),
      { headers: { Authorization: `Basic ${credentials}` } }
    ));
  } catch (error) {
    throw iglooError("Igloo token request failed", error);
  }

  const accessToken = data.access_token;
  const expiresAt = Date.now() + data.expires_in * 1000;
  await saveIglooToken(accessToken, expiresAt);
  return { accessToken, expiresAt };
}

/**
 * Returns a token valid for at least REFRESH_BUFFER_MS, fetching a fresh one
 * when the stored one is missing or expiring soon. Concurrent callers
 * coordinate through a short-lived Sync claim so only one of them calls
 * igloohome's OAuth endpoint at a time; the rest poll for the token it saves.
 * Returns null only if no usable token exists and a fresh fetch also fails
 * (e.g. igloohome is down or CLIENT_ID/CLIENT_SECRET is misconfigured).
 */
export async function ensureIglooToken(): Promise<IglooToken | null> {
  const existing = await getIglooToken();
  if (isFresh(existing)) return existing;

  const gotLock = await tryClaim(TOKEN_MAP, REFRESH_LOCK_KEY, { at: Date.now() }, REFRESH_LOCK_TTL_SECONDS);
  if (gotLock) {
    try {
      return await refreshIglooToken();
    } catch (error) {
      console.error("Igloo token refresh failed:", error);
      return existing && existing.expiresAt > Date.now() ? existing : null;
    }
  }

  for (let attempt = 0; attempt < LOCK_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    const refreshed = await getIglooToken();
    if (isFresh(refreshed)) return refreshed;
  }

  return existing && existing.expiresAt > Date.now() ? existing : null;
}
