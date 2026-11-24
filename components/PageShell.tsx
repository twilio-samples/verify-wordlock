import Head from "next/head";
import Image from "next/image";
import { Fragment } from "react";
import type { ReactNode } from "react";

export type Stage = "verify" | "crack" | "claim";
export type StageState = "active" | "success" | "fail";

const STAGES: { key: Stage; label: string }[] = [
  { key: "verify", label: "Verify" },
  { key: "crack", label: "Crack" },
  { key: "claim", label: "Claim" },
];

type PageShellProps = {
  title: string;
  className?: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  stage?: Stage;
  stageState?: StageState;
  hideStrip?: boolean;
  backHref?: string;
  onBack?: () => void;
  children?: ReactNode;
};

const stepStatus = (stepKey: Stage, stage?: Stage, stageState: StageState = "active") => {
  if (!stage) return "idle";
  const order: Stage[] = ["verify", "crack", "claim"];
  const stepIndex = order.indexOf(stepKey);
  const stageIndex = order.indexOf(stage);
  if (stepIndex < stageIndex) return "done";
  if (stepIndex === stageIndex) return stageState === "fail" ? "fail" : stageState === "success" ? "done" : "active";
  return "idle";
};

const SITE_NAME = "Twilio Wordlock";
const SITE_DESCRIPTION =
  "Verify your phone with Twilio Verify, then crack a passphrase to unlock a real lockbox and claim your prize.";

export const PageShell = ({
  title,
  className,
  eyebrow,
  subtitle,
  stage,
  stageState = "active",
  hideStrip = false,
  backHref,
  onBack,
  children,
}: PageShellProps) => {
  const pageTitle = `${title} · ${SITE_NAME}`;

  return (
    <div className={className ? `page ${className}` : "page"}>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <link rel="icon" href="/favicon.ico" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:image" content="/twilio-logo.png" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content="/twilio-logo.png" />
      </Head>

      <a href="/" className="brandbar">
        <Image src="/twilio-logo.png" alt="Twilio" width={66} height={20} style={{ height: 20, width: "auto" }} />
        <div className="brandbar__rule" />
        <span className="brandbar__mark">Wordlock</span>
      </a>

      <div className="plate">
        <div className="plate__rivet-tl" />
        <div className="plate__rivet-tr" />

        {!hideStrip && (
          <div className="status-strip">
            {STAGES.map((step, i) => {
              const status = stepStatus(step.key, stage, stageState);
              return (
                <Fragment key={step.key}>
                  <div className={`status-strip__step status-strip__step--${status}`}>
                    <div className="status-strip__dot" />
                    <span className="status-strip__label">{step.label}</span>
                  </div>
                  {i < STAGES.length - 1 && <div className="status-strip__rail" />}
                </Fragment>
              );
            })}
          </div>
        )}

        {backHref && (
          <a href={backHref} className="back-link">
            ‹ Back
          </a>
        )}
        {!backHref && onBack && (
          <button type="button" className="back-link" onClick={onBack}>
            ‹ Back
          </button>
        )}

        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display">{title}</h1>
        {subtitle && <div className="lede">{subtitle}</div>}

        {children}
      </div>

      <p className="page__foot">
        Powered by Twilio Verify — learn more at{" "}
        <a href="https://twilio.com/verify">twilio.com/verify</a>
      </p>

      {process.env.NODE_ENV !== "production" && <DevResetLink />}
    </div>
  );
};

const DevResetLink = () => {
  const reset = async () => {
    await fetch("/api/resetSession", { method: "POST" });
    localStorage.removeItem("channel");
    localStorage.removeItem("number");
    window.location.href = "/";
  };

  return (
    <button type="button" className="dev-reset-link" onClick={reset}>
      Reset session (dev)
    </button>
  );
};

export default PageShell;
