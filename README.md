# Twilio Verify Wordlock

An event activation that turns identity verification into a game. Players prove who they are with [Twilio Verify](https://www.twilio.com/docs/verify) (SMS, voice call or WhatsApp), crack a Wordle-style passphrase against the clock, and win a prize from a physical box that opens on its own, using [igloohome](https://www.igloocompany.co/) smart locks.

It was first built for SIGNAL London 2024 and extended for Money 20/20 2026 with a booth kiosk mode, a vault light and live event stats. It's a Next.js app with no database: everything it stores lives in [Twilio Sync](https://www.twilio.com/docs/sync).

| Start | Verify | Crack the passphrase | Win |
| --- | --- | --- | --- |
| [![Start screen](docs/testing/device-01-start.jpg)](docs/testing/device-01-start.jpg) | [![Choosing how to get the code](docs/testing/device-02-channel-personal-number-hint.jpg)](docs/testing/device-02-channel-personal-number-hint.jpg) | [![The puzzle with a hint](docs/testing/device-03-puzzle-hint.jpg)](docs/testing/device-03-puzzle-hint.jpg) | [![The win screen](docs/testing/device-04-win.jpg)](docs/testing/device-04-win.jpg) |

## 🎯 How it works

1. The player picks a channel, enters their phone number and gets a one-time code from Twilio Verify.
2. With the right code, they get a word to guess (3–8 letters). Colored tiles show which letters are right, hints appear after wrong guesses, and the clock is running.
3. When they crack it, the server reserves a prize and tells igloohome to open its lock. In device mode, the player also gets an SMS or WhatsApp message saying which box to open.

The app runs in one of two modes, which you can switch at any time in the event settings:

| | **Device mode** | **Kiosk mode** |
| --- | --- | --- |
| Who plays where | Attendees play on their own phone, from a QR code you print that points at the app | Attendees play on a shared touchscreen at the booth |
| What opens | One lockbox per prize; the server hands each winner a free box | One vault, opened on every win; winners pick their prize in person |
| Extras | Prize message by SMS or WhatsApp | On-screen keyboard, a "Still there?" reset between players, an optional vault light, and a vault without a smart lock |

![Schematics and components](docs/Twilio%20Escape%20Box%20-%20Schematics.png)

![Page flow](docs/Twilio%20Escape%20Box%20-%20Flow.png)

## ✨ Features

- **Multi-channel verification**: SMS, voice calls and WhatsApp
- **Smart lock integration**: igloohome locks through the igloohome API, with a manual unlock panel for staff
- **Configurable without a deploy**: words and hints, time limit, attempts, how often hints appear, prizes, winner policy, mode and 2FA-only mode live in Twilio Sync and are edited at `/admin/settings`
- **A server-side puzzle**: the answer never reaches the browser, and one solve opens one box, once
- **Concurrency-safe prizes**: an atomic Sync reservation means two players who win at the same moment never get the same box
- **Live event stats**: `/stats` shows the funnel (started → code sent → verified → solved → box opened), solve rate, guesses and time to solve, timeouts, kiosk walk-aways by step, verification channels, country calling codes, sessions per hour and prizes won, with a CSV export
- **No phone numbers stored**: only their country calling code, for the stats
- **International phone input**: starts on the event's country, lists its common countries first and checks numbers with libphonenumber before sending a code
- **Vault light (kiosk)**: green on a win and red for the next player, through three HTTP requests to a small controller at the booth
- **Runs offline**: a demo script swaps every external service for a stand-in, so you can try the whole thing with no accounts
- Built with the [Twilio Paste](https://paste.twilio.design/) design system

## 🚀 Try it without any accounts

The offline demo runs the real app with stand-ins for Twilio and igloohome: Sync is held in memory, Verify accepts the code **`123456`**, and prize messages and lock unlocks are printed to the terminal.

```bash
git clone https://github.com/twilio-samples/verify-wordlock.git
cd verify-wordlock
pnpm install
scripts/demo/run.sh                      # kiosk mode
DEMO_MODE=device scripts/demo/run.sh     # device mode
```

Open <http://localhost:3000> and guess **PHONE**. The admin pages log in as `demo` / `demo`. The demo runs from a throwaway git worktree, so your checkout isn't touched. [docs/testing.md](docs/testing.md) lists every option, walks through each flow with screenshots, and includes a fake vault light.

## 🛠️ Setup

### Prerequisites

- Node.js 24 and pnpm 10
- A Twilio account with a Verify Service and a Sync Service, plus a Messaging Service for device mode's prize messages
- For physical locks: an igloohome developer account, igloohome locks and an igloohome bridge on a 2.4 GHz Wi-Fi network
- For the vault light (optional): a device on the booth network that answers `GET /setGreen`, `/setRed` and `/setOff`

### Install and run

```bash
pnpm install
cp .env.example .env.local    # then fill it in
pnpm dev
```

- Game: <http://localhost:3000>
- Lock control: <http://localhost:3000/admin>
- Event settings: <http://localhost:3000/admin/settings>
- Stats: <http://localhost:3000/stats>

The admin pages and `/stats` use HTTP Basic Auth with `ADMIN_CREDENTIALS`.

### Environment variables

| Variable | Needed for | Value |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Everything | Console → Account info |
| `TWILIO_VERIFY_SERVICE_SID` | Everything | Console → Verify → Services |
| `SYNC_SERVICE_SID` | Everything | Console → Sync → Services |
| `ADMIN_CREDENTIALS` | Everything | `username:password` for `/admin`, `/admin/settings`, `/stats` and `/api/admin/*` |
| `TWILIO_MESSAGING_SERVICE_SID` | Device mode prize messages | Console → Messaging → Services |
| `TWILIO_CONTENT_SID` | Device mode prize messages | An approved Content Template; `{{1}}` is the box number (e.g. `#2`) and `{{2}}` the prize name |
| `CLIENT_ID`, `CLIENT_SECRET` | Locks | igloohome developer portal → API keys. Not needed for a kiosk vault without a lock |
| `PI_BASE_URL` | Vault light, app server route (optional) | Base URL of the light controller, e.g. `http://192.168.0.48` or a tunnel. `https://user:pass@host` credentials are sent as Basic Auth. Leave empty to turn it off |

`.env.example`, `deploy.sh` and `.github/workflows/deploy.yml` must list the same variables; `pnpm check:env` (run in CI) fails if they drift apart.

### Required Twilio resources

| Resource | Where | Env var | Used for |
| --- | --- | --- | --- |
| Verify Service | Console → Verify → Services | `TWILIO_VERIFY_SERVICE_SID` | One-time codes by SMS, voice and WhatsApp |
| Sync Service | Console → Sync → Services | `SYNC_SERVICE_SID` | Game config, stats, prize reservations, igloohome token |
| Messaging Service with an SMS sender (10DLC or alphanumeric) and a WhatsApp sender | Console → Messaging → Services | `TWILIO_MESSAGING_SERVICE_SID` | Prize messages; the WhatsApp sender also serves Verify |
| Content Template (approved) | Console → Messaging → Content Template Builder | `TWILIO_CONTENT_SID` | Prize messages, including to WhatsApp players outside the 24-hour window |

1. **Verify Service.** Turn on the channels you want to offer (SMS, Voice, WhatsApp) and set the code length and rate limits you need. WhatsApp needs [your own WhatsApp sender](https://www.twilio.com/docs/verify/whatsapp/byo): add it to a Messaging Service, then select that Messaging Service on the Verify Service's WhatsApp tab.
2. **Sync Service.** Nothing to set up inside it: the app creates its maps on first use. Use a separate Sync Service for each deployment, since the first request seeds and migrates the game config.
3. **Messaging Service and Content Template** (device mode only). The template has two variables: the box number and the prize.

Everything runs inside the app: there are no Twilio Functions, Studio Flows or TwiML Bins to set up.

### igloohome

1. Register at the [igloohome developer portal](https://developer.igloocompany.co/register) and create an API key from the [API list](https://developer.igloocompany.co/api-list). Its client ID and secret go in `CLIENT_ID` and `CLIENT_SECRET`.
2. Pair your locks with the bridge in the igloohome app, on a 2.4 GHz Wi-Fi network, and check that they respond there.
3. Open `/admin`: it lists the locks with their battery levels and can open each one. Then assign them in `/admin/settings`: one per prize in device mode, or the vault lock in kiosk mode.

The app fetches and refreshes the igloohome access token itself and keeps it in Sync.

### Vault LED (kiosk mode, optional)

The vault light is driven by a small controller on the booth network (at Money 20/20, the vendor's Raspberry Pi) that takes three plain HTTP GETs:

| Request | Light | Sent when |
| --- | --- | --- |
| `GET /setGreen` | Green | The player solves the puzzle (or, in 2FA-only mode, the vault opens) |
| `GET /setRed` | Red | The kiosk is back on the start screen for the next player: after a win, a timeout or the idle reset |
| `GET /setOff` | Off | Only from the test panel on `/admin` |

The controller sits on the venue LAN, so the requests can take one of two routes. Pick one under **Event settings → Kiosk → Vault LED: who calls the Pi**. It's a setting, not a deploy, so you can switch at the booth:

| Route | Set up | Needs |
| --- | --- | --- |
| **App server** (default) | `PI_BASE_URL` env var, then deploy | A network route from the server to the controller: a VPN, or a tunnel from the booth (put the tunnel's URL in `PI_BASE_URL`). A cloud-hosted app can't reach a private address like `192.168.0.48` on its own |
| **Kiosk browser** | **Pi address on the venue network** in settings | The kiosk on the controller's network, in Chrome 142 or later, with the "access other apps and services on this device / local network" prompt allowed once. Chrome's [local network access](https://developer.chrome.com/blog/local-network-access) lets an `https://` page call an `http://` private IP. Edge is built on Chromium and may behave the same, but it, Safari and Firefox haven't been tested |

- **Players are never held up.** Each request times out after 5 seconds and is sent one at a time, so colors can't arrive out of order; only the latest color is kept. If the controller doesn't answer with a 2xx, the color is "unconfirmed", logged and retried in the background (1s, 2s, 4s, … up to 30s) until it goes through or a newer color replaces it.
- **"Accepted" isn't "seen".** There's no status endpoint, so a 2xx means the controller took the request, and a timeout may still have switched the light. Look at the light when you test.
- **Kiosk browser, without CORS:** if the controller doesn't send `Access-Control-Allow-Origin`, the browser can still send the request but can't read the answer. The app then sends it again in `no-cors` mode, which reaches the controller, and reports it as "unconfirmed" without retrying. So the light works, but only your eyes can confirm it. For confirmed answers, have the controller send `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Private-Network: true`, and answer `OPTIONS` with 204. In this route, retries live in the tab: a reload drops them, but every start screen sends red again.
- **Test both from the deployed app:** `/admin` has a **Vault LED** panel with Green, Red and Off buttons for each route and the last request's outcome. The browser test only means something on a device on the controller's network, ideally the kiosk itself. Without hardware, use the fake controller in `scripts/demo/led-controller.mjs`.

Device mode never sends these requests. To turn the light off in kiosk mode, pick **App server** and leave `PI_BASE_URL` empty.

## 📱 Running an event

### For players

1. Open the app (scan the QR code, or walk up to the kiosk) and tap **Start**.
2. Pick SMS, voice call or WhatsApp, enter a phone number and type in the code.
3. Crack the passphrase before the clock runs out. If time runs out with attempts left, **Try again** starts a new word with a full clock.
4. On a win, the box or the vault opens.

### For staff

Everything below sits behind HTTP Basic Auth (`ADMIN_CREDENTIALS`).

1. **Event settings** (`/admin/settings`)
   - Pick the activation mode: **Device (QR code)** or **Kiosk**
   - Set the word list (3–8 letters, all the same length) with optional hints for each word, the time limit, max attempts, how many wrong guesses reveal the next hint, the prizes and the winner policy (infinite plays, one win per day or one lifetime win)
   - Turn **Puzzle enabled** off for 2FA-only mode: the box opens right after a successful Verify check
   - Set the phone field's **default country** (where most players are from) and up to 10 **common countries** listed above the A–Z list. Players from elsewhere can also type `+` and their country code
   - **Reset winners** lets everyone who already won play for a prize again
   - Invalid settings are rejected with a reason for each field. Changes apply to new games within about 10 seconds, with no redeploy

   In **kiosk** mode:
   - Every input uses the on-screen keyboard instead of the OS one
   - After the idle timeout (default 60s, minimum 15s) with no touch, a "Still there?" countdown appears; if nobody taps, the kiosk returns to the start screen
   - The idle timer is paused while the puzzle clock is running, so nobody is interrupted while thinking; a game abandoned mid-puzzle ends when its time limit runs out, and the idle timer takes over from there
   - The start screen clears the previous player's session, so the next person starts fresh. Because the tablet is shared, the winner policy can't follow a person and isn't enforced
   - **Vault lock** is optional. Leave it on **No lock (LED only)** when the vault has no igloohome lock: a win then skips igloohome entirely and only turns the [vault light](#vault-led-kiosk-mode-optional) green, so no bridge or Wi-Fi is needed
   - Run the browser full screen (a kiosk shell or the browser's kiosk mode) pointed at `/`

2. **Lock control** (`/admin`)
   - See the connected locks, their battery levels and lock status, and open any of them by hand
   - Test the vault light on both routes

3. **Stats** (`/stats`, refreshes every 30s)
   - The live funnel, with the drop-off between each stage
   - Puzzle facts: solve rate (of verified players), average guesses, average and median time to solve, how many hints were showing at the solve, and how many games ran out of time
   - Kiosk walk-aways: idle resets, by the step where the player stopped
   - Verification channels, top country calling codes, games started per hour and prizes won
   - **Download CSV** for post-event analysis: one `section,label,value` row per figure, aggregates only
   - **Reset stats** to start a fresh event (download the CSV first; a reset can't be undone)

**Before doors open:** set the event's words, prizes and locks, then reset stats and winners. The default word list is public in this repo, so use your own words at a real event.

## 🏗️ Architecture

### API routes

| Route | Does |
| --- | --- |
| `POST /api/createVerification` | Sends a Verify code by SMS, voice or WhatsApp |
| `POST /api/checkVerification` | Checks the code and records the verified session on the server |
| `POST /api/puzzle/guess` | Scores a guess on the server and reveals hints |
| `POST /api/failed` | Ends a run that timed out and counts the attempt |
| `POST /api/unlockBox` | `{ win: true }` only: reserves a prize for a verified winner and opens its lock (in kiosk mode, the vault). In device mode it then sends the prize message, but only to the number this session verified |
| `POST /api/resetSession` | Development only: clears the game cookies so you can replay the flow |
| `GET` / `PUT /api/admin/config` | Reads or saves the game config |
| `POST /api/admin/devices` | Lists the igloohome locks, their status and the bridge |
| `POST /api/admin/unlock` | `{ lockId }`: opens one lock from `/admin` |
| `GET /api/admin/stats` | The aggregated stats as JSON, or `?format=csv` |
| `POST /api/admin/resetStats` | Clears the stats for a fresh event |
| `POST /api/admin/resetWinners` | Lets previous winners win again |
| `GET` / `POST /api/admin/vaultLed` | The vault light test panel: the last outcome, or send a color |

### Data storage (Twilio Sync)

There's no database: everything lives in Sync Maps under `SYNC_SERVICE_SID`. Maps and items are created on first use, so there's nothing to provision beyond the Sync Service itself.

- **`game-config`**: a single item holding the editable game config. Seeded with a default config the first time it's read, and edited from `/admin/settings`. Its shape is defined and validated by the Zod schema in `utils/configSchema.ts` and carries a `version` field; older stored configs are migrated on first read (see `migrateConfig`), so upgrading never means hand-editing Sync. Concurrent saves retry on a Sync revision conflict instead of overwriting each other.
- **`game-funnel`**: one item per player session (keyed by an anonymous `sid` cookie), with a timestamp for each funnel stage (started, code sent, verified, solved, box opened), the prize won if any, the verification channel, the guesses, hints showing and time taken on the solving run, the last timeout and (kiosk) an idle reset. **No phone number is stored**: only its country calling code (`+49`), derived on the server in `utils/callingCode.ts`. Aggregated by `/api/admin/stats`; individual sessions are never returned.
- **`prize-claims`**: one item per prize, only while that prize is reserved. Claiming relies on Sync's create-if-absent semantics: creating an item only succeeds if no item with that key exists yet, so two winners racing for the same prize can never both succeed. Each claim has a 20-second TTL: a prize stays reserved for that window after being won, then becomes claimable again, so a box isn't handed to a second winner while the first is still walking up to it. If several people win at almost the same moment and every prize is briefly reserved, `/api/unlockBox` returns `409 No Available Boxes` and the client retries for a few seconds until one frees up. **This is expected, not a bug.**
- **`puzzle-sessions`**: one item per player's puzzle run (keyed by `sid`): the word and its hints, snapshotted at the start, plus the guesses so far and the timer. Expires a few minutes after the run's time limit.
- **`puzzle-wins`**: one claim per solved run (or, in 2FA-only mode, per passed Verify check), created with create-if-absent so a single win opens only one box, even if the win request is sent twice. Released again if the unlock fails, so the player can retry. Expires with the run (or after 24 hours).
- **`verifications`**: when each session last passed a Verify check, so the server, not a cookie, decides who may win in 2FA-only mode. Also holds an HMAC of the session and the verified number (keyed with `TWILIO_AUTH_TOKEN`), so the device-mode prize message only goes to that number; the number itself isn't stored. Expires after 24 hours.
- **`igloo-auth`**: the current igloohome OAuth access token and its expiry, refreshed on demand by `ensureIglooToken()` in `utils/iglooToken.ts`.

### Project structure

```
├── pages/
│   ├── api/
│   │   ├── admin/          # Config, stats, resets, locks, vault light test (Basic Auth)
│   │   ├── puzzle/         # Server-side guess scoring
│   │   └── ...             # Verify and win routes
│   ├── admin/settings.tsx  # Event settings
│   ├── admin.tsx           # Lock control and vault light test panel
│   ├── stats.tsx           # Event stats
│   ├── index.tsx           # Start screen
│   ├── channel.tsx         # Channel and phone number
│   ├── confirm.tsx         # Verification code
│   ├── puzzle.tsx          # The passphrase puzzle
│   └── complete.tsx, failed.tsx, error.tsx, previousWinner.tsx
├── components/             # PuzzleScreen, ChannelPicker, VirtualKeyboard, IdleGuard, VaultLedPanel, ...
├── utils/
│   ├── configSchema.ts     # Game config schema and migrations
│   ├── gameConfig.ts       # Sync-backed game config and its defaults
│   ├── copy.ts             # Every player-facing string, by mode
│   ├── puzzle.ts, puzzleSession.ts   # Scoring and server-side runs
│   ├── prizeClaim.ts       # Atomic prize reservation
│   ├── prizeMessage.ts     # Device-mode prize message, verified number only
│   ├── funnel.ts           # Stats tracking and aggregation
│   ├── vaultLed*.ts        # Vault light: server route, browser route, shared queue
│   ├── locks.js, iglooToken.ts       # igloohome API and token
│   └── sync.ts             # Twilio Sync helpers
├── proxy.ts                # Basic Auth for the admin pages and /stats
├── scripts/demo/           # Offline demo and fake vault light
├── tests/                  # Vitest unit and API route tests
└── docs/                   # Diagrams and the testing guide
```

Player-facing copy lives in `utils/copy.ts`, keyed by mode, so edit wording there rather than in the pages.

## 🧪 Development

```bash
pnpm test        # Vitest unit and API route tests (Sync is mocked; no credentials needed)
pnpm tsc         # Type check
pnpm lint        # ESLint
pnpm check:env   # .env.example, deploy.sh and the deploy workflow list the same env vars
pnpm build       # Production build (works without any env vars)
```

All of these run in CI on pull requests. [docs/testing.md](docs/testing.md) covers manual testing, from the offline demo to a run against real services.

## 🚢 Deploying

The app builds into a standalone Node.js container (see the `Dockerfile`), so it runs anywhere that runs containers. `pnpm build && pnpm start` works too.

`deploy.sh` deploys to Azure Container Apps with the Azure CLI. It reads `.env.local` (or the file in `ENV_FILE`), creates the resource group, container registry, Log Analytics workspace and Container Apps environment if they don't exist yet, builds the image in the registry, stores the env vars as Container App secrets and runs a single replica. Override its defaults with `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_CONTAINER_APP_NAME`, `AZURE_CONTAINER_ENV_NAME` or `AZURE_ACR_NAME`.

```bash
az login
./deploy.sh
```

`.github/workflows/deploy.yml` runs the same script on every push to `main`, signing in to Azure with OIDC. It runs in the `production` GitHub environment and needs these environment secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TWILIO_AUTH_TOKEN`, `ADMIN_CREDENTIALS`, `CLIENT_SECRET` and `PI_BASE_URL`; and these environment variables: `TWILIO_ACCOUNT_SID`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_CONTENT_SID`, `SYNC_SERVICE_SID` and `CLIENT_ID`. The Azure app registration needs federated credentials for the `environment:production` subject of your repo (see `gh api repos/<org>/<repo>/actions/oidc/customization/sub`). In a fork, set those up or turn the workflow off.

Before an event, deploy a staging copy with its own Sync Service and test it with the booth hardware on the venue network.

## 🔧 Troubleshooting

**The bridge won't connect**
- Make sure 2.4 GHz Wi-Fi is available and the network allows IoT devices
- Reset the bridge and pair it again if needed

**Verification codes don't arrive**
- Check the Twilio account balance and the Verify Service's channel settings
- Check the number and country. Players should use a personal mobile number, not a work or shared line
- For WhatsApp, check that the Verify Service's WhatsApp tab has your sender's Messaging Service selected

**Locks won't open**
- Check that the bridge is online, and check the lock battery levels on `/admin`
- Check `CLIENT_ID` and `CLIENT_SECRET`
- For a kiosk vault without a lock, set **Vault lock** to **No lock (LED only)**

**Everyone gets "No Available Boxes"**
- Every prize is briefly reserved by other winners (see [Data storage](#data-storage-twilio-sync)). Reservations clear after 20 seconds, so it resolves on its own during a rush.
- If it lasts longer, check that `SYNC_SERVICE_SID` is right and that `/admin/settings` has prizes with locks.

**The vault light doesn't change**
- Test each route with the **Vault LED** panel on `/admin`, and look at the light
- App server route: check that the server can reach `PI_BASE_URL`; the startup log flags an invalid URL
- Kiosk browser route: run the test on the kiosk itself, in Chrome 142 or later, and allow the local network prompt

**Settings or stats don't load**
- Check that `SYNC_SERVICE_SID` points to a valid Sync Service
- Check that `ADMIN_CREDENTIALS` is set

## 🤝 Contributing

Issues and pull requests are welcome. Please run the [checks](#-development) before opening a pull request, and add any new env var to `.env.example`, `deploy.sh` and the deploy workflow together.

All third-party contributors acknowledge that any contributions they provide will be made under the same open source license that the project is provided under.

## Code of Conduct

This project has a [Code of Conduct](CODE_OF_CONDUCT.md). The tl;dr: be excellent to each other.

## 📄 License

MIT. See [LICENSE](LICENSE).

## 🏆 Acknowledgments

- Built with the [Twilio Paste](https://paste.twilio.design/) design system
- Powered by [Twilio Verify](https://www.twilio.com/verify) and [Twilio Sync](https://www.twilio.com/sync)
- Smart locks by [igloohome](https://www.igloocompany.co/)
