import type { NextApiRequest, NextApiResponse } from "next";
import { expiredPlayerCookies } from "../../utils/playerSession";

// Local-dev-only helper: clears every cookie the game flow sets (session,
// verified, attempt, winner) so you can replay the funnel from a fresh
// state without opening an incognito window each time. Kiosk mode does the
// same on its own at the start screen (utils/playerSession.ts).
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }

  res.setHeader("Set-Cookie", expiredPlayerCookies());

  return res.status(200).json({ message: "Session reset" });
}
