import { createHmac, timingSafeEqual } from "node:crypto";
import twilio from "twilio";
import { verifiedRecipient } from "./puzzleSession";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * A keyed hash of the number a session verified, so the win path can check
 * the prize message goes to that number without the number being stored.
 * Keyed with the auth token: a phone number alone is easy to brute-force.
 */
export function recipientHash(sessionId: string, address: string) {
  return createHmac("sha256", process.env.TWILIO_AUTH_TOKEN ?? "").update(`${sessionId}:${address}`).digest("hex");
}

/**
 * Device mode: tells the winner their prize and box. Sent only to the number
 * this session verified, so the endpoint can't be used to message anyone
 * else. Best effort: the box is already open, so a failure is only logged.
 */
export async function sendPrizeMessage(
  sessionId: string | undefined,
  recipient: { address?: unknown; channel?: unknown } | undefined,
  prize: { name: string; boxNumber: number }
) {
  const { address, channel } = recipient ?? {};
  if (!sessionId || typeof address !== "string" || !address) return false;

  const expected = await verifiedRecipient(sessionId);
  const actual = recipientHash(sessionId, address);
  if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    console.log("Prize message skipped: the number isn't the one this session verified");
    return false;
  }

  try {
    await client.messages.create({
      to: channel === "whatsapp" ? `whatsapp:${address}` : address,
      from: process.env.TWILIO_MESSAGING_SERVICE_SID,
      contentSid: process.env.TWILIO_CONTENT_SID,
      contentVariables: JSON.stringify({ "1": `#${prize.boxNumber}`, "2": prize.name }),
    });
    return true;
  } catch (error) {
    // Never log the error object: it echoes the To number.
    console.log("Prize message failed", (error as { code?: unknown })?.code ?? "");
    return false;
  }
}
