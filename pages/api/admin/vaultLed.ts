import type { NextApiRequest, NextApiResponse } from "next";
import { startVaultLed, VAULT_LED_COLORS, type VaultLedColor } from "../../../utils/vaultLed";

/**
 * Vault LED test panel on /admin: GET returns the last request's outcome,
 * POST { color: "off" | "green" | "red" } sends one and waits for the Pi's
 * answer (up to the 5s timeout). Works in either mode, so the onsite team can
 * check the light before switching the event to kiosk.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const led = startVaultLed();
  if (req.method === "GET") {
    return res.status(200).json({ configured: Boolean(led), target: led?.target ?? null, status: led?.status() ?? null });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }
  const color = req.body?.color as VaultLedColor;
  if (!VAULT_LED_COLORS.includes(color)) {
    return res.status(400).json({ message: `color must be one of ${VAULT_LED_COLORS.join(", ")}` });
  }
  if (!led) {
    return res.status(409).json({ message: "PI_BASE_URL isn't set, so the vault LED is off" });
  }
  const status = await led.test(color);
  return res.status(200).json({ configured: true, target: led.target, status });
}
