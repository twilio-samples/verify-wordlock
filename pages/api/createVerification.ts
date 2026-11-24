const twilio = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
import type { NextApiRequest, NextApiResponse } from "next";
import { parseCookie } from "cookie";
import { codeSentEvent, SESSION_COOKIE, trackFunnelEvent } from "../../utils/funnel";

type ResponseData = {
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const { channel, address } = req.body;

  try {
    let to = address;
    await twilio.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        channel,
        to,
      });

    const sessionId = parseCookie(req.headers.cookie || "")[SESSION_COOKIE];
    await trackFunnelEvent(sessionId, codeSentEvent(channel, to));

    res.status(200).json({ message: "Verification Created" });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Invalid parameter `To`")) {
        res.status(500).json({ message: "Invalid phone format" });
        return;
      }
      res.status(500).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: "Ooops something went wrong" });
  }
}
