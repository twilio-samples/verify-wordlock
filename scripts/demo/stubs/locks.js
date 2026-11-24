// DEMO STAND-IN for utils/locks.js (copied over it by scripts/demo/run.sh):
// two fake lockboxes and a vault on a fake bridge. Unlocks are printed to the
// terminal instead of reaching Igloo.

const LOCKS = [
  { deviceId: "DEMO-BOX-1", deviceName: "Demo box 1", type: "Lock" },
  { deviceId: "DEMO-BOX-2", deviceName: "Demo box 2", type: "Lock" },
  { deviceId: "DEMO-VAULT", deviceName: "Demo vault", type: "Lock" },
];

export async function getLocks() {
  return LOCKS;
}

export async function getLockInfo(lockDeviceID) {
  return { deviceId: lockDeviceID, batteryLevel: 87, lockStatus: "LOCKED" };
}

export async function getBridges() {
  return { deviceId: "DEMO-BRIDGE", deviceName: "Demo bridge", type: "Bridge" };
}

export async function unlock(lockDeviceID, bridgeDeviceID) {
  console.log(`[demo] Igloo: unlock ${lockDeviceID} via ${bridgeDeviceID}`);
}
