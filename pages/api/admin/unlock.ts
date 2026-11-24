import type { NextApiRequest, NextApiResponse } from "next";
import { getBridges, unlock } from "../../../utils/locks";

/** Manual unlock from /admin: POST { lockId } opens that lock. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }
  const lockId = req.body?.lockId;
  if (typeof lockId !== "string" || !lockId) {
    return res.status(400).json({ message: "Missing lockId" });
  }

  try {
    await unlock(lockId, (await getBridges()).deviceId);
    return res.status(200).json({ message: "Box Unlocked" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Ooops something went wrong" });
  }
}
