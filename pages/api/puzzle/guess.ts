import type { NextApiRequest, NextApiResponse } from "next";
import { parseCookie } from "cookie";
import { SESSION_COOKIE, trackFunnelEvent } from "../../../utils/funnel";
import { isVerified, submitGuess } from "../../../utils/puzzleSession";
import { getGameConfig } from "../../../utils/gameConfig";
import { setVaultLed } from "../../../utils/vaultLed";

const STATUS = { "no-session": 404, expired: 410, solved: 409, invalid: 400 } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  const cookies = parseCookie(req.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE];
  try {
    // The server's record, not the `verified` cookie, which anyone can set.
    if (!sessionId || !(await isVerified(sessionId))) {
      return res.status(401).json({ message: "Verify your phone first." });
    }
    const result = await submitGuess(sessionId, req.body?.guess);
    if (!result.ok) {
      return res.status(STATUS[result.reason]).json({ reason: result.reason, message: result.message });
    }
    if (result.solve) {
      setVaultLed(await getGameConfig(), "solved");
      await trackFunnelEvent(sessionId, { solvedAt: Date.now(), ...result.solve });
    }
    return res.status(200).json(result.view);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
