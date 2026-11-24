"use client";
import React from "react";
import { useRouter } from "next/router";

import CodeInput from "./CodeInput";
import { claimBox, completeRoute } from "../utils/claimBox";
import { useKiosk } from "./KioskContext";
import { setBrowserVaultLed } from "../utils/vaultLedBrowser";
import VirtualKeyboard from "./VirtualKeyboard";
import { BACKSPACE } from "../utils/virtualKeyboard";

const initialCode = new Array(6).fill("");
const TwoFactorCodeInput = ({ channel, address }) => {
  const [codes, setCode] = React.useState(initialCode);
  const [validationMessage, setValidationMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // The tile the kiosk keypad types into; follows taps on the tiles.
  const [activeIndex, setActiveIndex] = React.useState(0);
  const submittingRef = React.useRef(false);

  const refs = React.useRef([]);
  const router = useRouter();
  const kiosk = useKiosk();

  React.useEffect(() => {
    refs.current[0].focus();
  }, []);

  // The tiles are disabled while a code is checked; hand focus back after.
  const wasSubmitting = React.useRef(false);
  React.useEffect(() => {
    if (wasSubmitting.current && !submitting) refs.current[activeIndex]?.focus();
    wasSubmitting.current = submitting;
  }, [submitting, activeIndex]);

  const submit = async (args) => {
    // One check at a time: a code re-completed mid-request mustn't verify (and win) twice.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await check(args);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const check = async ({ code, channel, address }) => {
    const response = await fetch("/api/checkVerification", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        address,
        code,
      }),
    });

    const data = await response.json();
    if (data.valid && data.skipPuzzle) {
      const claim = await claimBox({ channel, address });
      if (!claim) {
        router.push({ pathname: "/error" });
        return;
      }

      // 2FA-only kiosk win: the vault opened, so the light goes green.
      if ("vault" in claim) setBrowserVaultLed(kiosk, "solved");

      router.push(completeRoute(claim));
    } else if (data.valid) {
      router.push("/puzzle");
    } else {
      setValidationMessage(
        data.message ||
        "That verification code is incorrect. Please check and try again.",
      );
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && index - 1 >= 0) {
      e.preventDefault();
      const newCodes = [
        ...codes.slice(0, index),
        "",
        ...codes.slice(index + 1),
      ];
      setCode(newCodes);
      refs.current[index - 1].focus();
    }
    if (e.key === "Backspace" && index === 0) {
      e.preventDefault();
      const newCodes = ["", ...codes.slice(index + 1)];
      setCode(newCodes);
      refs.current[index].focus();
    }
    if (e.key === "ArrowLeft" && index - 1 >= 0) {
      refs.current[index - 1].focus();
    }
    if (e.key === "ArrowRight" && index + 1 < codes.length) {
      refs.current[index + 1].focus();
    }
  };

  const handleCodeChange = (newCode, index) => {
    const newCodes = [
      ...codes.slice(0, index),
      ...newCode.split(""),
      ...codes.slice(index + newCode.length),
    ];
    while (newCodes.length > 6) {
      newCodes.pop();
    }
    setCode(newCodes);
    const x = index + newCode.length;

    refs.current[x < 5 ? x : 5].focus();

    const code = newCodes.join("");
    if (code.length === 6) {
      submit({ code, channel, address });
    }
    return;
  };

  // Kiosk keypad: types into the active tile like a hardware key would.
  // Delete clears the active tile, or the one before it if it's empty.
  const handleVirtualKey = (key) => {
    if (submitting) return;
    const index = activeIndex;
    if (key === BACKSPACE) {
      const target = codes[index] === "" && index > 0 ? index - 1 : index;
      setCode([...codes.slice(0, target), "", ...codes.slice(target + 1)]);
      refs.current[target].focus();
      return;
    }
    if (/^\d$/.test(key)) {
      handleCodeChange(key, index);
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="tiles">
        {codes.map((code, index) => (
          <CodeInput
            key={index}
            value={codes[index]}
            ref={(component) => {
              refs.current[index] = component;
            }}
            index={index}
            onKeyDown={handleKeyDown}
            onChange={handleCodeChange}
            onFocus={setActiveIndex}
            disabled={submitting}
            inputMode={kiosk ? "none" : "numeric"}
          />
        ))}
      </div>
      {validationMessage && (
        <span id="error_help_text" className="hint-text center">
          {validationMessage}
        </span>
      )}
      {kiosk && <VirtualKeyboard layout="digits" onKey={handleVirtualKey} />}
    </div>
  );
};

export default TwoFactorCodeInput;
