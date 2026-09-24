# Getting ShutterBlip into Google Play and the App Store

Read this top to bottom once before starting. Do **Google Play first** — it
is cheaper, faster, needs no Mac, and it is where you will learn what
reviewers ask for.

> **About pasting commands.** Nothing below asks you to paste a web address
> into the terminal. Where a website is needed, you open it in a browser.

---

## What is already done in the game

These are the things both stores reject apps for. They are handled:

| Store rule | Where it is in the game |
|---|---|
| Delete your account **inside** the app | You tab → **Delete my account** (tap twice). Removes everything, on the server and the phone. |
| Delete your account **from the web** (Google) | Your site's `/delete-account` page. Works without the app. |
| Privacy policy at a public web address | Your site's `/privacy` page — the same text the game shows. |
| Download your data | You tab → **Download my data**. |
| Forgotten password without email | Recovery code, shown once at sign-up. |
| No half-finished features | Shop hidden, "coming soon" text removed, developer notes removed. |
| Honest opponents | Every duel says up front whether it is a practice bot, a recorded run, or a live person. |
| Works offline | Yes. Lessons, puzzles and practice play with no connection. |
| Phones, tablets, both orientations | Tested on 12 screen sizes, portrait and landscape. |
| Accessibility basics | Keyboard and screen-reader labels on the camera dials and viewfinder. |

## What only you can do

