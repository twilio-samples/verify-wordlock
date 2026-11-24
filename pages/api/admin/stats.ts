import type { NextApiRequest, NextApiResponse } from "next";
import { funnelStatsCsv, getFunnelStats } from "../../../utils/funnel";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const stats = await getFunnelStats();
    res.setHeader("Cache-Control", "no-store");
    if (req.query.format === "csv") {
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="wordlock-stats-${date}.csv"`);
      return res.status(200).send(funnelStatsCsv(stats));
    }
    return res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
