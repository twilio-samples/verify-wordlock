import type { NextApiRequest, NextApiResponse } from "next";

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

/** Calls a pages/api handler with a minimal fake req/res and resolves to the captured response. */
export async function callApi(
  handler: Handler,
  {
    method = "POST",
    body,
    cookies = {},
    query = {},
  }: { method?: string; body?: unknown; cookies?: Record<string, string>; query?: Record<string, string> } = {}
) {
  const res = {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, unknown>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: unknown) {
      this.headers[name] = value;
      return this;
    },
  };
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const req = { method, body, query, headers: { cookie } };
  // Some handlers read the request back off the response.
  await handler(req as unknown as NextApiRequest, Object.assign(res, { req }) as unknown as NextApiResponse);
  return res;
}
