import type { NextApiRequest, NextApiResponse } from "next";
import { GameConfigInputSchema } from "../../../utils/configSchema";
import { getGameConfig, saveGameConfig } from "../../../utils/gameConfig";
import { cancelVaultLedRetries } from "../../../utils/vaultLed";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const config = await getGameConfig();
      return res.status(200).json(config);
    }

    if (req.method === "PUT") {
      // Unknown keys (including server-managed winnerResetAt/version) are
      // stripped by the schema, so the client can never set them.
      const parsed = GameConfigInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid game config",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const saved = await saveGameConfig(parsed.data);
      cancelVaultLedRetries(saved);
      return res.status(200).json(saved);
    }

    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).json({ message: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