- Pay the store fees and verify your identity (Google $25 once, Apple $99 a year).
- Make a **reviewer account** (below).
- Take the store screenshots (the game's own screens are fine).
- For iPhone: use a **Mac** with Xcode. There is no way around this for Apple.
- Have a lawyer read the privacy policy and terms before you charge money
  for anything. They are written honestly and plainly, but nobody has
  reviewed them yet.

---

# Part 1 — update your server (once)

The store pages and the Android link need this release to be live.

**Step 1.** Do `GITHUB-UPDATE.md` as normal: GitHub, then pull on the
server, then the rollover check. Don't restart yet.

**Step 2.** Save your private settings in a file on the server. This
replaces the long `pm2 start` line from `SECURITY-FIX-NOW.md` — from now on
nothing secret gets typed into a command.

```
cd /var/www/shutterblip
```

```
nano server/local.env
```

Type this line, with your real admin password after the `=`:

```
ADMIN_PASSWORD=your-admin-password-here
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`. Lock the file so only the
server can read it:

```
chmod 600 server/local.env
```

**Step 3.** Restart the game using the settings file in the repository:

```
pm2 delete shutterblip
```

```
pm2 start ecosystem.config.js
```

```
pm2 save
```

```
pm2 logs shutterblip --lines 20
```

You should see `persistent · SQLite` followed by where the database is —
either `/var/lib/shutterblip/shutterblip.db` or the `data` folder,
whichever it already used. It always picks the existing database, so no
player is lost. Press `Ctrl+C`.

**Step 4.** Let nginx pass the new pages through. Open the config:

```
nano /etc/nginx/sites-available/shutterblip
```

Find the line that begins `server_name`. Directly underneath it, add:

```
    location = /privacy        { rewrite ^ /v1/page/privacy last; }
    location = /terms          { rewrite ^ /v1/page/terms last; }
    location = /delete-account { rewrite ^ /v1/page/delete-account last; }
    location = /.well-known/assetlinks.json { rewrite ^ /v1/page/assetlinks last; }
```

Save, then check and reload:

```
nginx -t && systemctl reload nginx
```

**Step 5.** In a browser, open your site and add `/privacy` to the end of
the address. You should see the privacy policy. Try `/terms` and
`/delete-account` too. Those three addresses are what you give the stores.

---

# Part 2 — Google Play

## 2.1 Make the developer account

1. In a browser, search for **Google Play Console** and sign up.
2. Pay the $25 fee and complete identity verification. Allow a few days.
3. **Choose Organization, not Personal, if you can.** You would register as
   Moon Vision Media. It needs a D-U-N-S number (free, from Dun & Bradstreet,
   takes about a week), but it skips the rule below.

**The rule for new Personal accounts:** before Google lets you publish, you
must run a *closed test* with **at least 12 testers who stay opted in for
14 days in a row**. Friends and family with Android phones are fine. Start
this as early as possible — it is the slowest part of the whole process.

## 2.2 Build the Android app (no coding)

The Play Store app will open your website full-screen with no browser bar,
so every update you deploy reaches Android players instantly.

1. In a browser, go to the **PWABuilder** website.
2. Type your site's address and press **Start**. It will score the site;
   the manifest and service worker are already set up.
3. Click **Package for stores**, then **Android**, then **Generate**.
4. Fill in:
   - **Package ID:** `com.moonvisionmedia.shutterblip` (must match exactly —
     the server already expects it)
   - **App name:** `ShutterBlip`
   - **Signing key:** *Create new*
5. Download the zip and unzip it. Inside you will find:
   - an `.aab` file — this is what you upload to Google
   - `signing.keystore` and `signing-key-info.txt` — **back these up in two
     places right now** (a USB stick and a password manager). Lose them and
     you can never update the app again.
   - `assetlinks.json`

**Never put the keystore or key info file on GitHub.** The `.gitignore` in
this release blocks both.

## 2.3 Create the app in Play Console

1. **Create app** → name `ShutterBlip`, language English, **Game**, **Free**.
2. **Test and release → Testing → Closed testing** → create a track, add
   your testers' Google email addresses, upload the `.aab`.
3. Send the testers the opt-in link Play Console gives you.

## 2.4 Link the app to your website

Without this the app shows a browser bar at the top.

1. In Play Console: **Test and release → App integrity → App signing**.
   Copy the **SHA-256 certificate fingerprint** under *App signing key
   certificate*. It looks like `AB:CD:12:...` (32 pairs).
2. Open `signing-key-info.txt` from the PWABuilder zip and copy its SHA-256
   fingerprint too.
3. On the server:

```
cd /var/www/shutterblip
```

```
nano server/local.env
```

Add one line, with both fingerprints separated by a comma and no spaces:

```
ANDROID_SHA256=AB:CD:...first...,12:34:...second...
```

Save, then restart so the game reads the file again:

```
pm2 delete shutterblip
```

```
pm2 start ecosystem.config.js
```

```
pm2 save
```

4. In a browser, open your site with `/.well-known/assetlinks.json` on the
   end. You should see your package name and both fingerprints.

## 2.5 Store listing

**Grow → Store presence → Main store listing**

- **Short description** (80 characters max):
  `Learn a real camera by shooting one. Lessons, puzzles and photo duels.`
- **Full description:** start with what the game is and who it is for, then
  the three ways to play (Shoot, Solve, Duel), then "works offline".
- **App icon:** `icon-512.png` from this folder.
- **Feature graphic:** 1024 × 500. A screenshot of the entry screen cropped
  to that size works.
- **Phone screenshots:** at least 2. Take them on your phone: a lesson, a
  result screen, a puzzle, the You tab.

## 2.6 App content — the questionnaires

**Policy and programs → App content**. Answer each:

| Section | Answer |
|---|---|
| Privacy policy | Your site + `/privacy` |
| App access | *All or some functionality is restricted* → give the reviewer account (Part 4) |
| Ads | **Yes** if the sponsor card is switched on in admin (MoonBlips is still an ad, even though it is yours). **No** if it is off. |
| Content rating | Fill the questionnaire honestly: no violence, no gambling, users can see each other's **usernames** (user interaction: yes), no chat. Expect **Everyone / PEGI 3**. |
| Target audience | **13–15, 16–17, 18+**. Do **not** tick under 13 — the game does not allow accounts below 13. |
| Data safety | See the table below |
| Account deletion | Your site + `/delete-account` |
| Government / financial / health | No |

### Data safety answers

*Does your app collect or share user data?* **Yes, collects. Does not share.**
*Is data encrypted in transit?* **Yes.** *Can users request deletion?* **Yes.**

| Data type | Collected | Why | Optional? |
|---|---|---|---|
| Name | Yes | Account management | Optional |
| Email address | Yes | Account management | Optional |
| User IDs (username) | Yes | App functionality, Account management | Required for an account |
| Other info: birth year | Yes | Analytics | Optional |
| App interactions (scores, play) | Yes | App functionality, Analytics | Required |
| Other user-generated content (camera settings per shot) | Yes | App functionality | Required |
| Crash logs / diagnostics | No | | |
| Approximate location | **Yes — declare it.** The game never uses GPS or looks up addresses, but it records the country your device's time zone implies. Declaring that is the safe side of the rule. | Analytics | Required |
| Precise location | No | | |
| Device or other IDs | No | | |

## 2.7 Go live

After 14 days with 12 testers (Personal accounts only), **Apply for
production** appears on the Dashboard. Answer its questions about the test,
then submit. Review usually takes a few days.

---

# Part 3 — Apple App Store

## 3.1 The honest risk

Apple rejects apps that are "just a website in a wrapper" (Guideline 4.2).
The iPhone app is different from the Android one because of this: the game
is **built into the app itself**, not loaded from your site, so it runs
fully offline, and it uses the phone's haptics. That is a real argument,
but there is still a chance the first review says 4.2.

If it does, the fix that works best is **daily-puzzle reminders**
(notifications). Ask me and I will add them — it is a day of work and it
makes the app clearly more than a website.

## 3.2 What you need

- A **Mac** (a used Mac mini is fine, or a rented cloud Mac).
- **Xcode** from the Mac App Store (free).
- **Node.js** installed on the Mac.
- **Apple Developer Program** membership ($99/year). Enrol as Moon Vision
  Media if you can — it needs the same D-U-N-S number as Google.

## 3.3 Build it

On the Mac, open Terminal and go to the unzipped `shutterblip-site` folder
(type `cd ` with a space, drag the folder onto the window, press Enter).

The zip already contains a fresh build of the game, so start in the
`mobile` folder:

```
cd mobile
```

```
npm install
```

```
npx cap add ios
```

```
npm run sync
```

```
npx cap open ios
```

Xcode opens. Then:

1. Click **App** in the left sidebar, then **Signing & Capabilities**.
   Choose your team. The bundle identifier is already
   `com.moonvisionmedia.shutterblip`.
2. Under **General**, set Version `1.0` and Build `1`.
3. App icon: drag `icon-512.png` onto **App → Assets → AppIcon** (Xcode
   asks for 1024 × 1024 — upscale the icon in Preview, or send me a
   1024 version of your logo and I will make it).
4. Plug in your iPhone, pick it at the top, press ▶ and play a round.
5. **Product → Archive**, then **Distribute App → App Store Connect**.

**Every future update:** unzip the new release, and in its `mobile` folder
run `npm install`, `npx cap add ios` and `npm run sync` again, then archive. The iPhone app does **not** update itself from your
site the way the Android app does.

## 3.4 App Store Connect

In a browser, sign in to **App Store Connect** → **Apps → +**.

- **Privacy Policy URL:** your site + `/privacy`
- **Age rating:** answer the questionnaire honestly (no violence, no
  gambling, no chat; usernames are visible to others). Expect **4+** or
  **9+**.
- **App Privacy** ("nutrition label"): *Data Not Linked to You*: none.
  *Data Linked to You*: **Contact Info** (name, email — optional),
  **User Content** (gameplay), **Identifiers** (user ID),
  **Usage Data** (product interaction), **Location → Coarse Location**
  (the country from the time zone — same reasoning as Google), and
  **Other Data** (birth year, optional). Purposes: App Functionality,
  Analytics. **Tracking: No.**
- **Sign in with Apple:** not required, because Google sign-in is off. If
  you ever switch Google sign-in on, Apple requires Sign in with Apple as
  well — tell me first.
- **In-app purchases:** none. The shop is off. If you ever sell anything
  inside the iPhone app, it must go through Apple's in-app purchase.

---

# Part 4 — the reviewer account (both stores)

Both reviewers will want to sign in and see everything.

1. Open the game, tap **Create a free account**, and make:
   - Username: `AppReview`
   - A long password you write down
2. Play the first two locations to a C or better on each round, so the
   reviewer can see a location unlock.
3. In each store's review notes, paste:

> Username: AppReview — Password: (yours).
> ShutterBlip teaches camera exposure through play. The first two locations
> are open; later ones unlock by scoring a C or better. Duels are labelled
> before they start as a practice bot, a recorded run of a real player, or a
> live opponent. Account deletion is in the You tab (tap twice), and at
> /delete-account on our website.

Don't delete this account, and don't change its password without updating
both stores.

---

# If a review comes back rejected

Copy the reviewer's message and send it to me exactly as written. Most
rejections are fixed in a day and resubmitted. Common ones:

- **4.2 Minimum functionality (Apple)** — add reminders (see 3.1).
- **Broken link / crash** — usually the server was restarted mid-review.
- **Account deletion not found** — point them to You tab → Delete my account.
- **Metadata** — a screenshot that doesn't match the app, or a description
  that mentions features that are switched off (the shop, live matchmaking).
