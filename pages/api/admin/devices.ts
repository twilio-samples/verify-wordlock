
import type { NextApiRequest, NextApiResponse } from "next";

import {getLocks, getBridges, getLockInfo} from "../../../utils/locks"

type ResponseData = {
  message: string,
  locks?: { deviceId: string, [key: string]: any }[],
 bridge?: { deviceId: string, [key: string]: any },
};

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {

  try {
    const allLocks = await getLocks();
    const lockDetails:{deviceId:string, [key: string]: any}[]  = await Promise.all(allLocks.map( async (lock:{deviceId:string}) => {
      const deviceInfo= await getLockInfo(lock.deviceId);
      return {...lock, ...deviceInfo}
    }))
    const bridge = await getBridges();
   
    res.status(200).json({ message: "Device Status Updated", locks: lockDetails, bridge });
  } catch (error) {
    if (error instanceof Error) {
      res.status(500).json({ message: error.message })
    } else {
      res.status(500).json({ message: "Ooops something went wrong" })
    }
  }
}
