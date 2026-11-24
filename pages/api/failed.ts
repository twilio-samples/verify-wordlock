
import type { NextApiResponse } from "next";

import { stringifySetCookie, parseCookie } from "cookie";
import { getGameConfig } from "../../utils/gameConfig";
import { SESSION_COOKIE, trackFunnelEvent } from "../../utils/funnel";
import { endPuzzle } from "../../utils/puzzleSession";

type ResponseData = {
  message: string,
};

export default async function handler( _req: any, // NextApiRequest is not used in this handler,
  res: NextApiResponse<ResponseData>,
) {
  const { attempts: maxAttempts } = await getGameConfig();
  try {
    const cookies = parseCookie(res.req.headers.cookie || '');
    const attempt = Number(cookies.attempt || '0');
    // This run is over; the next visit to /puzzle starts a new word.
    await endPuzzle(cookies[SESSION_COOKIE]);
    // The puzzle only fails by running out of time. On the last try the
    // player is out of the game (#24): an unsolved puzzle, not a walk-away.
    const now = Date.now();
    const outOfTries = attempt + 1 >= maxAttempts;
    await trackFunnelEvent(cookies[SESSION_COOKIE], outOfTries ? { timedOutAt: now, unsolvedAt: now } : { timedOutAt: now });

    if (attempt >= maxAttempts) {
      return res.status(200).json({ message: "Maximum attempts reached. Please try again later." });
    }
      const cookie = stringifySetCookie({
          name: 'attempt',
          value: (attempt+1).toString(),
          maxAge: 60 * 60 * 24, // One day
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        })
        res.setHeader('Set-Cookie', cookie)
        return res.status(200).json({ message: "Try Noted" });
  }
  catch(error) {
    if (error instanceof Error) {
      console.log(error);
      return res.status(500).json({ message: "Ooops something went wrong" });
    }
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
