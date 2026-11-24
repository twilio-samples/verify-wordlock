import type { NextApiRequest, NextApiResponse } from "next";
import { resetWinners } from "../../../utils/gameConfig";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await resetWinners();
    return res.status(200).json({ message: "Winners reset" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
