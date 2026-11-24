import type { NextApiRequest, NextApiResponse } from "next";
import { resetFunnelStats } from "../../../utils/funnel";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await resetFunnelStats();
    return res.status(200).json({ message: "Stats reset" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
