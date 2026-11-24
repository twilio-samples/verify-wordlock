import type { NextApiRequest, NextApiResponse } from "next";

import { unlock, getBridges } from "../../utils/locks";
import { stringifySetCookie, parseCookie } from "cookie";
import { SESSION_COOKIE, trackFunnelEvent } from "../../utils/funnel";
import { claimPrize } from "../../utils/prizeClaim";
import { getGameConfig } from "../../utils/gameConfig";
import { hasAlreadyWon, winnerCookieValue, type WinnerPolicy } from "../../utils/winnerPolicy";
import { consumeSolvedPuzzle, consumeVerification, endPuzzle, isVerified } from "../../utils/puzzleSession";
import { setVaultLed } from "../../utils/vaultLed";
import { sendPrizeMessage } from "../../utils/prizeMessage";

type ResponseData = {
  message: string;
  prize?: string;
  boxNumber?: number;
  vault?: boolean;
};

function setWinnerCookie(res: NextApiResponse, policy: WinnerPolicy) {
  const value = winnerCookieValue(policy);
  if (value === null) return; // infinite: never gate replays, so don't set a cookie at all

  const cookie = stringifySetCookie({
    name: "winner",
    value,
    // A generous safety margin, not the enforcement mechanism itself --
    // hasAlreadyWon() re-evaluates the stored value against whatever policy
    // is active on each read, so this just needs to outlive that window.
    maxAge: policy === "lifetime" ? 60 * 60 * 24 * 365 * 100 : 60 * 60 * 24 * 2,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.setHeader("Set-Cookie", cookie);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  try {
    const config = await getGameConfig();
    // Only asked for when a lock is opened: a kiosk vault without a lock
    // never needs igloohome.
    const bridgeID = async () => (await getBridges()).deviceId;

    // Game win: the server picks and reserves the prize, so concurrent
    // winners can never race each other onto the same box.
    if (req.body.win) {
      const cookies = parseCookie(req.headers.cookie || "");
      const sessionId = cookies[SESSION_COOKIE];
      // The server decides who won: a verified session that solved its
      // puzzle (or any verified session in 2FA-only mode). Verified per the
      // server's record, not the `verified` cookie, which anyone can set.
      if (!(await isVerified(sessionId))) {
        return res.status(403).json({ message: "Not a winner yet" });
      }
      if (hasAlreadyWon(config.winnerPolicy, cookies.winner, config.winnerResetAt)) {
        return res.status(403).json({ message: "Already won" });
      }
      // Checked last: a solved run (or, in 2FA-only mode, a passed Verify
      // check) is good for exactly one win. Give it back if the win then
      // fails, so the attendee's retry can still go through.
      const release = config.puzzleEnabled ? await consumeSolvedPuzzle(sessionId) : await consumeVerification(sessionId);
      // Tells /stats this "solve" had no puzzle.
      const twoFactorOnly = config.puzzleEnabled ? {} : { twoFactorOnly: true };
      if (!release) {
        return res.status(403).json({ message: "Not a winner yet" });
      }

      // Kiosk: one vault holds every prize; the attendee picks theirs there.
      // Without a vault lock, the win is just the LED going green.
      if (config.mode === "kiosk") {
        try {
          if (config.vaultLockId) await unlock(config.vaultLockId, await bridgeID());
        } catch (error) {
          console.log(error);
          await release();
          return res.status(500).json({ message: "Error" });
        }
        // Already green after a puzzle solve; this covers 2FA-only mode.
        setVaultLed(config, "solved");
        // No winner cookie: on a shared tablet it would mark the device, not
        // the person, and lock out every later player.
        await endPuzzle(sessionId);
        const now = Date.now();
        await trackFunnelEvent(sessionId, { solvedAt: now, boxOpenedAt: now, ...twoFactorOnly });
        return res.status(200).json({ message: "Vault Unlocked", vault: true });
      }

      let claim;
      let bridge;
      try {
        // Before the reservation: its 20s window should only have to cover
        // the unlock, or a slow igloohome could let a second winner claim
        // the same box.
        bridge = await bridgeID();
        claim = await claimPrize(sessionId);
      } catch (error) {
        console.log(error);
        await release();
        return res.status(500).json({ message: "Error" });
      }

      if (!claim) {
        await release();
        return res.status(409).json({ message: "No Available Boxes" });
      }

      try {
        await unlock(claim.prize.lockId, bridge);
      } catch (error) {
        console.log(error);
        await release();
        return res.status(500).json({ message: "Error" });
      }

      setWinnerCookie(res, config.winnerPolicy);
      await endPuzzle(sessionId);
      await sendPrizeMessage(sessionId, req.body.recipient, { name: claim.prize.name, boxNumber: claim.boxNumber });

      const now = Date.now();
      await trackFunnelEvent(sessionId, {
        solvedAt: now,
        boxOpenedAt: now,
        prize: claim.prize.name,
        ...twoFactorOnly,
      });

      return res.status(200).json({
        message: "Box Unlocked",
        prize: claim.prize.name,
        boxNumber: claim.boxNumber,
      });
    }

    return res.status(400).json({ message: "Missing win" });
  } catch (error) {
    if (error instanceof Error) {
      console.log(error);
      return res.status(500).json({ message: "Error" });
    }
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
