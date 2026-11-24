import { Alert } from "@twilio-paste/core/alert";
import { Anchor } from "@twilio-paste/core/anchor";
import { Badge } from "@twilio-paste/core/badge";
import { Box } from "@twilio-paste/core/box";
import { Button } from "@twilio-paste/core/button";
import { ButtonGroup } from "@twilio-paste/core/button-group";
import { Heading } from "@twilio-paste/core/heading";
import { InlineCode } from "@twilio-paste/core/inline-code";
import { StatusBadge } from "@twilio-paste/core/status";
import { Text } from "@twilio-paste/core/text";
import react from "react";
import type { VaultLedRoute } from "../utils/configSchema";
import type { VaultLedColor, VaultLedStatus } from "../utils/vaultLedQueue";
import { browserVaultLed } from "../utils/vaultLedBrowser";

type Info = { configured: boolean; target: string | null; status: VaultLedStatus | null };
type Route = { route: VaultLedRoute; browserUrl: string | null };

const LABELS: Record<VaultLedColor, string> = { green: "Green", red: "Red", off: "Off" };

function Outcome({ status }: { status: VaultLedStatus }) {
  const time = new Date(status.at).toLocaleTimeString();
  if (status.result === "sending") {
    return <StatusBadge as="span" variant="ProcessInProgress">{`Sending ${LABELS[status.color]}…`}</StatusBadge>;
  }
  if (status.result === "accepted") {
    return (
      <StatusBadge as="span" variant="ProcessSuccess">{`${LABELS[status.color]}: accepted by the Pi at ${time}`}</StatusBadge>
    );
  }
  return (
    <StatusBadge as="span" variant="ProcessWarning">
      {`${LABELS[status.color]}: unconfirmed (${status.detail}) at ${time}`}
    </StatusBadge>
  );
}

function ColorButtons({ busy, onSend }: { busy: boolean; onSend: (color: VaultLedColor) => void }) {
  return (
    <ButtonGroup>
      {(["green", "red", "off"] as const).map((color) => (
        <Button key={color} variant="secondary" loading={busy} onClick={() => onSend(color)}>
          {LABELS[color]}
        </Button>
      ))}
    </ButtonGroup>
  );
}

function RouteHeading({ title, active }: { title: string; active: boolean }) {
  return (
    <Box display="flex" alignItems="center" columnGap="space30">
      <Heading as="h3" variant="heading50" marginBottom="space0">
        {title}
      </Heading>
      {active && (
        <Badge as="span" variant="success">
          The game uses this
        </Badge>
      )}
    </Box>
  );
}

/**
 * Tests both routes to the vault LED's Pi (#5), the same way the game sends:
 * from the app server (PI_BASE_URL), and from this browser to the address in
 * /admin/settings. The browser test only means something on a device on the
 * Pi's network, ideally the kiosk tablet itself.
 */
const VaultLedPanel = () => {
  const [info, setInfo] = react.useState<Info | null>(null);
  const [route, setRoute] = react.useState<Route | null>(null);
  const [busy, setBusy] = react.useState(false);
  const [browserBusy, setBrowserBusy] = react.useState(false);
  const [browserStatus, setBrowserStatus] = react.useState<VaultLedStatus | null>(null);
  const [error, setError] = react.useState("");

  const load = react.useCallback(async () => {
    try {
      const [led, config] = await Promise.all([fetch("/api/admin/vaultLed"), fetch("/api/admin/config")]);
      setInfo(await led.json());
      const data = await config.json();
      if (config.ok) setRoute({ route: data.vaultLedRoute, browserUrl: data.vaultLedBrowserUrl ?? null });
    } catch {
      setError("Couldn't load the vault LED status");
    }
  }, []);

  react.useEffect(() => {
    load();
  }, [load]);

  const send = async (color: VaultLedColor) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/vaultLed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.message);
      else setInfo(data);
    } catch {
      setError("Couldn't reach the app server");
    } finally {
      setBusy(false);
    }
  };

  const sendFromBrowser = async (url: string, color: VaultLedColor) => {
    setBrowserBusy(true);
    setBrowserStatus({ color, result: "sending", at: Date.now() });
    setBrowserStatus(await browserVaultLed(url).test(color));
    setBrowserBusy(false);
  };

  return (
    <Box>
      <Heading as="h2" variant="heading30">
        Vault LED
      </Heading>
      <Text as="p" color="colorTextWeak" marginBottom="space50">
        Green on a solve, red when a new player starts (kiosk mode). Choose who sends in{" "}
        <Anchor href="/admin/settings">Event settings</Anchor>. &quot;Accepted&quot; means the Pi answered; check the
        light itself too. A timeout may still have switched it.
      </Text>
      <Box display="flex" flexDirection="column" rowGap="space70">
        <Box display="flex" flexDirection="column" rowGap="space40">
          <RouteHeading title="From the app server" active={route?.route === "server"} />
          {info && !info.configured && (
            <Alert variant="neutral">
              <Text as="span">
                Off: set <InlineCode>PI_BASE_URL</InlineCode> to the Pi&apos;s address as the app server reaches it (over
                a VPN or a tunnel) to use this route.
              </Text>
            </Alert>
          )}
          {info?.configured && (
            <>
              <Text as="p">
                Sends to <InlineCode>{info.target}</InlineCode>.
              </Text>
              <ColorButtons busy={busy} onSend={send} />
              <Box>{info.status ? <Outcome status={info.status} /> : <Text as="span">Nothing sent yet.</Text>}</Box>
            </>
          )}
        </Box>

        <Box display="flex" flexDirection="column" rowGap="space40">
          <RouteHeading title="From this browser" active={route?.route === "browser"} />
          {route && !route.browserUrl && (
            <Alert variant="neutral">
              <Text as="span">
                Off: add the Pi&apos;s address on the venue network in{" "}
                <Anchor href="/admin/settings">Event settings</Anchor> to use this route.
              </Text>
            </Alert>
          )}
          {route?.browserUrl && (
            <>
              <Text as="p">
                Sends to <InlineCode>{route.browserUrl}</InlineCode> from this device, like the kiosk does. Run it on the
                kiosk tablet, on the Pi&apos;s network. If the browser asks to access devices on your local network,
                allow it.
              </Text>
              <ColorButtons busy={browserBusy} onSend={(color) => sendFromBrowser(route.browserUrl!, color)} />
              <Box>
                {browserStatus ? <Outcome status={browserStatus} /> : <Text as="span">Nothing sent yet.</Text>}
              </Box>
            </>
          )}
        </Box>
      </Box>
      {error && (
        <Box marginTop="space40">
          <Alert variant="error">
            <Text as="span">{error}</Text>
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default VaultLedPanel;
