"use client";

import React from "react";
import { useRouter } from "next/router";
import { getExampleNumber } from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";
import { COUNTRIES, countryOfInternational, findCountry, toE164 } from "../utils/phone";
import { useKiosk } from "./KioskContext";
import VirtualKeyboard from "./VirtualKeyboard";
import { applyKey } from "../utils/virtualKeyboard";

const INVALID_NUMBER = "That doesn't look like a complete phone number for this country.";

/** A mobile number in the country's own format, as the field's placeholder. */
const exampleNumber = (code) => getExampleNumber(code, examples)?.formatNational() ?? "";

const SmsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16v11H9l-4 4v-4H4z" />
    <path d="M8 10h8M8 13h5" />
  </svg>
);

const CallIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="-75 -75 500 500" fill="none">
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M307.546 52.5655C273.709 18.685 228.706 0.0171895 180.756 0C81.951 0 1.53846 80.404 1.50408 179.235C1.48689 210.829 9.74646 241.667 25.4319 268.844L0 361.736L95.0236 336.811C121.203 351.096 150.683 358.616 180.679 358.625H180.756C279.544 358.625 359.966 278.212 360 179.381C360.017 131.483 341.392 86.4547 307.546 52.5741V52.5655ZM180.756 328.354H180.696C153.966 328.346 127.744 321.16 104.865 307.589L99.4242 304.358L43.034 319.149L58.0834 264.168L54.5423 258.53C39.6304 234.809 31.749 207.391 31.7662 179.244C31.8006 97.1036 98.6334 30.2707 180.817 30.2707C220.61 30.2879 258.015 45.8015 286.145 73.9665C314.276 102.123 329.755 139.562 329.738 179.364C329.703 261.513 262.871 328.346 180.756 328.346V328.354ZM262.475 216.777C257.997 214.534 235.978 203.704 231.869 202.209C227.761 200.713 224.779 199.966 221.796 204.452C218.814 208.939 210.228 219.029 207.615 222.011C205.002 225.002 202.389 225.372 197.911 223.128C193.434 220.885 179.003 216.158 161.891 200.902C148.578 189.024 139.587 174.362 136.975 169.875C134.362 165.389 136.7 162.965 138.934 160.739C140.945 158.728 143.412 155.505 145.655 152.892C147.899 150.279 148.638 148.406 150.133 145.423C151.629 142.432 150.881 139.82 149.764 137.576C148.646 135.333 139.691 113.287 135.952 104.323C132.316 95.5909 128.621 96.777 125.879 96.6309C123.266 96.5019 120.284 96.4762 117.293 96.4762C114.302 96.4762 109.454 97.5935 105.346 102.08C101.238 106.566 89.6691 117.404 89.6691 139.441C89.6691 161.478 105.716 182.785 107.959 185.776C110.202 188.767 139.544 234.001 184.469 253.408C195.153 258.023 203.498 260.782 210.004 262.845C220.731 266.257 230.494 265.776 238.212 264.624C246.816 263.335 264.71 253.786 268.44 243.326C272.17 232.866 272.17 223.893 271.053 222.028C269.936 220.163 266.945 219.037 262.467 216.794L262.475 216.777Z"
    />
  </svg>
);

/**
 * `phoneHint` is the helper line under the phone number field (#11).
 * `defaultCountry` and `commonCountries` come from the event settings: the
 * field starts on the event's country and lists the common ones above A-Z,
 * so most players never open the list. Typing "+" and a calling code
 * switches the flag instead.
 */
