import type { Mode } from "./configSchema";

/**
 * Every attendee-facing string, keyed by activation mode. Device mode keeps
 * the original "delivery box" wording; kiosk mode talks about the single
 * physical vault on stage (issue #4). Tune copy here rather than in pages.
 */
export type Copy = {
  home: { eyebrow: string; title: string; subtitlePuzzle: string; subtitle2faOnly: string; cta: string };
  channel: { title: string; subtitle: string; storageNote: string; personalNumber: string; countryHelp: string; consent: string };
  confirm: { title: string; sentVia: string; purpose: string; expires: string };
  puzzle: { title: string; subtitle: string; open: string };
  complete: { eyebrow: string; title: string; claim: (prize: string, boxNumber: string) => string };
  failed: {
    eyebrow: string;
    title: string;
    lede: string;
    consolation: string;
    /** Timed out with tries left (#22). */
    retryTitle: string;
    retryLede: (triesLeft: number) => string;
    retry: (triesLeft: number) => string;
  };
  error: { eyebrow: string; title: string; lede: string };
};

const DEVICE: Copy = {
  home: {
    eyebrow: "Live at this booth",
    title: "Pick up your delivery",
    subtitlePuzzle: "Verify your identity with Twilio Verify, then crack the release passphrase to pop the lockbox.",
    subtitle2faOnly:
      "Verify your identity with Twilio Verify and get a one-time code — then open your delivery box.",
    cta: "Start pickup",
  },
  channel: {
    title: "Verify your identity",
    subtitle: "Choose how you'd like to get your one-time code.",
    storageNote: "Your phone number will not be stored — it's only used for this puzzle.",
    // #11 -- pending marketing/legal sign-off on the final wording.
    personalNumber: "Use your personal mobile number, not a work or shared line, so the code reaches you.",
    countryHelp: "Different country? Pick it from the list, or start with + and the country code.",
    consent:
      "By continuing, you agree to receive a one-time verification code via the selected channel for this demo. Message and data rates may apply.",
  },
  confirm: {
    title: "Enter your code",
    sentVia: "We just sent a one-time code via",
    purpose: "This proves it's really you, so we can release your delivery.",
    expires: "Expires in 10 minutes…",
  },
  puzzle: {
    title: "Crack the passphrase",
    subtitle: "You're verified! Solve the release passphrase to open your delivery.",
    open: "Open lockbox 🏆",
  },
  complete: {
    eyebrow: "Vault open",
    title: "Congratulations! 🎉",
    claim: (prize, boxNumber) => `Show this page to a Twilio team member to claim your ${prize} from box ${boxNumber}.`,
  },
  failed: {
    eyebrow: "Locker stays locked",
    title: "Delivery not released",
    lede: "You proved it's you with Twilio Verify, but the passphrase didn't land this time.",
    consolation:
      "Swing by a Twilio team member to learn how Verify + smart locks power trusted pickups — and grab a consolation prize.",
    retryTitle: "Time's up",
    retryLede: (triesLeft) =>
      `The passphrase didn't land this time. You have ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left. The next one starts with a full clock.`,
    retry: (triesLeft) => `Try again (${triesLeft} left)`,
  },
  error: {
    eyebrow: "Something jammed",
    title: "Error occurred",
    lede: "We're sorry, but an error occurred while processing your request. Please show this page to a Twilio team member for assistance.",
  },
};

// Kiosk wording: the single vault on stage instead of numbered boxes (#4, #8).
const KIOSK: Copy = {
  ...DEVICE,
  home: {
    ...DEVICE.home,
    title: "Crack the Twilio vault",
    subtitlePuzzle: "Verify your identity with Twilio Verify, then crack the passphrase to open the vault.",
    subtitle2faOnly: "Verify your identity with Twilio Verify to open the vault.",
    cta: "Start",
  },
  channel: {
    title: "Get your code",
    subtitle: "Choose where to receive your code.",
    storageNote: "Your number is used only to send this code.",
    personalNumber: "Use a mobile number you can access.",
    countryHelp: "Change country code if needed.",
    consent:
      "By continuing, you agree to receive a verification code. Message and data rates may apply.",
  },
  confirm: { ...DEVICE.confirm, purpose: "This proves it's really you, so we can open the vault." },
  puzzle: {
    ...DEVICE.puzzle,
    subtitle: "You're verified! Solve the passphrase to open the vault.",
    open: "Open the vault 🏆",
  },
  complete: {
    ...DEVICE.complete,
    title: "You cracked it! 🎉",
    claim: () => "Head to the vault and pick your prize.",
  },
  failed: {
    ...DEVICE.failed,
    eyebrow: "Vault stays locked",
    title: "Vault not opened",
  },
};

export const COPY: Record<Mode, Copy> = { device: DEVICE, kiosk: KIOSK };

export function getCopy(mode: Mode): Copy {
  return COPY[mode] ?? DEVICE;
}
