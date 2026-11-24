import { Box } from "@twilio-paste/core/box";
import { Heading } from "@twilio-paste/core/heading";
import { Button } from "@twilio-paste/core/button";
import { Text } from "@twilio-paste/core/text";
import { Paragraph } from "@twilio-paste/core/paragraph";
import { Separator } from "@twilio-paste/core/separator";
import { SkeletonLoader } from "@twilio-paste/core/skeleton-loader";
import { Input } from "@twilio-paste/core/input";
import { TextArea } from "@twilio-paste/core/textarea";
import { Label } from "@twilio-paste/core/label";
import { HelpText } from "@twilio-paste/core/help-text";
import { Select, Option } from "@twilio-paste/core/select";
import { Stack } from "@twilio-paste/core/stack";
import { Alert } from "@twilio-paste/core/alert";
import { Anchor } from "@twilio-paste/core/anchor";
import { Card } from "@twilio-paste/core/card";
import { Switch } from "@twilio-paste/core/switch";
import { RadioGroup, Radio } from "@twilio-paste/core/radio-group";
import { InlineCode } from "@twilio-paste/core/inline-code";
import { VisualPickerRadioGroup, VisualPickerRadio } from "@twilio-paste/core/visual-picker";
import { useUID } from "@twilio-paste/core/uid-library";
import { DeleteIcon } from "@twilio-paste/icons/cjs/DeleteIcon";
import react from "react";
import type { NextPage } from "next";
import Head from "next/head";

import type { WinnerPolicy } from "../../utils/winnerPolicy";
import type { GameConfig, Prize } from "../../utils/gameConfig";
import {
  GameConfigInputSchema,
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  type GameConfigInput,
  type Mode,
  type VaultLedRoute,
} from "../../utils/configSchema";
import { COUNTRIES } from "../../utils/phone";

const MODE_OPTIONS: { value: Mode; label: string; description: string }[] = [
  {
    value: "device",
    label: "Device (QR code)",
    description: "Attendees play on their own phone. Each prize sits in its own lockbox.",
  },
  {
    value: "kiosk",
    label: "Kiosk",
    description: "Attendees play on a booth tablet. Every win opens the one vault; prizes are picked in person.",
  },
];

const WINNER_POLICY_OPTIONS: { value: WinnerPolicy; label: string; description: string }[] = [
  { value: "infinite", label: "Infinite plays", description: "No limit — anyone can play again immediately." },
  { value: "oncePerDay", label: "One win per day", description: "Each visitor can win once per calendar day." },
  { value: "lifetime", label: "One lifetime win", description: "Each visitor can only ever win once." },
];

/** The form keeps hints as one textarea per word; split on save. */
type WordDraft = { word: string; hintsText: string };
type Lock = { deviceId: string; deviceName: string };

const toDrafts = (config: GameConfig): WordDraft[] =>
  config.solutionWords.map((w) => ({ word: w.word, hintsText: w.hints.join("\n") }));

const splitLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Field errors keyed by Zod issue path, e.g. "solutionWords.0.word" or "prizes.1.lockId". */
type FieldErrors = Record<string, string>;