const ChannelPicker = ({ phoneHint, countryHelp, defaultCountry, commonCountries }) => {
  const [channel, setChannel] = React.useState("");
  const [country, setCountry] = React.useState(() => findCountry(defaultCountry) ?? COUNTRIES[0]);
  const [address, setAddress] = React.useState("");
  const [validationMessage, setValidationMessage] = React.useState("");

  const router = useRouter();
  const kiosk = useKiosk();

  const common = React.useMemo(
    () => commonCountries.map(findCountry).filter(Boolean),
    [commonCountries],
  );
  const international = address.trim().startsWith("+");
  // A number typed with its own "+" shows the flag of the country it dials.
  const shown = international ? countryOfInternational(address, country.code) : country;
  const e164 = toE164(address, country.code);
  const phoneHelp = (
    <span id="tel_help_text" className="field-help">
      {phoneHint && <>{phoneHint} </>}
      {countryHelp}
    </span>
  );

  const updateAddress = (value) => {
    setAddress(value);
    setValidationMessage("");
  };

  // Only once they stop typing: every number is "too short" on the way in.
  const checkAddress = () => {
    if (address.trim() && !e164) setValidationMessage(INVALID_NUMBER);
  };

  const submit = async () => {
    if (!e164) {
      setValidationMessage(address.trim() ? INVALID_NUMBER : "Enter your telephone number.");
      return;
    }
    const response = await fetch("/api/createVerification", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        address: e164,
      }),
    });

    const data = await response.json();
    if (data.message !== "Verification Created") {
      setValidationMessage(data.message);
    }
    if (data.message === "Verification Created") {
      localStorage.setItem("channel", channel);
      localStorage.setItem("number", e164);
      router.push({
        pathname: "/confirm",
        query: {
          channel,
          address: e164,
        },
      });
    }
  };

  return (
    <div>
      <div className="channel-grid" role="radiogroup" aria-label="Verification channel">
        <label className="channel-card">
          <input
            type="radio"
            name="channel"
            value="sms"
            checked={channel === "sms"}
            onChange={() => setChannel("sms")}
          />
          <SmsIcon />
          <span>SMS</span>
        </label>
        <label className="channel-card">
          <input
            type="radio"
            name="channel"
            value="call"
            checked={channel === "call"}
            onChange={() => setChannel("call")}
          />
          <CallIcon />
          <span>Call</span>
        </label>
        <label className="channel-card">
          <input
            type="radio"
            name="channel"
            value="whatsapp"
            checked={channel === "whatsapp"}
            onChange={() => setChannel("whatsapp")}
          />
          <WhatsAppIcon />
          <span>WhatsApp</span>
        </label>
      </div>

      {(channel === "sms" || channel === "call" || channel === "whatsapp") && (
        <div style={{ marginBottom: 8 }}>
          <div className="phone-field">
            <div className="phone-field__code">
              <span aria-hidden="true">{shown?.flag ?? "🌐"}</span>
              <span aria-hidden="true">{shown?.dialCode ?? "+"}</span>
              <select
                aria-label="Country"
                value={country.code}
                onChange={({ target }) => {
                  setCountry(findCountry(target.value));
                  setValidationMessage("");
                }}
                disabled={international}
              >
                {common.length > 0 && (
                  <optgroup label="Common">
                    {common.map((c) => (
                      <option key={c.code} value={c.code}>{`${c.flag} ${c.name} ${c.dialCode}`}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All countries">
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{`${c.flag} ${c.name} ${c.dialCode}`}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <input
              className="field"
              aria-label="Phone number"
              aria-describedby={validationMessage ? "tel_help_text error_help_text" : "tel_help_text"}
              id="tel_number"
              name="tel_number"
              type="tel"
              // Kiosk: the on-screen keypad is the only input, and a shared
              // browser must never offer the last player's number. Read-only
              // fields get no autofill suggestions, even ones Chrome would
              // offer despite autocomplete="off".
              autoComplete={kiosk ? "off" : "tel"}
              readOnly={Boolean(kiosk)}
              placeholder={exampleNumber(country.code)}
              inputMode={kiosk ? "none" : undefined}
              value={address}
              onChange={({ target }) => updateAddress(target.value)}
              onBlur={checkAddress}
              aria-invalid={Boolean(validationMessage)}
              required
            />
          </div>
          {!kiosk && phoneHelp}
          {validationMessage && (
            <span id="error_help_text" className="hint-text" role="alert">
              {validationMessage}
            </span>
          )}
          {kiosk && (
            <>
              <VirtualKeyboard layout="phone" onKey={(key) => updateAddress(applyKey(address, key, "phone", 16))} />
              {phoneHelp}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="submit"
          className="btn btn-primary"
          onClick={submit}
          disabled={!address.trim()}
        >
          Send code
        </button>
      </div>
    </div>
  );
};

export default ChannelPicker;
