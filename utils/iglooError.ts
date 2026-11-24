import { isAxiosError } from "axios";

/**
 * An igloohome API failure, safe to log. Axios errors carry the request
 * config, so logging one prints its Authorization header: the access token,
 * or for the token request the client ID and secret.
 */
export class IglooError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "IglooError";
  }
}

/** Replaces an axios error with an IglooError holding only the status and igloohome's message. */
export function iglooError(action: string, error: unknown): Error {
  if (!isAxiosError(error)) return error instanceof Error ? error : new Error(String(error));
  const status = error.response?.status;
  const body = error.response?.data as { error?: unknown; message?: unknown } | undefined;
  const detail = [body?.error, body?.message, error.message].find((value) => typeof value === "string" && value) as string;
  // No `cause`: logging this error would print the axios error after all.
  return new IglooError(`${action}: ${status ?? "no response"} ${detail.slice(0, 200)}`, status);
}
