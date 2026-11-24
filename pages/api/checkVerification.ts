import twilioClient from 'twilio'
import type { NextApiRequest, NextApiResponse } from 'next'
import { stringifySetCookie, parseCookie } from 'cookie';
import { SESSION_COOKIE, trackFunnelEvent } from '../../utils/funnel';
import { getGameConfig } from '../../utils/gameConfig';
import { recordVerification } from '../../utils/puzzleSession';
import { recipientHash } from '../../utils/prizeMessage';

const twilio = twilioClient(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)


type ResponseData = {
  message?: string
  valid?: boolean
  status?: string
  skipPuzzle?: boolean
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const { code, address } = req.body;

  try {
    const verificationCheck = await twilio.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID as string)
      .verificationChecks.create({
        code,
        to: address
      }
    )

    const config = await getGameConfig();
    if (!verificationCheck.valid) {
      return res.status(200).json({ valid: false, status: verificationCheck.status, skipPuzzle: !config.puzzleEnabled })
    }

    // Only a correct code may unlock the puzzle and win paths.
    const cookie = stringifySetCookie({
      name: 'verified',
      value: 'true',
      maxAge: 60 * 60 * 24, // One day
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    res.setHeader('Set-Cookie', cookie)

    const sessionId = parseCookie(req.headers.cookie || '')[SESSION_COOKIE];
    // The win path sends the prize message only to this number.
    await recordVerification(sessionId, Date.now(), sessionId && typeof address === 'string' ? recipientHash(sessionId, address) : undefined);
    // 2FA-only sessions are left out of the puzzle stats on /stats.
    await trackFunnelEvent(sessionId, { verifiedAt: Date.now(), ...(config.puzzleEnabled ? {} : { twoFactorOnly: true }) });

    return res.status(200).json({
      valid: verificationCheck.valid,
      status: verificationCheck.status,
      skipPuzzle: !config.puzzleEnabled,
    })
  } catch (error) {
    if (error instanceof Error) {
      const twilioError = error as any;
      console.log(twilioError.code)
      if (twilioError.code === 20404) {
        res.status(500).json({message: "Your Verification Request wasn't found. Hit back and enter your number again."})
      }
      return res.status(500).json({message: error.message})
    }
    return res.status(500).json({message: "Ooops something went wrong"})
  }

}
