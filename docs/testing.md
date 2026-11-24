# Testing

How to check the app yourself, from a five-minute offline demo up to a run against real Twilio services and a rehearsal with the booth hardware.

| Level | Needs | Time | Proves |
| --- | --- | --- | --- |
| [1. Automated checks](#1-automated-checks) | Node 24, pnpm 10 | 2 min | Types, lint, unit and API-route tests, env var lists |
| [2. Offline demo](#2-offline-demo-no-credentials) | Node 24, pnpm 10, git | 5 min | Every screen and flow, the admin pages, stats and the vault LED requests |
| [3. Real services](#3-real-services) | A Twilio account, Igloo credentials, a phone | 30 min | Real OTPs, real prize messages, real Sync, real locks |
| [4. Team rehearsal](#4-team-rehearsal) | A staging deploy, the booth hardware | 1 h | The booth end to end, on the venue network |

The screenshots below come from the offline demo; click one to see it full size. They're all in [`docs/testing/`](testing/).

## 1. Automated checks

```bash
pnpm tsc         # type check
pnpm lint        # ESLint
pnpm test        # Vitest; Sync, Verify and Igloo are faked
pnpm check:env   # .env.example, deploy.sh and deploy.yml list the same env vars
```

All four also run in CI on every pull request. None of them need credentials.

The phone-form render tests cover all three delivery methods in both modes: unique helper IDs, valid `aria-describedby` references, helper placement below the kiosk keypad, native device input, and complete consent/privacy-link wording. Run them with `pnpm test tests/channelPage.test.ts tests/copy.test.ts`.

Some tests make Sync or the lock fail on purpose to check the fallbacks, and the app logs those failures. Vitest only prints them when a test fails, so a passing run has no stack traces; if you do see any next to a red ✗, they belong to that failing test.

## 2. Offline demo (no credentials)

`scripts/demo/run.sh` runs the real app with stand-ins for everything external:

- **Twilio Sync** is held in memory, so state resets when you stop the server.
- **Twilio Verify** "sends" nothing and accepts the code **`123456`**.
- **Prize messages** and **Igloo unlocks** are printed to the terminal.

It builds a throwaway git worktree of your current commit, swaps the stand-ins in from [`scripts/demo/stubs/`](../scripts/demo/stubs), and deletes the worktree when you stop it. Your checkout and `.env.local` are never touched. Uncommitted changes aren't included, so commit first if you're testing your own edits.

```bash
scripts/demo/run.sh          # dev server with hot reload
scripts/demo/run.sh start    # production build, as in the container
```

Then open <http://localhost:3000>. `/admin`, `/admin/settings` and `/stats` log in as **`demo` / `demo`**.

| Option | Effect |
| --- | --- |
| `DEMO_MODE=device` | Start in device mode (default `kiosk`) |
| `DEMO_PUZZLE=0` | 2FA-only: no puzzle, the box opens after the code |
| `DEMO_IDLE=20` | Kiosk idle timeout in seconds (default 60, minimum 15) |
| `DEMO_STATS=1` | Seed 60 sample sessions so `/stats` has something to show |
| `DEMO_PORT=3130` | Listen on another port |
| `PI_BASE_URL=http://127.0.0.1:8765` | Drive the vault LED from the app server; see [the LED test](#vault-led) |
| `DEMO_LED_ROUTE=browser DEMO_LED_BROWSER_URL=http://127.0.0.1:8765` | Drive the vault LED from the kiosk browser instead |

For example: `DEMO_MODE=device DEMO_STATS=1 scripts/demo/run.sh`. You can also switch the mode, words and so on at `/admin/settings` while it runs, as you would at the event.

The seeded config uses the word **PHONE**, with hints "It rings", "It has a screen" and "Starts with P". There are two prizes: Twilio Socks in box 1 and a Twilio T-shirt in box 2.

> [!NOTE]
> In dev mode, a small "Reset session (dev)" link sits under the card. The production build (`start`) doesn't show it.

### Kiosk flow

Start with `DEMO_IDLE=20 scripts/demo/run.sh`. A short idle timeout means you don't wait a minute for the dialog. For a tablet-sized view, open your browser's device toolbar (portrait, about 800 × 1280).

1. **Start screen.** It shows the vault wording, not numbered boxes. Kiosk pages align to the top, with the logo staying at the same height as you move between screens. Check both portrait and landscape views; shorter screens should leave their extra space below the content, not above it.
2. **Channel and phone number.** The heading is **Get your code**, with short delivery and privacy notes. Choose SMS, Call or WhatsApp to show the phone field and on-screen keypad; the OS keyboard doesn't appear. The keypad sits immediately below the phone field, with the short mobile-number/country hint beneath it. On a portrait 720 × 1280 stand, check that the keypad and **Send code** remain high enough to reach without scrolling; the keys and button keep their large touch targets. The compact layout applies only to this kiosk page, not the code/puzzle screens or device mode. Nothing is sent, but the number has to be complete for its country:
   - The field starts on 🇺🇸 +1, with the US, Canada, UK, Germany, India and Brazil listed above A–Z. Type `7025550123`.
   - Or type `+44`: the flag switches to 🇬🇧 by itself and the country list locks.
   - A short number (e.g. `702555`) gets "That doesn't look like a complete phone number for this country." when you send.
3. **Code.** Enter `123456` on the numeric keypad. The terminal prints `[demo] Verify: code 123456 "sent" via sms`.
4. **Puzzle.** Type a wrong 5-letter word (e.g. `PLANE`) on the letter keyboard and press Enter. The tiles score it and **Hint 1** appears.
5. **No interruptions while playing.** Stop touching the screen. No dialog appears while the puzzle clock runs, so a player can think in peace; an abandoned game ends when its time limit runs out.
6. **Idle dialog.** Start again, and stop touching the screen on the code screen instead. After 10 seconds (with `DEMO_IDLE=20`), **Still there?** counts down from 10. At the default 60s timeout, it appears after 45 seconds and counts down from 15. You'll also get it after a solve nobody taps, or on the "time's up" screen.
   - **I'm still here** closes it and restarts the timer.
   - **Start over**, or letting it reach 0, returns to the start screen with the phone number cleared.
7. **Win.** Play again and guess `PHONE`. You get confetti and "Head to the vault and pick your prize". The terminal prints `[demo] Igloo: unlock DEMO-VAULT via DEMO-BRIDGE`.
8. **Start over.** Tap **Start over** on the win screen. The start screen is ready for the next player, and the previous player's progress is gone. The final "time's up", "already won" and error pages have the same button. It's kiosk only, and it isn't counted as a walk-away in `/stats`.
9. **Retries.** Set **Time limit (seconds)** to 15 and **Max attempts** to 2 in `/admin/settings`, then play and let the clock run out. "Time's up" offers **Try again (1 left)**, which starts a new word with a full clock. Let that one run out too: you get the final "Vault not opened" page with **Start over**. In `/stats`, that player counts under **Unsolved puzzles**, not as a walk-away.

| Start | Phone keypad | Code keypad | Letter keyboard |
| --- | --- | --- | --- |
| [![Kiosk start screen](testing/kiosk-01-start.jpg)](testing/kiosk-01-start.jpg) | [![Phone keypad](testing/kiosk-02-phone-keyboard.jpg)](testing/kiosk-02-phone-keyboard.jpg) | [![Code keypad](testing/kiosk-03-code-keyboard.jpg)](testing/kiosk-03-code-keyboard.jpg) | [![Letter keyboard](testing/kiosk-04-letter-keyboard.jpg)](testing/kiosk-04-letter-keyboard.jpg) |

| Hint after a wrong guess | Idle dialog | Win | Landscape |
| --- | --- | --- | --- |
| [![Hint after a wrong guess](testing/kiosk-05-hint-after-wrong-guess.jpg)](testing/kiosk-05-hint-after-wrong-guess.jpg) | [![Idle dialog](testing/kiosk-06-idle-dialog.jpg)](testing/kiosk-06-idle-dialog.jpg) | [![Kiosk win](testing/kiosk-07-win.jpg)](testing/kiosk-07-win.jpg) | [![Landscape letter keyboard](testing/kiosk-landscape-letter-keyboard.jpg)](testing/kiosk-landscape-letter-keyboard.jpg) |

| Time's up, tries left | Out of tries | Win with Start over |
| --- | --- | --- |
| [![Try again](testing/kiosk-08-retry.jpg)](testing/kiosk-08-retry.jpg) | [![Out of tries](testing/kiosk-09-out-of-tries.jpg)](testing/kiosk-09-out-of-tries.jpg) | [![Win with Start over](testing/kiosk-10-win-start-over.jpg)](testing/kiosk-10-win-start-over.jpg) |

**2FA-only** (`DEMO_PUZZLE=0`): after the code, the vault opens straight away.

[![2FA-only win](testing/kiosk-2fa-only-win.jpg)](testing/kiosk-2fa-only-win.jpg)

> [!NOTE]
> "5 tries remaining" counts **plays**, not guesses. That's the existing `attempts` behaviour. A failed play (time runs out) uses one, and "Time's up" offers the next one. Within a play, you can guess as often as you like until the timer runs out.

### Device flow

Start with `DEMO_MODE=device scripts/demo/run.sh`, and use a phone-sized view (e.g. iPhone in the device toolbar).

1. **Start**, then **channel**. The phone step shows "Use your personal mobile number, not a work or shared line, so the code reaches you." On a real phone, the keyboard may offer your own number to autofill. Use any complete number, e.g. `(702) 555-0123`.
2. Enter `123456`, then guess `PLANE`. Hint 1 appears, with "Next hint after 1 more wrong guess."
3. Guess `PHONE`. The win screen names the prize and its box, e.g. "Show this page to a Twilio team member to claim your Twilio T-shirt from box 2." The terminal shows the prize message the player would get and the box that opened. Phone numbers are never logged.

| Start | Personal-number hint | Hint | Win |
| --- | --- | --- | --- |
| [![Device start](testing/device-01-start.jpg)](testing/device-01-start.jpg) | [![Personal-number hint](testing/device-02-channel-personal-number-hint.jpg)](testing/device-02-channel-personal-number-hint.jpg) | [![Puzzle hint](testing/device-03-puzzle-hint.jpg)](testing/device-03-puzzle-hint.jpg) | [![Device win](testing/device-04-win.jpg)](testing/device-04-win.jpg) |

### Event settings

Open <http://localhost:3000/admin/settings> and log in as `demo` / `demo`.

1. **Validation.** Add a 4-letter word next to PHONE and save. The form rejects it beside the field, because all words must be the same length.
2. **Words and hints.** Replace PHONE with `CODES`, give it two hints, and set **Reveal a hint every N wrong guesses** to 2. Save, then start a new game. Hints now appear after the 2nd and 4th wrong guesses.
3. **A game in progress keeps its word.** Start a puzzle in one tab, change the word in another and save, then keep guessing in the first tab. The original word still wins.
4. **Mode switch.** Switch between Device and Kiosk. New sessions pick the change up within about 10 seconds.
5. **Puzzle toggle.** Turn **Puzzle enabled** off to get 2FA-only mode.
6. **Prizes.** Lockbox fields pick from the (fake) Igloo lock list.
7. **Phone field.** Under **Phone number field**, set the default country to Mexico and the common countries to `US, MX, CA`, then save. A new channel page starts on 🇲🇽 +52 with those three on top. A code like `ZZ` is rejected beside the field. Set them back to `US` and `US, CA, GB, DE, IN, BR` afterwards.
8. **Two admins at once.** Open settings in two tabs and save different changes in each. Neither save corrupts the config, and **Reset winners** doesn't undo a save made at the same moment.

[![Event settings](testing/admin-settings.jpg)](testing/admin-settings.jpg)

### Stats

Start with `DEMO_STATS=1 scripts/demo/run.sh` and open <http://localhost:3000/stats>.

- **Funnel.** Started → code sent → verified → solved → box opened, with drop-off between each step.
- **Puzzle facts.** Solve rate, average guesses, average and median time to solve, hints showing at the solve, timeouts, and unsolved puzzles (players who used every try).
- **Other sections.** Kiosk walk-aways by step, channels, top calling codes, sessions per hour, and prizes won. A player who used every try is never a walk-away, so "After timing out" means they still had tries left.
- **Download CSV.** Aggregates only, with one `section,label,value` row per figure. Compare it with [`stats-sample.csv`](testing/stats-sample.csv).
- **Reset stats.** Asks for confirmation, then clears the funnel. Your own plays show up live after that.

[![Stats page](testing/stats.jpg)](testing/stats.jpg)

### Vault LED

[`scripts/demo/led-controller.mjs`](../scripts/demo/led-controller.mjs) is a stand-in for the vendor's Raspberry Pi. It answers the same `GET /setGreen`, `/setRed` and `/setOff` requests, prints each one, and keeps track of the light's color. It's plain Node with no install step.

In one terminal:

```bash
node scripts/demo/led-controller.mjs
```

In another:

```bash
PI_BASE_URL=http://127.0.0.1:8765 DEMO_IDLE=20 scripts/demo/run.sh
```

Then play the kiosk flow. This is what one session printed: a start, an idle reset, a solve, and the next player:

```text
+0.0s fake vault Pi on http://127.0.0.1:8765, light is off (Ctrl-C to stop)
+1.9s GET /setRed -> 200, light is red       start screen
+23.0s GET /setRed -> 200, light is red      idle reset, back to start
+24.8s GET /setGreen -> 200, light is green  the solving guess
+25.4s GET /setGreen -> 200, light is green  "Open the vault" (repeats are harmless)
+27.0s GET /setRed -> 200, light is red      next player's start screen
```

`/setRed` means "a new player is starting" and `/setGreen` means "the vault is open". The README's [Vault LED section](../README.md#vault-led-kiosk-mode-optional) has the details, including the two routes to the Pi. The requests above came from the app server; the fake Pi labels them `(no Origin: server, or browser no-cors)`.

**Kiosk browser route.** Restart the demo with the browser sending instead:

```bash
DEMO_LED_ROUTE=browser DEMO_LED_BROWSER_URL=http://127.0.0.1:8765 DEMO_IDLE=20 scripts/demo/run.sh
```

Play the kiosk flow again. You get the same requests, now from the page, e.g. `+3.1s GET /setRed (browser at http://localhost:3000) -> 200, light is red`. You can also switch routes while it runs, under **Event settings → Kiosk → Vault LED: who calls the Pi**; the browser route asks for the Pi's address.

**Test panel.** Open <http://localhost:3000/admin> (`demo` / `demo`). The **Vault LED** panel has a section for each route, and **The game uses this** marks the one in settings. Each section's **Green**, **Red** and **Off** buttons send one request and show whether the Pi accepted it. **From this browser** sends from the device you're on, so at the event, open it on the kiosk tablet.

| Accepted | Unconfirmed (`LED_STATUS=503`, then `LED_CORS=0`) |
| --- | --- |
| [![Vault LED test panel, both routes accepted](testing/admin-vault-led.jpg)](testing/admin-vault-led.jpg) | [![Vault LED test panel, unconfirmed](testing/admin-vault-led-503.jpg)](testing/admin-vault-led-503.jpg) |

**Pi down.** Stop the fake Pi with Ctrl-C and solve a puzzle. The app keeps working and logs `Vault LED: green unconfirmed (ECONNREFUSED), retrying in 1s`, then `2s`, `4s`, and so on, up to 30s (in the browser route, the warning is in the tab's console and the detail reads "no answer: the Pi is unreachable, or the browser blocked the request"). Restart the fake Pi and the light catches up on the next retry, e.g. `+2.6s GET /setRed -> 200, light is red`. To see an error status instead of a refused connection, start it with `LED_STATUS=503`; the test panel then reports **unconfirmed (HTTP 503)**.

**A Pi without CORS.** Start the fake Pi with `LED_CORS=0` and press **Green** under **From this browser**. The light still turns green, but the panel says **unconfirmed (the Pi answered, but without CORS headers the browser can't read whether it accepted)**, and nothing is retried. That's what the browser route looks like if the real Pi doesn't send CORS headers: it works, but only your eyes can confirm it.

Device mode never sends a request.

## 3. Real services

This step uses real OTPs, real prize messages and real Sync. You'll need the resources in the README's [Required Twilio resources](../README.md#required-twilio-resources) table, plus Igloo `CLIENT_ID`/`CLIENT_SECRET`.

> [!WARNING]
> **Use your own Sync Service, not the production one.** The first request migrates the stored game config and writes it back, and a test run adds funnel events and prize reservations. Create a fresh service under Console → Sync → Services; the app creates its maps on first use. Also make sure the prize lockbox IDs you configure aren't boxes that are in use at an event.

1. `cp .env.example .env.local` and fill it in yourself. Never paste credentials into a chat, a PR or an issue. Leave `PI_BASE_URL` empty unless you're running the fake Pi.
2. `pnpm dev`, or `pnpm build && pnpm start` to match production.
3. Work through the checklist:

| Check | Pass when |
| --- | --- |
| The first page load seeds the config | `/admin/settings` shows the defaults. Your Sync Service now has a `game-config` map |
| SMS, voice and WhatsApp codes arrive | A wrong code is rejected and doesn't reach the puzzle. A right code does |
| Words and hints from settings are used | The same as the offline steps. The answer isn't in the page source (View Source; search for the word) |
| Kiosk on a real tablet | The OS keyboard never opens. The idle dialog and reset behave as in the offline demo. Open `http://<your-laptop-ip>:3000` on the tablet |
| A device win sends the prize message | You get an SMS or WhatsApp naming the prize and box, and that box opens |
| A kiosk win opens the vault lock | The lock set as **Kiosk → Vault lock** in settings opens, and no prize message is sent |
| The personal-number hint shows | It appears on the phone step in both modes |
| Stats match what you did | After a few plays, `/stats` and the CSV count them correctly |
| Two admins save at once | As in the offline settings step 8 |

When you're done, delete the Sync Service or reset stats from `/stats`.

## 4. Team rehearsal

Pushing to `main` deploys to production, and production is the only target `deploy.yml` has. A full rehearsal therefore needs a separate staging Container App, deployed with `deploy.sh` and its own `AZURE_CONTAINER_APP_NAME` and Sync Service, plus its own senders and numbers if you don't want staging codes coming from your production ones.

At the rehearsal:

- **Run the booth.** Use the real tablet in its kiosk shell, on the venue (or a similar) network, with the real vault and LED.
- **Check LED reachability on both routes.** The vendor's Pi is on the venue LAN (e.g. `192.168.0.x`). An Azure-hosted app can only reach it over a VPN or a tunnel; the kiosk tablet on the same network can reach it directly. Test whichever routes you have, so you can fall back to the other at the booth without a deploy:
  - **App server:** put the VPN or tunnel URL in `PI_BASE_URL` and deploy. On `/admin`, press Green, Red and Off under **From the app server** and watch the light.
  - **Kiosk browser:** put the Pi's LAN address in **Event settings**. On the kiosk tablet, open `/admin`, press Green, Red and Off under **From this browser**, and allow the local network prompt if one appears. Then pick the route you'll use, play a full game on the tablet, and watch the light go red, green and red again.
  - See [Before the event: the vault LED](#before-the-event-the-vault-led) for what to ask the vendor first.
- **Load-test the idle flow.** Have people play, walk away mid-game and come back, and check that the next player always starts clean. A game abandoned mid-puzzle runs out its clock first, then the idle reset takes over.
- **Before doors open:** set the event's words, prizes and locks in `/admin/settings`, then **Reset stats**.

### Before the event: the vault LED

The app supports both routes, so the answers below decide which one to use; they don't change the code. Ask the vendor:

1. **Address.** What's the Pi's IP on the venue network, and is it a DHCP reservation, so it stays the same all event?
2. **Auth.** Do the `/setGreen`, `/setRed` and `/setOff` requests need a token, a password or anything else? What does a success answer look like (status code, body)?
3. **App server route.** Can the Pi be reached from the internet, through a VPN into the booth network or a tunnel from the booth (e.g. Cloudflare Tunnel, ngrok, Tailscale Funnel)? Who sets it up and runs it during the event, and is it `https://`? With Basic Auth in front, the app sends `https://user:pass@host` as a header.
4. **Kiosk browser route: CORS.** Can the Pi send `Access-Control-Allow-Origin: *` (or our app's origin) and `Access-Control-Allow-Private-Network: true` on its answers, and answer `OPTIONS` with 204? Without CORS the light still works, but the app can't confirm it.
5. **Network.** Are the kiosk tablet and the Pi on the same network and subnet? Does that network isolate its clients (as many guest and venue Wi-Fi networks do)? Does it allow outbound `https://` to our Azure app?
6. **The tablet.** Which device, OS and browser does the kiosk run? Is it Chrome 142 or later? Is it managed (MDM or kiosk policy), and if so, can the "access local network" permission be allowed for our app's URL, either once by hand or through the management policy?
7. **Testing beforehand.** Can they power up the Pi on a similar network before the event and run the tests below? Is a spare Pi or LED available onsite?

Tests the vendor can run before the event, with the staging URL and an admin login:

| Test | Route | Pass when |
| --- | --- | --- |
| `curl -i http://<pi-ip>/setGreen` from a laptop on the booth network, then `/setRed` and `/setOff` | Both | Each answers 2xx and the light changes |
| The same `curl` with `-H "Origin: https://<app-host>"` | Kiosk browser | The answer includes `Access-Control-Allow-Origin` |
| On the kiosk tablet, `/admin` → **From this browser** → Green, Red, Off | Kiosk browser | **Accepted** each time (or **unconfirmed (…without CORS…)** if 4 is a no), and the light changes |
| `/admin` → **From the app server** → Green, Red, Off (any device) | App server | **Accepted** each time and the light changes |
| Play a full kiosk game on the tablet with the route set in **Event settings** | The chosen one | Red at the start screen, green on the solve, red again for the next player |
| Unplug the Pi for 30 seconds mid-game, then plug it back in | The chosen one | The game carries on, and the light catches up within about 30 seconds of the Pi coming back |
