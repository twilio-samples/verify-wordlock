import axios from "axios";
import { iglooError } from "./iglooError";
import { ensureIglooToken } from "./iglooToken";

// const locks = [
//   {
//     id: "1725953431712",
//     type: "Lock",
//     deviceId: "SP3R14d4d414",
//     deviceName: "lock1",
//     batteryLevel: 16,
//     pairedAt: "2024-09-10T08:54:35+00:00",
//     homeId: ["2wbgDkWNRrCzPqGx7"],
//     linkedDevices: [],
//   },
// ];
// const bridge = {
//   id: "1726479436044",
//   type: "Bridge",
//   deviceId: "EB1X015dc87f",
//   deviceName: "bridge",
//   pairedAt: "2024-09-16T09:45:47+00:00",
//   homeId: [],
//   linkedDevices: [[Object]],
// };

async function getAccessToken() {
  const token = await ensureIglooToken();
  if (!token) {
    throw new Error("No Igloo access token available");
  }
  return token.accessToken;
}

export async function getLocks() {
  const ACCESS_TOKEN = await getAccessToken();

  const options = {
    method: "GET",
    url: "https://api.igloodeveloper.co/igloohome/devices",
    headers: {
      Accept: "application/json, application/xml",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  };

  try {
    const { data } = await axios.request(options);
    const locks = data.payload.filter((lock) => lock.type === "Lock");
    return locks;
  } catch (error) {
    const failure = iglooError("Error Getting Locks", error);
    console.log(failure.message);
    throw failure;
  }
}

export async function getLockInfo(lockDeviceID) {
  const ACCESS_TOKEN = await getAccessToken();

  const options = {
    method: "GET",
    url: `https://api.igloodeveloper.co/igloohome/devices/${lockDeviceID}`,
    headers: {
      Accept: "application/json, application/xml",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  };

  try {
    const { data } = await axios.request(options);
    return data;
  } catch (error) {
    const failure = iglooError(`Error Getting Lock Info ${lockDeviceID}`, error);
    console.log(failure.message);
    throw failure;
  }
}

export async function getBridges() {
  const ACCESS_TOKEN = await getAccessToken();

  const options = {
    method: "GET",
    url: "https://api.igloodeveloper.co/igloohome/devices",
    headers: {
      Accept: "application/json, application/xml",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  };

  try {
    const { data } = await axios.request(options);
    const bridges = data.payload.filter((device) => device.type === "Bridge");
    return bridges[0];
  } catch (error) {
    const failure = iglooError("Error Getting Bridges", error);
    console.log(failure.message);
    throw failure;
  }
}

export async function unlock(lockDeviceID, bridgeDeviceID) {
  const ACCESS_TOKEN = await getAccessToken();

  const options = {
    method: "POST",
    url: `https://api.igloodeveloper.co/igloohome/devices/${lockDeviceID}/jobs/bridges/${bridgeDeviceID}`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    data: {
      jobType: 2,
    },
  };

  try {
    const { data } = await axios.request(options);
    console.log(data);
  } catch (error) {
    const failure = iglooError(`Error Unlocking ${bridgeDeviceID}`, error);
    console.log(failure.message);
    throw failure;
  }
}
