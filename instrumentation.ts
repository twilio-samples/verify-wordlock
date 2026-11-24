// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Check PI_BASE_URL up front, so a typo shows in the startup log rather
  // than at the first solve. Nothing is sent until a player starts.
  const { startVaultLed } = await import("./utils/vaultLed");
  startVaultLed();
}
