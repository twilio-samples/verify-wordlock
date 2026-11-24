// DEMO STAND-IN for the twilio package (installed over it by scripts/demo/run.sh):
// Verify accepts the code 123456 on any channel, and the prize message is
// printed instead of sent. Nothing leaves the machine, and no phone number is
// logged.
const DEMO_CODE = "123456";

module.exports = function twilio() {
  return {
    verify: {
      v2: {
        services: () => ({
          verifications: {
            create: async ({ channel }) => {
              console.log(`[demo] Verify: code ${DEMO_CODE} "sent" via ${channel}`);
              return { status: "pending" };
            },
          },
          verificationChecks: {
            create: async ({ code }) => {
              const valid = code === DEMO_CODE;
              return { valid, status: valid ? "approved" : "pending" };
            },
          },
        }),
      },
    },
    messages: {
      create: async ({ contentVariables }) => {
        console.log(`[demo] prize message (box, prize): ${contentVariables}`);
        return { sid: "SMdemo" };
      },
    },
  };
};
