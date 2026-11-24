import type { NextPage } from "next";
import TwoFactorCodeInput from "../components/TwoFactorCodeInput";
import { useRouter } from "next/router";
import PageShell from "../components/PageShell";
import { getCopy } from "../utils/copy";
import { getGameConfig } from "../utils/gameConfig";
import type { Mode } from "../utils/configSchema";
import { kioskProps } from "../utils/kiosk";

const Confirm: NextPage<{ mode: Mode }> = ({ mode }) => {
  const copy = getCopy(mode).confirm;
  const router = useRouter();
  const { channel = "", address = "" } = router.query;

  const redact = (address: string = "", channel: string = "") => {
    if (channel === "email") {
      const atIndex = address.indexOf("@");
      return address.substring(0, 5) + `******` + address.substring(atIndex);
    }
    if (!address) return "";
    return address.substring(0, 4) + `******` + address.substring(address.length - 4);
  };

  return (
    <PageShell
      stage="verify"
      title={copy.title}
      subtitle={
        <>
          {copy.sentVia} {channel} to {redact(address.toString(), channel.toString())}.{" "}
          {copy.purpose}
        </>
      }
      backHref="/channel"
    >
      <TwoFactorCodeInput channel={channel} address={address} />
      <p className="fine center" style={{ marginTop: 18 }}>
        {copy.expires}
      </p>
    </PageShell>
  );
};

export async function getServerSideProps() {
  const config = await getGameConfig();
  return { props: { mode: config.mode, ...kioskProps(config) } };
}

export default Confirm;
