import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChannelPicker from "../components/ChannelPicker";
import { KioskContext } from "../components/KioskContext";
import Channel from "../pages/channel";
import { getCopy } from "../utils/copy";
import type { Mode } from "../utils/configSchema";

vi.mock("next/router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const phoneProps = { defaultCountry: "US", commonCountries: ["US", "GB"] };
const kioskSettings = { idleTimeoutSeconds: 60, vaultLedUrl: null };

afterEach(() => vi.restoreAllMocks());

function renderPicker(mode: Mode, channel: string) {
  // Server rendering cannot select a radio; seed only the channel state.
  vi.spyOn(React, "useState").mockReturnValueOnce([channel, vi.fn()]);
  const copy = getCopy(mode).channel;
  return renderToStaticMarkup(
    createElement(KioskContext.Provider, { value: mode === "kiosk" ? kioskSettings : null },
      createElement(ChannelPicker, { ...phoneProps, phoneHint: copy.personalNumber, countryHelp: copy.countryHelp })),
  );
}

describe.each<Mode>(["kiosk", "device"])("%s phone form rendering", (mode) => {
  it.each(["sms", "call", "whatsapp"])("keeps helper IDs and ARIA references valid for %s", (channel) => {
    const html = renderPicker(mode, channel);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.filter((id) => id === "tel_help_text")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('aria-describedby="tel_help_text"');
    const references = [...html.matchAll(/\saria-describedby="([^"]+)"/g)]
      .flatMap((match) => match[1].split(/\s+/));
    for (const id of references) expect(ids).toContain(id);

    const copy = getCopy(mode).channel;
    expect(html).toContain(`${copy.personalNumber} ${copy.countryHelp}`);
    expect(html.indexOf('id="tel_help_text"')).toBeGreaterThan(html.indexOf('id="tel_number"'));
    if (mode === "kiosk") {
      expect(html).toContain('class="vkb vkb--pad"');
      expect(html.indexOf('id="tel_help_text"')).toBeGreaterThan(html.lastIndexOf('class="vkb__key'));
      expect(html).toContain('readOnly=""');
      expect(html).toContain('inputMode="none"');
    } else {
      expect(html).not.toContain('class="vkb');
      expect(html).not.toContain('readOnly=""');
      expect(html).not.toContain('inputMode="none"');
    }
  });

  it("renders complete consent and privacy-link wording", () => {
    const html = renderToStaticMarkup(
      createElement(KioskContext.Provider, { value: mode === "kiosk" ? kioskSettings : null },
        createElement(Channel, { mode, ...phoneProps })),
    );
    const consent = html.match(/<p class="fine channel-page__consent">([\s\S]*?)<\/p>/)?.[1];
    expect(consent).toBe(
      `${getCopy(mode).channel.consent} See our <a href="/privacy-policy" target="_blank">Privacy Policy</a>.`,
    );
    expect(html).toContain(getCopy(mode).channel.storageNote.replaceAll("'", "&#x27;"));
  });
});
