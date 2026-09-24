# ShutterBlip — the site files

**These are the files that go on your server. Nothing here is optional
except where noted.**

Upload this whole folder (keeping the `server` subfolder intact) to GitHub,
then onto your droplet: `GITHUB-UPDATE.md`. To get into Google Play and the
App Store: `STORE-SUBMIT.md`.

---

## What each file is

| File | What it does |
|---|---|
| `index.min.html` | **The game your players actually load.** Minified, comments stripped. This is what nginx serves. |
| `index.html` | The readable source, with all the comments explaining how everything works. **Never served to players** — keep it for making changes. |
| `server/mock.js` | The server: accounts, duels, matchmaking, puzzles, leaderboards, the admin dashboard. |
| `server/db.js` | Saves everything to a SQLite database so accounts survive restarts. |
| `server/security.js` | Rate limiting, security headers, input validation. |
| `server/geo.js` | Turns a device's time zone into a country, and into the player's own local hour, for the admin dashboard. No IP address is ever geolocated — see SERVER.md. |
| `sw.js` | Makes the game work offline and installable to a home screen. |
| `manifest.webmanifest` | The app name/icon config for "Add to Home Screen". |
| `icon-*.png`, `apple-touch-icon.png` | App icons. |
| `build.js` | Rebuilds `index.min.html` from `index.html` after you make changes. |
| `package.json` | Tells `npm install` which pieces to download. |
| `ecosystem.config.js` | How pm2 starts the game: the ordinary settings. Private ones go in `server/local.env` on the server (never on GitHub). |
| `legal/` | The privacy policy, terms and account-deletion pages the app stores link to (`/privacy`, `/terms`, `/delete-account`). `build.js` regenerates the first two. |
| `mobile/` | The iPhone/Android app shell. Only used when building the store apps — see `STORE-SUBMIT.md`. |
| `tools/check-rollover.js` | Proves a new release keeps every account and stat before you restart. Run it every release. |

---

## Upgrading an existing server

Replace the files, `npm install`, restart. The database migrates itself on
startup — it adds the new columns for time-played and location tracking and
prints how many it added. Nothing is dropped or renamed, and an already-
migrated database is left alone, so restarting twice is harmless.

Two things to know about the first day after this upgrade:

- The **When** and **Where** tabs will look sparse at first. Visits recorded
  before this release have no time zone stored, and players whose browsers
  are still holding the old cached build will not send one until that cache
  expires. Those visits still count everywhere else. The When tab shows the
  coverage percentage; it climbs on its own.
- The **privacy policy in the game changed** with this release, because the
  game now records how long people play, the local hour they play at, and
  the country implied by their device's time zone. If you deploy the server
  without also deploying the new `index.min.html`, players will be running a
  policy that does not describe what is being collected. Deploy both.

---

## The two commands that matter

**Install dependencies** (once, on the server, inside this folder):
```
npm install
```

**Start the game** (after putting `ADMIN_PASSWORD=...` in `server/local.env`
— STORE-SUBMIT.md Part 1 shows how):
```
pm2 start ecosystem.config.js
```

The settings file switches on `PERSIST=1` for you. Without it the server
runs in demo mode and **forgets every account on restart.**

---

## When you change something later

1. Edit `index.html` (the readable one, never the `.min` file)
2. Run `node build.js` — this regenerates `index.min.html`
3. Open `sw.js` and bump the version number near the top
   (`shutterblip-v8` → `v9`). **If you skip this, returning players keep
   seeing the old version.**
4. Commit and push to GitHub
5. On the server: follow Part 3 of `GITHUB-UPDATE.md`, including the rollover check

---

## Two things that are deliberately switched OFF

Both are one-word changes in `index.html`, but do not flip either until the
reason below is genuinely resolved.

**The Shop / Supporter purchases** (`BUILD.store` is `false`).
The store is fully built and tested, but Stripe is not connected — no real
money moves. If you turn this on now, anyone can tap "Buy Supporter" and
receive it permanently for free, and you cannot take it back later without
looking like you robbed them. Turn it on only after Stripe checkout **and**
its webhook are live, and you have completed one real test purchase with a
real card.

**Ads** (same flag).
Ads exist to sell Supporter, and every ad carries a "Remove ads — $4.99"
button. Showing ads with no working way to remove them is the worst of both
worlds, so they stay off until the store does.