const LockField = ({
  id,
  label,
  value,
  onChange,
  locks,
  error,
  help,
  emptyLabel = "Select a lock…",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  locks: Lock[] | null;
  error?: string;
  help?: string;
  /** The picker's empty choice. */
  emptyLabel?: string;
}) => {
  // Pick from the locks the Igloo bridge reports; fall back to free text if
  // they couldn't be loaded, or if the saved ID isn't one of them.
  const known = locks?.some((lock) => lock.deviceId === value) ?? false;
  const usePicker = locks !== null && locks.length > 0 && (value === "" || known);
  return (
    <Box>
      <Label htmlFor={id}>{label}</Label>
      {usePicker ? (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} hasError={Boolean(error)}>
          <Option value="">{emptyLabel}</Option>
          {locks.map((lock) => (
            <Option key={lock.deviceId} value={lock.deviceId}>
              {lock.deviceName} ({lock.deviceId})
            </Option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          type="text"
          placeholder="Igloo lock ID, e.g. SP3R11d53b7a"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          hasError={Boolean(error)}
        />
      )}
      {(error || help) && <HelpText variant={error ? "error" : "default"}>{error || help}</HelpText>}
    </Box>
  );
};

const Settings: NextPage = () => {
  const [loaded, setLoaded] = react.useState(false);
  const [loadError, setLoadError] = react.useState("");
  const [locks, setLocks] = react.useState<Lock[] | null>(null);

  const [mode, setMode] = react.useState<Mode>("device");
  const [puzzleEnabled, setPuzzleEnabled] = react.useState(true);
  const [words, setWords] = react.useState<WordDraft[]>([]);
  const [time, setTime] = react.useState("120");
  const [attempts, setAttempts] = react.useState("5");
  const [hintRevealEvery, setHintRevealEvery] = react.useState("2");
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = react.useState("60");
  const [vaultLockId, setVaultLockId] = react.useState("");
  const [vaultLedRoute, setVaultLedRoute] = react.useState<VaultLedRoute>("server");
  const [vaultLedBrowserUrl, setVaultLedBrowserUrl] = react.useState("");
  const [prizes, setPrizes] = react.useState<Prize[]>([]);
  const [defaultCountry, setDefaultCountry] = react.useState("US");
  const [commonCountries, setCommonCountries] = react.useState("");
  const [winnerPolicy, setWinnerPolicy] = react.useState<WinnerPolicy>("oncePerDay");

  const [errors, setErrors] = react.useState<FieldErrors>({});
  const [saving, setSaving] = react.useState(false);
  const [message, setMessage] = react.useState<{ variant: "neutral" | "error"; text: string } | null>(null);
  const [resettingWinners, setResettingWinners] = react.useState(false);

  const modeGroupName = useUID();
  const modeGroupId = useUID();
  const policyGroupName = useUID();
  const policyGroupId = useUID();
  const ledRouteGroupName = useUID();

  const applyConfig = (config: GameConfig) => {
    setMode(config.mode);
    setPuzzleEnabled(config.puzzleEnabled);
    setWords(toDrafts(config));
    setTime(String(config.time));
    setAttempts(String(config.attempts));
    setHintRevealEvery(String(config.hintRevealEvery));
    setIdleTimeoutSeconds(String(config.idleTimeoutSeconds));
    setVaultLockId(config.vaultLockId ?? "");
    setVaultLedRoute(config.vaultLedRoute);
    setVaultLedBrowserUrl(config.vaultLedBrowserUrl ?? "");
    setPrizes(config.prizes.map((p) => ({ name: p.name, lockId: p.lockId ?? "" })));
    setWinnerPolicy(config.winnerPolicy);
    setDefaultCountry(config.defaultCountry);
    setCommonCountries(config.commonCountries.join(", "));
  };

  react.useEffect(() => {
    (async () => {
      // Keep the form hidden on failure: saving an empty form would overwrite
      // the stored config.
      try {
        const response = await fetch("/api/admin/config");
        const data = await response.json();
        if (!response.ok || !Array.isArray(data?.solutionWords)) {
          throw new Error(data?.message || `HTTP ${response.status}`);
        }
        applyConfig(data);
        setLoaded(true);
      } catch (error) {
        setLoadError(`Unable to load game config (${error instanceof Error ? error.message : error}). Reload to retry.`);
      }
    })();
    (async () => {
      try {
        const response = await fetch("/api/admin/devices", { method: "POST" });
        const data = await response.json();
        setLocks(response.ok ? data.locks || [] : null);
      } catch {
        setLocks(null);
      }
    })();
  }, []);

  const buildInput = (): unknown => ({
    mode,
    puzzleEnabled,
    solutionWords: words.map((w) => ({ word: w.word, hints: splitLines(w.hintsText) })),
    time: Number(time),
    attempts: Number(attempts),
    hintRevealEvery: Number(hintRevealEvery),
    idleTimeoutSeconds: Number(idleTimeoutSeconds),
    // Blank optional IDs are "not set", not "set to empty".
    vaultLockId: vaultLockId.trim() || undefined,
    vaultLedRoute,
    vaultLedBrowserUrl: vaultLedBrowserUrl.trim() || undefined,
    prizes: prizes.map((p) => ({ name: p.name, lockId: p.lockId?.trim() || undefined })),
    winnerPolicy,
    defaultCountry,
    commonCountries: commonCountries.split(/[\s,]+/).filter(Boolean),
  });

  const save = async () => {
    setMessage(null);
    // Same schema the API enforces, so most mistakes show up next to the
    // field before a round trip.
    const parsed = GameConfigInputSchema.safeParse(buildInput());
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        next[key] ??= issue.message;
      }
      setErrors(next);
      setMessage({ variant: "error", text: "Fix the highlighted fields, then save again." });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data satisfies GameConfigInput),
      });
      const data = await response.json();
      if (!response.ok) {
        const next: FieldErrors = {};
        for (const issue of data.issues || []) next[issue.path] ??= issue.message;
        setErrors(next);
        setMessage({ variant: "error", text: data.message || "Error saving config" });
        return;
      }
      applyConfig(data);
      setMessage({ variant: "neutral", text: "Settings saved. New sessions pick them up within 10 seconds." });
    } catch {
      setMessage({ variant: "error", text: "Network error — settings not saved." });
    } finally {
      setSaving(false);
    }
  };

  const resetWinners = async () => {
    if (!window.confirm("Reset all winners? Anyone already blocked by the current winner policy will be able to play again.")) {
      return;
    }
    setResettingWinners(true);
    setMessage(null);
    const response = await fetch("/api/admin/resetWinners", { method: "POST" });
    const data = await response.json();
    setMessage(
      response.ok ? { variant: "neutral", text: "Winners reset." } : { variant: "error", text: data.message || "Error resetting winners" }
    );
    setResettingWinners(false);
  };

  const updateWord = (index: number, patch: Partial<WordDraft>) =>
    setWords(words.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  const updatePrize = (index: number, patch: Partial<Prize>) =>
    setPrizes(prizes.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const wordsError = errors["solutionWords"];
  const prizesError = errors["prizes"];
  const commonCountriesError = Object.entries(errors).find(([k]) => k.startsWith("commonCountries"))?.[1];
  const isKiosk = mode === "kiosk";

  return (
    <Box as="main" padding="space70" maxWidth="size80" marginX="auto">
      <Head>
        <title>Event settings · Twilio Wordlock</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Anchor href="/admin">← Admin</Anchor>
      <Heading as="h1" variant="heading10">
        Event settings
      </Heading>
      <Paragraph>
        Configure this run of the activation. Changes apply to new sessions; a puzzle already in progress keeps the
        word it started with.
      </Paragraph>

      {loadError && <Alert variant="error">{loadError}</Alert>}
      {!loaded && !loadError && <SkeletonLoader />}
      {loaded && (
        <Stack orientation="vertical" spacing="space80">
          <VisualPickerRadioGroup
            name={modeGroupName}
            id={modeGroupId}
            value={mode}
            onChange={(value) => setMode(value as Mode)}
            legend={<Text as="span" color="currentColor">Activation mode</Text>}
          >
            {MODE_OPTIONS.map((option) => (
              <VisualPickerRadio key={option.value} labelText={option.label} value={option.value}>
                <Text as="span" fontWeight="fontWeightSemibold">{option.label}</Text>
                <Text as="span" display="block" color="colorTextWeak" fontSize="fontSize20">
                  {option.description}
                </Text>
              </VisualPickerRadio>
            ))}
          </VisualPickerRadioGroup>

          {isKiosk && (
            <Card>
              <Heading as="h2" variant="heading40">
                Kiosk
              </Heading>
              <Stack orientation="vertical" spacing="space60">
                <LockField
                  id="vaultLockId"
                  label="Vault lock"
                  value={vaultLockId}
                  onChange={setVaultLockId}
                  locks={locks}
                  error={errors["vaultLockId"]}
                  emptyLabel="No lock (LED only)"
                  help="Opened on every win. Leave empty if the vault has no smart lock: a win then only turns the vault LED green."
                />
                <Box>
                  <Label htmlFor="idleTimeoutSeconds">Idle timeout (seconds)</Label>
                  <Input
                    id="idleTimeoutSeconds"
                    type="number"
                    min={15}
                    value={idleTimeoutSeconds}
                    onChange={(e) => setIdleTimeoutSeconds(e.target.value)}
                    hasError={Boolean(errors["idleTimeoutSeconds"])}
                  />
                  <HelpText variant={errors["idleTimeoutSeconds"] ? "error" : "default"}>
                    {errors["idleTimeoutSeconds"] || "With no interaction for this long, the kiosk returns to the start screen. Paused while the puzzle clock runs. Minimum 15."}
                  </HelpText>
                </Box>
                <RadioGroup
                  name={ledRouteGroupName}
                  legend="Vault LED: who calls the Pi"
                  value={vaultLedRoute}
                  onChange={(value) => setVaultLedRoute(value as VaultLedRoute)}
                  helpText="Switch here at the booth if one route doesn't work; no redeploy needed. Test both from /admin."
                >
                  <Radio value="server" helpText={<>Needs a route from the app server to the Pi (a VPN or a tunnel), set as <InlineCode>PI_BASE_URL</InlineCode>.</>}>
                    App server
                  </Radio>
                  <Radio value="browser" helpText="The kiosk tablet calls the Pi itself. Needs the tablet on the Pi's network and Chrome 142+ with local network access allowed.">
                    Kiosk browser
                  </Radio>
                </RadioGroup>
                <Box>
                  <Label htmlFor="vaultLedBrowserUrl" required={vaultLedRoute === "browser"}>
                    Pi address on the venue network
                  </Label>
                  <Input
                    id="vaultLedBrowserUrl"
                    type="url"
                    placeholder="http://192.168.0.48"
                    value={vaultLedBrowserUrl}
                    onChange={(e) => setVaultLedBrowserUrl(e.target.value)}
                    hasError={Boolean(errors["vaultLedBrowserUrl"])}
                  />
                  <HelpText variant={errors["vaultLedBrowserUrl"] ? "error" : "default"}>
                    {errors["vaultLedBrowserUrl"] || "Used by the kiosk browser route, and by the browser test on /admin."}
                  </HelpText>
                </Box>
              </Stack>
            </Card>
          )}

          <Separator orientation="horizontal" />

          <Box>
            <Heading as="h2" variant="heading30">
              Phone number field
            </Heading>
            <Box display="flex" columnGap="space60" flexWrap="wrap" rowGap="space60">
              <Box minWidth="size30">
                <Label htmlFor="defaultCountry">Default country</Label>
                <Select
                  id="defaultCountry"
                  value={defaultCountry}
                  onChange={(e) => setDefaultCountry(e.target.value)}
                  hasError={Boolean(errors["defaultCountry"])}
                >
                  {COUNTRIES.map((country) => (
                    <Option key={country.code} value={country.code}>
                      {country.name} ({country.dialCode})
                    </Option>
                  ))}
                </Select>
                <HelpText variant={errors["defaultCountry"] ? "error" : "default"}>
                  {errors["defaultCountry"] || "Where most players are from. The field starts on this country."}
                </HelpText>
              </Box>
              <Box flexGrow={1} minWidth="size30">
                <Label htmlFor="commonCountries">Common countries</Label>
                <Input
                  id="commonCountries"
                  type="text"
                  placeholder="US, CA, GB, DE"
                  value={commonCountries}
                  onChange={(e) => setCommonCountries(e.target.value.toUpperCase())}
                  hasError={Boolean(commonCountriesError)}
                />
                <HelpText variant={commonCountriesError ? "error" : "default"}>
                  {commonCountriesError ||
                    "Two-letter codes, listed first in the country picker. Up to 10; /stats shows where players were from last time."}
                </HelpText>
              </Box>
            </Box>
          </Box>

          <Separator orientation="horizontal" />

          <Box>
            <Heading as="h2" variant="heading30">
              Puzzle
            </Heading>
            <Switch checked={puzzleEnabled} onChange={() => setPuzzleEnabled(!puzzleEnabled)}>
              Puzzle enabled
            </Switch>
            <Text as="p" color="colorTextWeak" fontSize="fontSize20">
              Off = 2FA-only mode: the lock opens right after a successful Verify check.
            </Text>
          </Box>

          <Box display="flex" columnGap="space60" flexWrap="wrap" rowGap="space60">
            {(
              [
                ["time", "Time limit (seconds)", time, setTime],
                ["attempts", "Max attempts", attempts, setAttempts],
                ["hintRevealEvery", "Reveal a hint every N wrong guesses", hintRevealEvery, setHintRevealEvery],
              ] as const
            ).map(([key, label, value, set]) => (
              <Box key={key} minWidth="size20">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min={1}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  hasError={Boolean(errors[key])}
                />
                {errors[key] && <HelpText variant="error">{errors[key]}</HelpText>}
              </Box>
            ))}
          </Box>

          <Box>
            <Heading as="h3" variant="heading40">
              Solution words
            </Heading>
            <Text as="p" color="colorTextWeak" fontSize="fontSize20" marginBottom="space40">
              Each session gets one word at random. All words must be the same length ({MIN_WORD_LENGTH}–
              {MAX_WORD_LENGTH} letters). Hints reveal in order, one per {hintRevealEvery || "N"} wrong guesses.
            </Text>
            {wordsError && (
              <Box marginBottom="space40">
                <Alert variant="error">{wordsError}</Alert>
              </Box>
            )}
            <Stack orientation="vertical" spacing="space50">
              {words.map((w, index) => {
                const wordError = errors[`solutionWords.${index}.word`];
                const hintsError = Object.entries(errors).find(([k]) => k.startsWith(`solutionWords.${index}.hints`))?.[1];
                return (
                  <Card key={index} padding="space50">
                    <Box display="flex" columnGap="space40" alignItems="flex-start">
                      <Box flexBasis="size20" flexShrink={0}>
                        <Label htmlFor={`word-${index}`}>Word {index + 1}</Label>
                        <Input
                          id={`word-${index}`}
                          type="text"
                          value={w.word}
                          onChange={(e) => updateWord(index, { word: e.target.value.toUpperCase() })}
                          hasError={Boolean(wordError)}
                        />
                        {wordError && <HelpText variant="error">{wordError}</HelpText>}
                      </Box>
                      <Box flexGrow={1}>
                        <Label htmlFor={`hints-${index}`}>Hints (one per line, optional)</Label>
                        <TextArea
                          id={`hints-${index}`}
                          value={w.hintsText}
                          onChange={(e) => updateWord(index, { hintsText: e.target.value })}
                          rows={3}
                          hasError={Boolean(hintsError)}
                        />
                        {hintsError && <HelpText variant="error">{hintsError}</HelpText>}
                      </Box>
                      <Box paddingTop="space80">
                        <Button
                          variant="destructive_secondary"
                          size="icon"
                          onClick={() => setWords(words.filter((_, i) => i !== index))}
                        >
                          <DeleteIcon decorative={false} title={`Remove word ${index + 1}`} />
                        </Button>
                      </Box>
                    </Box>
                  </Card>
                );
              })}
              <Box>
                <Button variant="secondary" onClick={() => setWords([...words, { word: "", hintsText: "" }])}>
                  Add word
                </Button>
              </Box>
            </Stack>
          </Box>

          <Separator orientation="horizontal" />

          <Box>
            <Heading as="h2" variant="heading30">
              Prizes
            </Heading>
            <Text as="p" color="colorTextWeak" fontSize="fontSize20" marginBottom="space40">
              {isKiosk
                ? "Labels for what's in the vault (optional). Kiosk winners pick their prize in person."
                : "One lockbox per prize. A winner gets a random free box."}
            </Text>
            {prizesError && (
              <Box marginBottom="space40">
                <Alert variant="error">{prizesError}</Alert>
              </Box>
            )}
            <Stack orientation="vertical" spacing="space40">
              {prizes.map((prize, index) => (
                <Box key={index} display="flex" columnGap="space40" alignItems="flex-start">
                  <Box flexGrow={1}>
                    <Label htmlFor={`prize-${index}`}>Prize {index + 1}</Label>
                    <Input
                      id={`prize-${index}`}
                      type="text"
                      value={prize.name}
                      onChange={(e) => updatePrize(index, { name: e.target.value })}
                      hasError={Boolean(errors[`prizes.${index}.name`])}
                    />
                    {errors[`prizes.${index}.name`] && (
                      <HelpText variant="error">{errors[`prizes.${index}.name`]}</HelpText>
                    )}
                  </Box>
                  {!isKiosk && (
                    <Box flexGrow={1}>
                      <LockField
                        id={`prize-lock-${index}`}
                        label="Lockbox"
                        value={prize.lockId ?? ""}
                        onChange={(lockId) => updatePrize(index, { lockId })}
                        locks={locks}
                        error={errors[`prizes.${index}.lockId`]}
                      />
                    </Box>
                  )}
                  <Box paddingTop="space80">
                    <Button
                      variant="destructive_secondary"
                      size="icon"
                      onClick={() => setPrizes(prizes.filter((_, i) => i !== index))}
                    >
                      <DeleteIcon decorative={false} title={`Remove prize ${index + 1}`} />
                    </Button>
                  </Box>
                </Box>
              ))}
              <Box>
                <Button variant="secondary" onClick={() => setPrizes([...prizes, { name: "", lockId: "" }])}>
                  Add prize
                </Button>
              </Box>
            </Stack>
          </Box>

          <VisualPickerRadioGroup
            name={policyGroupName}
            id={policyGroupId}
            value={winnerPolicy}
            onChange={(value) => setWinnerPolicy(value as WinnerPolicy)}
            legend={<Text as="span" color="currentColor">Winner policy</Text>}
          >
            {WINNER_POLICY_OPTIONS.map((option) => (
              <VisualPickerRadio key={option.value} labelText={option.label} value={option.value}>
                <Text as="span" fontWeight="fontWeightSemibold">{option.label}</Text>
                <Text as="span" display="block" color="colorTextWeak" fontSize="fontSize20">
                  {option.description}
                </Text>
              </VisualPickerRadio>
            ))}
          </VisualPickerRadioGroup>
          {isKiosk && (
            <HelpText>
              Kiosk mode shares one tablet, so a win can&apos;t be tied to a person: the winner policy isn&apos;t enforced,
              and attempts reset for each new player at the start screen.
            </HelpText>
          )}

          {message && <Alert variant={message.variant}>{message.text}</Alert>}
          <Box display="flex" columnGap="space40">
            <Button variant="primary" onClick={save} loading={saving}>
              Save settings
            </Button>
            <Button variant="destructive_secondary" onClick={resetWinners} loading={resettingWinners}>
              Reset winners
            </Button>
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default Settings;
