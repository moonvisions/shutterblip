# ShutterBlip — server contract for launch

Everything in `index.html` runs offline. The server adds four things the
client cannot do alone: shared truth (daily content), identity (accounts),
a trustworthy leaderboard, and live 1v1 matchmaking. This is the exact
surface the current client already calls or is ready to call.

Base URL: same origin as the page (`API_BASE = ''`). Auth: `Authorization:
Bearer <token>`. Every response must be JSON; the client treats any error or
timeout (8 s) as "offline" and falls back to local play, so an outage
degrades rather than breaks.

## 0. Content shape (read this first)

Every location is exactly five rounds now — one clean, comparable session per
place (`LOCATIONS[i].challenges`, five entries each, ids `<loc>-1`..`<loc>-5`).
The old paid "PRO" extra-round concept (`PRO_ROUNDS`) is empty and unused;
the strongest of those rounds were folded into the five instead of being cut,
so no content was lost, only tightened. `ch.tier` still marks Boulevard's
five as `free` and every other location's five as `paid` — the shop/paywall
model is otherwise unchanged, it's just five rounds per pack now instead of
a variable 3–7. If paid extra rounds return later, re-populate `PRO_ROUNDS`
and the merge step already there will pick them up with no other changes.

## Admin portal

Runs on the same server, at `/admin` — never shipped in the client bundle,
never referenced from index.html, so nothing about it appears in
view-source regardless of how the client is built. Requires
`ADMIN_PASSWORD` as an environment variable; the server refuses to start
without it rather than silently leaving the portal open.

```
ADMIN_PASSWORD=your-password node server/mock.js
# then visit http://localhost:8787/admin
```

What it shows: account and guest counts, revenue, a 14-day signup chart,
top players by XP and by duel rating, recent signups and purchases, a
player look-up with delete, and live feature-flag toggles (the same
`liveDuels`/`boards` flags the client already reads from `/v1/config`).

Security already built in:
- Session cookie is `HttpOnly` + `SameSite=Strict`, expires after 12 hours.
- Failed logins are rate-limited **per IP**, with a lockout that doubles
  each time (30s, 60s, 120s...) after 5 free attempts — verified by
  scripting 6 wrong passwords and confirming even the *correct* password
  is then refused with 429 until the lockout clears.
- All admin-rendered text that came from a player (handles, skus) is
  HTML-escaped before it reaches the page.

**PRODUCTION: a password alone is one leaked/guessed credential away from
everything** — your entire user list, every purchase, delete access to any
account. Before this holds real user data:
1. Put it behind a second factor (TOTP) or an IP allowlist / VPN, not just
   the password.
2. Move `ADMIN_PASSWORD` to a real secrets manager, not a plain env var in
   a shell history.
3. Log every admin action (who deleted what, when) — there is no audit
   log yet, and there should be one before this touches real accounts.
4. Consider a separate subdomain (`admin.yourdomain.com`) so it is not
   discoverable by anyone probing paths on the main game domain.

## Analytics and the admin portal

Built into `mock.js`, at `/admin`, and gated separately from player accounts
-- an admin login is not a player login with a flag, it is its own system,
password-only, set via `ADMIN_PASSWORD` (the server refuses to start
without it), rate-limited with a doubling lockout after 5 failed attempts,
12-hour sessions, HttpOnly cookie. **Production: put this behind more than
a password** -- an IP allowlist, a VPN, or a second factor -- before real
money and real user data are on the line. A password alone, however well
guarded, is one leak away from everything.

**What it tracks** (`events` array, capped at 20,000 with the oldest
trimmed every 5 minutes): signup, guest creation, login, upgrade, shot
submitted, puzzle answered (with template and correct/incorrect), duel
result (with `kind: 'live'|'bot'` so you can tell whether matchmaking is
actually pairing people or everyone is hitting the bot fallback), purchase.
Every authenticated request also refreshes `user.lastSeenAt`, which is what
makes DAU/WAU/MAU and D1 retention computable at all -- without a
heartbeat, "active" has no definition.

**The dashboard** is seven tabs, each one question, with a range control
(7 / 30 / 90 days / all time) that drives every number on the page:

| Tab | The question it answers |
|---|---|
| Overview | Is this working? Players, active today, time played, retention, new-player chart, top countries, live feed. |
| Time played | How long do people stay? Totals, average visit, average visit over a minute, bounce rate, the shape of session length, time per day, who plays most. |
| When | What hour of *their* day do they play? A 7x24 local-time heatmap, hour and weekday histograms, and a coverage figure. |
| Where | Which countries, which devices, which languages, rolled up by region. |
| Players | Searchable, sortable table with country, time played and delete. |
| Content | Hardest puzzle templates by pass rate, live-vs-bot duel split, most engaged players, referrers, top by XP and duel rating. |
| Money | Revenue, purchase log, ad performance, the sold-slot form. |
| Settings | Feature flags, and what the analytics do and do not collect. |

Everything reads from the **database**, not from the in-memory `events`
array. That array still exists and still feeds the live feed, but every
chart used to be built on it, which meant every number on this page reset
to zero on each redeploy -- exactly the history you cannot afford to lose.

### Time played

A visit is one sitting: requests less than `SESSION_GAP` (30 minutes) apart
belong to the same session row. Its length is `last_beat_at - started_at`.

Two things to know before trusting any figure built on it:

- It **undercounts the tail**. Whatever the player did after their last
  request is invisible. `POST /v1/beat` -- a route that does nothing except
  exist, so that reaching it refreshes the session -- is called by the client
  once a minute while the tab is visible, which narrows the gap to about a
  minute. Before that heartbeat existed, somebody spending ten minutes
  framing a careful shot made no requests at all and scored as seconds.
  Background tabs do not beat, so a window left open overnight cannot invent
  eight hours of play.
- A **single-request visit measures zero**, which is correct (they played no
  time) but drags the mean down. The dashboard shows the mean, the mean over
  sessions longer than a minute, the bounce rate and the full distribution
  side by side, because any one of them alone misleads.

### When, and where -- from the time zone, never from the IP

`server/geo.js`. The client sends two headers on every call, set once at
boot from values the browser already holds:

```
X-SB-TZ:    Intl.DateTimeFormat().resolvedOptions().timeZone   e.g. Europe/London
X-SB-Lang:  navigator.languages[0]                             e.g. en-GB
```

The zone maps to an ISO country through a table in `geo.js`, and the local
hour and weekday are computed in Node at session start and **stored** on the
row (`local_hour`, `local_dow`) -- SQLite has no idea what "America/Denver"
means, so there is no way to ask "when do people play, in their own evening"
at query time. Device class (phone / tablet / desktop) comes from the user
agent. All of it lands on the session row and, as a last-known value, on the
player row.

**Why not IP geolocation.** It needs either a licensed database or a
third-party API -- a recurring dependency that can go down, or every
player's IP sent to somebody else's server. It is also wrong often enough to
annoy: carrier gateways and VPNs land people in the wrong country routinely.
A time zone is a *setting on a device*, not a measurement of a person. It is
accurate to roughly the country and deliberately no finer -- everyone from
Maine to Miami reports `America/New_York` -- and it is the only honest way
to know somebody plays after dinner rather than at 3am.

**If you ever change this to an IP lookup, change the privacy policy
first.** The policy in `index.html` describes this method specifically, and
says in as many words that no address is geolocated. That has to stay true.

### Coverage

Sessions from before this shipped, and sessions from players still on a
cached build, have `NULL` in the new columns. They are counted in every
other figure and simply excluded from the When grid and the Where
breakdown, which is why the When tab carries a coverage percentage. It
climbs on its own as old service-worker caches expire. `fillSession`
backfills a session that opened before the zone was known, and only ever
fills blanks -- it never overwrites.

### Migrations

`CREATE TABLE IF NOT EXISTS` builds a correct database from nothing and does
**nothing at all** to one that already has players in it. Adding a column to
that block and shipping it gives every new install the column and every
existing install a stream of "no such column" errors. So `db.js` migrates
additively, checking `PRAGMA table_info` rather than trusting a version
number: `addColumn()` skips what exists, adds what does not, and never
drops or renames anything.

**Deletion is real, not cosmetic.** `scrubAccount()` removes the user row,
revokes every token, and strips their rows from `shots`, `events`, `queue`
and `sessions` -- not just their ability to log in. Sessions need removing
by hand: they deliberately carry no foreign key to `users`, so they do not
cascade, and a deleted account would otherwise leave its visit history,
country and device type in the table forever. The privacy policy promises
deletion removes your data, and a promise like that has to be mechanically
true the day the tracking ships, not eventually true. `/v1/me/export`
likewise carries the visit history and device details, because the policy
promises a player can download everything held about them -- and that
promise binds every column added afterwards, not only the ones that existed
when it was written.

The one thing NOT scrubbed is a completed duel's shared match record
(`duels` Map) -- deleting your account should not silently corrupt an
opponent's own duel history, so a match already played stays as a match that
happened, with your side no longer traceable to a live account.

**What this still needs before it is more than one person's tool**: a
lightweight admin-account system with named logins and an audit log. A
shared password stops scaling the moment a second person needs in, and
there is currently no record of who deleted what. (Persistence used to be
on this list; it is built -- see the persistence section below.)

## Releasing: the rollover rule

**Every release carries every account, stat and analytic forward. No
exceptions.** A version that resets, orphans or re-locks anything a player
has earned does not ship.

What that means when you change this code:

- **Schema changes are additive only.** New columns go through
  `addColumn()` in `db.js`, which checks what is actually in the file. Never
  drop, rename, or rewrite a column that holds player data. A new
  `CREATE TABLE IF NOT EXISTS` does nothing to a database that already
  exists.
- **Derive, don't store, where you can.** Location unlocks are computed from
  personal bests the server already keeps — so they work for every player
  from every past version with nothing to migrate. Prefer that to a new
  field that starts empty for everyone who already played.
- **Never re-lock.** Anything a player has played or paid for stays open,
  whatever a new rule says.
- **Run the check.** `node tools/check-rollover.js /path/to/previous/release`
  before every deploy. It is Step 6 of `GITHUB-UPDATE.md`. It uses a
  throwaway database and never touches live data.

## Environment variables

On the droplet these are set by `ecosystem.config.js` (the ordinary ones)
and `server/local.env` (the private ones — never committed). Start with
`pm2 start ecosystem.config.js`; see STORE-SUBMIT.md Part 1.

The server refuses to start without `ADMIN_PASSWORD`. The rest change
behaviour and several of them are security-relevant, so they are listed
together rather than scattered through the file.

| Variable | Effect if unset | Set it to |
|---|---|---|
| `ADMIN_PASSWORD` | **Server will not start.** | A long random string, nowhere else. |
| `PERSIST` | Everything in memory, wiped on restart. | `1`, always, in production. |
| `DATA_DIR` | `./data` — **inside the folder nginx publishes**. | A path outside the web root, e.g. `/var/lib/shutterblip`. |
| `TRUST_PROXY` | `X-Forwarded-For` ignored; rate limits key on the socket. Correct for a directly-exposed server. | `1` **only** when nginx is in front. |
| `CORS_ORIGIN` | `*` — any site can drive the public API from its visitors. | Your site, plus `capacitor://localhost,https://localhost` for the iPhone/Android app shells (comma-separated). The ecosystem file sets this. |
| `ANDROID_PACKAGE` | `/.well-known/assetlinks.json` is a 404. | `com.moonvisionmedia.shutterblip` (the ecosystem file sets it). |
| `ANDROID_SHA256` | Same — the Play Store app shows a browser bar. | The SHA-256 fingerprints from Play Console and PWABuilder, comma-separated. |
| `GOOGLE_CLIENT_ID` | Google sign-in returns 503. | Your OAuth client id, once you want it. |
| `STRIPE_SECRET_KEY` | The store refuses checkout. | Your key, once checkout is wired up. |
| `ADMIN_INSECURE_COOKIE` | Admin cookie is `Secure` (HTTPS only). | Never on a real server. Local http development only. |

## Security: what is enforced, and what still is not

Fixed in this pass, each one reproduced before and re-tested after:

- **Static files are an allowlist.** The handler used to serve any file
  under the project root, so `GET /data/shutterblip.db` returned the whole
  database — emails, birth years, password hashes, and the tokens table,
  which is a list of live sessions. nginx serves these before Node does, so
  the deny rules in `SECURITY-FIX-NOW.md` are part of the fix, not a
  belt-and-braces extra.
- **Google ID tokens are verified** — RS256 signature against Google's
  published keys, plus `iss`, `aud` and `exp`, with `email_verified`
  required before matching an account by email. Fails closed. The route
  used to decode the token and believe it, which meant anyone who knew a
  player's email address could sign in as them.
- **Checkout grants nothing.** Entitlements may only ever come from a
  verified Stripe webhook. The old path granted the item instantly and
  logged its price as revenue, so both the shop and the dashboard's
  revenue figure were free to anyone.
- **XP is derived server-side** and the client's figure ignored; level ids
  are validated; duel results are single-submission and both settle
  functions refuse a second run.
- **Tokens can be revoked** (`/v1/auth/logout`, `/v1/auth/logout-all`) and
  slide forward on use rather than expiring on a fixed schedule.
- **`banned` is enforced in `auth()`** and set from the Players tab, so
  moderation is no longer "delete them permanently or do nothing".
- **Constant-time comparison** for the player password and the admin
  password; passwords capped at 200 characters so a huge one cannot stall
  the event loop through scrypt.
- **`X-Forwarded-For` is only trusted behind `TRUST_PROXY`,** and then from
  the last hop. Read from the wrong end it let anyone evade the rate limit
  with a fresh fake address per request — or aim the admin's own address at
  the lockout and keep them out of their portal.

Still open, in the order they matter:

1. **Scores are the client's word.** `/v1/shots` accepts `clientScore` and
   `/v1/duels/:id/result` accepts five rows. The frame is sent and ignored.
   Re-simulating it server-side with the shared scoring code is the only
   real fix, and until it exists the leaderboards are honest only because
   nobody has bothered.
2. **Admin is one shared password.** No named logins, no audit log, so
   there is no record of who deleted what. Put an IP allowlist or a VPN in
   front of `/admin` as well.
3. **`script-src` still allows `'unsafe-inline'`**, because the game is one
   inline script. The rest of the CSP is strict. Moving the script to its
   own file would let this come off.
4. **Ad events are unauthenticated and undeduplicated**, so impression
   counts are not something to invoice on.
5. **Email is never verified**, and registration has no captcha, so a
   deleted troublemaker can re-register immediately.

## The store, Supporter, and the one rule that protects your leaderboard

`GET /v1/catalogue`, `POST /v1/purchase/checkout`, `POST /v1/store/redeem`,
`PUT /v1/profile/equip` are implemented in `mock.js` and exercised end to
end (purchase, ad-skip, cosmetic equip, duplicate-purchase refusal).

**Every item is a location pack or a cosmetic. Nothing for sale touches
scoring, matchmaking, or a leaderboard's legitimacy — duels are never sold.**
That line is the entire reason your leaderboard means anything; the moment
a purchase can change a score, competitive trust is gone and the board is
worthless to everyone still climbing it honestly. Keep this rule if you add
items later — it is a design constraint, not a suggestion.

**Supporter** (`sku:'supporter'`, one-time, not a subscription) grants
`['supporter','badge.supporter','skin.supporter']` and:
- Turns off the interstitial ad entirely (`adDue()` checks `owns` live).
- An exclusive badge and camera finish, sold only as part of this bundle,
  never earned and never sold separately.
- Nothing else. No score boost, no puzzle-rating boost, no faster
  matchmaking.

**Why one-time instead of a subscription** (chess.com's actual model is
recurring): a subscription needs a cancellation flow, failed-payment
retries, and support load for "why was I charged again" — real ongoing
work a two-person team should not take on before the game has proven it
has an audience worth serving that way. One-time purchases via Stripe
Checkout are close to zero-maintenance once wired up. Revisit a
subscription tier once Supporter alone is selling.

## PRODUCTION: checkout must go through Stripe, and ownership must come
## from a webhook, never from the checkout endpoint itself
`mock.js`'s `/v1/purchase/checkout` grants ownership instantly because it
has no payment processor behind it — that shortcut must never reach a
build real money touches. The real version:
1. `POST /v1/purchase/checkout` creates a **Stripe Checkout Session**
   (`stripe.checkout.sessions.create`) with the sku in `metadata`, and
   returns its real `url` — the client already just redirects there, no
   change needed on that side.
2. Stripe redirects the player back after payment either way (success or
   cancel) — the client shows the store again regardless.
3. Grant ownership **only** from the `checkout.session.completed` webhook,
   with the Stripe signature header verified. A client hitting "I paid,
   give me the item" directly, with no webhook confirmation, is exactly
   how someone gets a free copy of everything you sell.
4. Blips redemption (`/v1/store/redeem`) never touches Stripe — it is an
   internal balance, so the existing mock logic (check balance, deduct,
   grant) is close to what production needs already.

## Persistence — built, and the one thing still to wire

`server/db.js` is a real SQLite layer, written and tested: full schema
(users, tokens, owns, bests, shots, solved, events, ad_events,
puzzle_stats, duels_done), every index the queries need, WAL mode,
prepared statements, cascade deletes, a `scrub()` transaction that actually
removes a player's data, hourly housekeeping, and a clean shutdown that
checkpoints the WAL. Verified directly: writing a user, granting an item,
recording a shot, reading the leaderboard, updating XP, deleting with
cascade, **and confirming data survives a process restart.**

`server/security.js` is also built and tested: per-IP fixed-window rate
limiting (auth 10/min, writes 120/min, reads 600/min, ads 60/min),
security headers including a tight CSP, `X-Forwarded-For` handling that
takes the first entry (later ones are client-forgeable), input validators
for handles/passwords/emails, and a **size-capped body reader** — without
that cap one request claiming to be a gigabyte of JSON takes the server
down. Both are wired into the request dispatcher, verified live: headers
present on every response, 14 rapid signups → 10 allowed / 4 blocked, an
oversized body rejected with the server still serving.

**This is now wired and working.** Run with `PERSIST=1` and accounts,
XP, duel ratings, purchases, best scores, puzzle progress and the
leaderboards all survive a restart — verified by registering, playing a
live duel, answering a puzzle, buying Supporter, killing the process, and
logging back in to find everything intact.

**How it was wired, and why this way.** The server referenced `users` and
`tokens` as Maps in 29 places. Rewriting each call site is 29 chances to
introduce a bug in the one subsystem where a bug means lost accounts.
Instead `db.js` exports **Map-compatible adapters** — same
`get/set/has/delete/values/entries` interface, SQLite underneath — so every
existing line works unchanged.

The subtle part worth understanding before you modify anything: the server
mutates user objects directly (`u.xp += 10`, `u.duels.w++`) without calling
`.set()` afterwards. A plain object would silently lose that. So every user
handed out is wrapped in a **deep Proxy** that marks it dirty on any write,
nested included, and a single `flush()` on response-finish persists it. One
database write per request, and no endpoint can forget to save.

Two things the row UPDATE does not cover, handled explicitly in `flush()`:
`owns` and `bests` live in their own tables, so a purchase
(`u.owns.push(sku)`) and a new record (`u.bests[level] = score`) are synced
there too. Missing this is how you ship a shop that takes people's money
and forgets the purchase on the next restart — it was a real bug, caught
by testing a restart rather than assuming.

Live duel queue state deliberately stays in memory: it is genuinely
ephemeral, and rebuilding it empty on restart is correct behaviour.

## Reference implementation
`server/mock.js` implements every endpoint below in memory with zero
dependencies. Run `node server/mock.js`, open http://localhost:8787 in two
tabs, and live 1v1 works end to end. Comments marked PRODUCTION mark the
places where it trusts the client and a real server must not.

## Guests

```
POST /v1/auth/guest              -> {token, me, guest:true}
POST /v1/auth/upgrade  {handle, password, email?, name?, birthYear?,
                        acceptedTerms, ageConfirmed, termsVersion?, marketingOk?}
                                 -> {me, upgraded:true}
```
The entry screen offers **Play as a guest** or **Create a free account**, and
nothing in between. A guest gets a server-allocated `GuestNNNN` handle -- the
number must come from the server, since that is the only way two guests
cannot collide.

A guest is a real row: it holds XP, bests, puzzle rating and duel rating.

**Guests CAN play live 1v1.** Keeping them out would leave the queue empty at
launch for no real gain, and a duel is between two people who both showed up.
Their rating moves normally and the opponent's rating moves fairly.

**Guests are NOT on any leaderboard.** This is the line that matters: nothing
stops one person minting a thousand guests, so a board that listed them could
be flooded trivially. All THREE boards must filter them, and note that they
filter differently:
- `scope=puzzles` and `scope=duels` read the user list -> filter `!u.guest`.
- `scope=all|level` reads the **shots log**, which has no guest flag on it --
  it must look each handle back up. Missing this leaks guests onto the most
  visible board in the game; `mock.js` has the lookup, do not drop it.

A guest's recorded scores are not deleted, only hidden. The moment they
upgrade, their existing shots appear on the board under the new name --
verified in test: runs board `[]` as a guest, `['ARRIVED']` immediately
after upgrading, with XP unchanged.

**Upgrade must happen in place.** Keep the row and its id; change only the
handle, password and email. `mock.js` also moves token bindings and rewrites
recorded shots to the new handle. Anything that loses progress here teaches
players that signing up costs them something -- verified in test: XP 161 and
best 75.86 both survive the upgrade unchanged, and the old `GuestNNNN` name
is freed.

## Usernames: unique, and permanent

```
GET /v1/auth/check?handle=NAME -> {available:bool, reason:'taken'|'blocked'|'format'|null}
```
The client calls this as the player types, so "taken" arrives before they
commit rather than after. It only reports -- `register` is what reserves.

Rules the server must enforce (the client checks the same things, but a
client check is a courtesy, not a guarantee):
- **Case-insensitive uniqueness.** Store and compare on `handle.toLowerCase()`.
  `Dana` and `dana` are the same name.
- Charset `[A-Za-z0-9_]{3,16}`, and a blocklist covering profanity plus
  impersonation (`admin`, `moderator`, `support`, `staff`, `official`,
  your own brand).
- Reserve at registration inside a transaction or unique index -- two people
  submitting the same free name at the same instant must not both succeed.

**There is deliberately no rename endpoint.** A handle on a public
leaderboard has to be stable, or someone can farm a score, rename, and farm
again with nobody able to follow it. `mock.js` returns 403 on
`POST /v1/me/handle` to make the intent explicit. If you ever add renaming,
rate-limit it to roughly once a year and carry the score history across.

## Registration payload (client sends this now)
```
POST /v1/auth/register {handle, email?, password,
  acceptedTerms:true, termsVersion:"2026-08-01", ageConfirmed:true, marketingOk:bool}
```
Reject without `acceptedTerms` and `ageConfirmed`; store `termsVersion` so a
changed policy can re-prompt (the Terms text promises this).

## Feature flags
`GET /v1/config` may include `features:{liveDuels:bool, boards:bool}`; the
client merges it over its defaults at boot. `liveDuels:false` turns the DUEL
tab's headline into Practice with "coming soon"; the queue endpoint should
also return 503 while it is off.

## 1. Identity
```
POST /v1/auth/register   {handle, password}      -> {token, me}
POST /v1/auth/login      {handle, password}      -> {token, me}
GET  /v1/me                                      -> {handle, entitlements[], created}
POST /v1/me/delete                               -> {ok}
GET  /v1/me/export                               -> full JSON of the account
```
Handles: 3–14 chars, uppercase A–Z 0–9, profanity-filtered, unique
case-insensitively. Deletion and export are already wired to buttons in the
You tab and are a legal requirement in several markets — do not defer them.

## 1b. Google sign-in (already built in the client)

The client has a working "Continue with Google" button. It appears only when
**both** are true: `GOOGLE_CLIENT_ID` is set in index.html, and
`GET /v1/legal` returns `googleEnabled:true`. Either can turn it off without
touching the other.

```
GET  /v1/legal                 -> {googleEnabled:bool, termsVersion}
POST /v1/auth/google  {credential, acceptedTerms?, termsVersion?, ageConfirmed?, marketingOk?}
                               -> {token, me}
                               -> 428 "Accept the terms and confirm your age."  (new account, consents missing)
```
- `credential` is the Google ID token (a JWT) from Google Identity Services.
- **Verify it properly**: fetch `https://www.googleapis.com/oauth2/v3/certs`,
  check the signature, then check `aud` equals your client id, `iss` is
  `accounts.google.com`, and `exp` is in the future. `server/mock.js` only
  *decodes* it — trivially forgeable, and the most dangerous shortcut in that
  file. It is commented as such. Never ship that part.
- Match an existing account on `googleSub` first, then on verified `email`
  (so someone who signed up with a password can later link Google).
- **A new account via Google must clear the same consents as the form.**
  Return 428 when they are missing; the client then shows the age and terms
  boxes and retries. Without this, social sign-in becomes a way around the
  13+ age gate.
- Derive a handle from `given_name`/email, strip it to the handle charset,
  and de-duplicate with a numeric suffix.

Facebook Login would be a second, near-identical endpoint
(`POST /v1/auth/facebook`, verify the token against Facebook's debug_token
endpoint). Nothing in the client assumes Google specifically — but see
DEPLOY.md for why it is probably not worth it.

## 2. Puzzles (2,000, deterministic)
The generator is shared code: `server/puzzles.js` is the source of truth and
`extract_puzzles.py` copies it verbatim into the client. Never edit the copy.
The answer never goes to the client for a server-marked puzzle.
```
GET  /v1/puzzles                 -> {next, progress:{rating,solved,attempted,streak,best_streak}, rewards[], nextReward}
GET  /v1/puzzles/:n              -> publicPuzzle(n) + {rating}
POST /v1/puzzles/:n/answer       {choice}                     -> verdict
POST /v1/puzzles/:n/answer       {levelId, seed, variant, frame} -> verdict
GET  /v1/puzzles/daily           -> {day, easy, hard, bothDone, streak}
```
`verdict = {correct, answer?, why, rating, ratingChange, progress, next, unlocked[]}`

For **camera** puzzles the verdict should also carry a scored breakdown:
```
score: 0-100                       // the mean of the parts below
parts: [{ key, label, ok, score,   // one entry per criterion in `tolerance`
          want, got, fix }]        // human-readable strings, shown verbatim
```
`checkCamera()` in the shared generator now produces exactly this, so a
server running the same code gets it for free. If the server omits `parts`,
the client derives them locally from the same measurement — so the player
always sees the breakdown, but the server stays the authority on `correct`.

**Camera puzzles (the part that needs building).** The client sends the
frame's state, not a score:
```
frame   = {ap, shIdx, iso, focal, focusDist, camX, camY, subX, camVel, clock, W, H}
variant = {ev, speed, dist, seed}   // null for a plain level round
```
The server must re-run `measure()` from these numbers and mark with
`checkCamera(n, m)`. `variant` exists because a camera puzzle now builds its
own round (light, weather, layout, speed, distance) from the puzzle number —
see `puzzleChallenge()` in the client. Two options, in order of preference:
1. Port `puzzleChallenge()` to the server and derive the variant from `n`
   yourself, ignoring the client's copy. Cheat-proof.
2. Trust the posted variant for now and validate that it matches what `n`
   would produce. Simpler, still safe if you check it.
Until this lands, return 4xx for camera answers and the client marks them
locally (the player sees the same verdict; rating just does not move).

Rating: Glicko-style is fine. Puzzle difficulty comes from its tier (1–10).
Never let a re-solve of an already-solved puzzle raise rating — the client
already displays "unchanged — already solved".

## 3. Daily content
- **Puzzle of the day** is currently derived from the calendar date on the
  device (`POD.n()`), so it works offline. When you serve it, return the same
  number for everyone from `GET /v1/puzzles/daily` and let the client prefer
  the server's answer; keep the local derivation as the offline fallback.
- **The daily pair** (easy + hard) is already server-only and hidden when
  signed out.
- Roll over at 00:00 UTC and send `day` so the client can label it.

### Shots can carry a `variant` now
`POST /v1/shots` includes `variant: {ev, weather, light, seed} | null`. A
null variant is the round exactly as authored. A non-null one is a "second
look" — the client re-serves a round the player has already cleared (best
≥ C) in different light and weather, and the server must apply that ev and
weather before re-simulating the frame, exactly as for camera puzzles. The
light is never more than one stop from the authored value and never a
different time of day, so a personal best on a second look is comparable
to one on the original.

## 4. Leaderboard
```
GET  /v1/board?scope=all|level&level=<id>&window=day|week|all -> [{rank, handle, score, runs}]
GET  /v1/board?scope=puzzles&window=all   -> [{rank, handle, rating, solved, streak}]
GET  /v1/board?scope=duels&window=all     -> [{rank, handle, rating, w, l, streak}]
POST /v1/shots   {levelId, seed, frame, exif, client}         -> {accepted, score}
```
Scores must be **recomputed server-side** from `frame` using the shared
scoring engine. Never accept a client-supplied score — that is the whole
attack surface of a public leaderboard. Reject a shot whose `levelId`/`seed`
pair does not exist, whose `clock` exceeds the round's time limit, or whose
submission rate exceeds one per round per player.

Ranking rule (from the brief): a player's overall rating is the mean of
their **best eligible score per level**, over levels they have played, with
a minimum count before they are ranked at all. Owning more packs must not
raise the average — cap the mean at the number of free levels for
provisional players and mark paid-only levels as ineligible for the global
board if you want that guarantee to be airtight.

## 5. 1v1 duels — asynchronous (code-based)
The client mode is finished and asynchronous: five scenes from one seed,
60 seconds, exposure 50% + composition 50%, highest average wins, results
packed into an `SB1-…` code. To make it live you only need a relay:
```
POST /v1/duels            {}                    -> {duelId, seed, expires}
POST /v1/duels/:id/result {rows:[{e,c,t}×5], frames?} -> {status, opponent?}
GET  /v1/duels/:id                              -> {seed, players:[{handle, rows, avg}], winner}
POST /v1/duels/queue      {}                    -> {duelId, seed, opponent} | {queued:true}
```
- Duel codes are now `v:2` and carry each scene's camera state
  `[e, c, t, ap, shIdx, iso, focal, focusDist, camX, camY, subX, camVel, clock]`.
  The client re-renders the opponent's frame from that, so a live duel needs
  no image upload at all — relay the rows and both players see both photos.
  For ranked play, re-mark from the same state (it is the `frame` of §2).
- `seed` is the only thing that has to be shared — `duelScene(seed, i)` in
  the client generates identical scenes for both players from it.
- For a ranked ladder, re-mark each of the five frames server-side exactly as
  in §2; for casual play the posted rows are enough.
- Keep the code path: it is the offline fallback and the share mechanic.

## 6. Config and packs
`Cloud.config` already reads `GET /v1/config` (xpMult, streakBonus, coachMode,
timerRevealAt, paywall, per-level enable/tier). Entitlements come back on
`/v1/me` as SKUs: `pack.<loc>`, `pro.<loc>`, `pack.all`. `roundLocked()` trusts
the server whenever the player is signed in.

## 7. Before you open the doors
- [ ] Camera-puzzle re-simulation (§2) — otherwise ratings stall on a quarter of the library
- [ ] Server-side scoring for `/v1/shots` (§4) — otherwise the leaderboard is fiction
- [ ] Handle filter + report/block endpoints — the client has the UI, not the backend
- [ ] Rate limits: auth 10/min/IP, answers 60/min/account, shots 30/min/account
- [ ] `sw.js` and `manifest.webmanifest` served from the root (the client registers them only over http(s))
- [ ] A staging copy with `paywall:false` so you can test the free path

## 5b. 1v1 duels — live matchmaking

The client now has a full matchmaking queue UI (`LiveQueue` in the client)
that talks to plain HTTP endpoints — no WebSocket needed, works with
whatever stack you end up choosing. Pure polling, ~2.5s interval.

**Access gate.** A practice duel (the async flow above, §5) must be
completed once before the live-queue button unlocks — so a player's first
opponent is never someone still learning which dial does what. Tracked on
the account so it's consistent everywhere they sign in:
```
POST /v1/me/practiced-duel                       -> {ok:true}
```
Idempotent; call it once and forget it. Add `livePracticed:boolean` to the
`/v1/me` payload. The client also keeps a local copy so the gate still works
offline, and reconciles toward the server's answer when signed in.

**Queue.**
```
POST   /v1/duels/queue              -> {queueId, rangeText}
GET    /v1/duels/queue/:id          -> {status:'waiting'|'matched'|'expired',
                                          canOfferBot:boolean, rangeText}
                                     -> {status:'matched', duelId, seed, startsAt,
                                          opponent:{handle, rating}}
DELETE /v1/duels/queue/:id          -> {ok}
POST   /v1/duels/queue/:id/bot      -> {duelId, seed, startsAt,
                                          opponent:{handle:'Practice Bot', bot:true}}
```
- One active queue entry per account — a second `POST` replaces the first
  rather than stacking. `GET` doubles as a heartbeat; an entry with no poll
  for 60s should be treated as abandoned and expired.
- **Matching, phase 1 (now):** first-come-first-served. The moment two
  entries are both waiting, pair them — no rating check yet. This is
  deliberately simple for a launch where volume is unknown; it never leaves
  someone waiting for a rating band that has no one in it.
- **Matching, phase 2 (once there's real volume):** rating-bucket matching
  that widens the longer someone waits — e.g. ±50 at 0s, ±150 at 15s, ±400
  at 30s, open at 45s. This needs a `duelRating` field on the account
  (separate from puzzle rating — they measure different skills): start
  everyone at 1000, standard Elo update, K≈32, and **only live duels update
  it** — practice duels and bot matches never touch it. Swapping phase 1 for
  phase 2 is a server-side change only; the client already renders whatever
  `rangeText` the server sends, so no client update is needed to switch.
- **The bot offer.** After 30–45s (randomised per search so waves of players
  don't all convert to bots at once) with no match, the client shows a choice
  — keep waiting, or play a labelled Practice Bot right now. Never invent a
  fake human opponent; a bot is always named and marked `bot:true`, and it
  never affects `duelRating` or the win/loss record. `canOfferBot` lets the
  server also *suggest* the offer (e.g. because the queue is provably empty
  right now) without forcing it — the client still lets the player choose.
- Rate limit: 5 queue joins/minute/account, to stop a bad client from
  hammering the pairing loop.

**The match itself.** Both players already run identical code from one
seed (`duelScene(seed, i)` in the client — nothing new needed there).
```
GET  /v1/duels/:id            -> {seed, startsAt, status:'pending'|'live'|'done',
                                    players:[{handle, bot}]}
POST /v1/duels/:id/result     {rows:[{e,c,t,cam}×5]}
                               -> {status:'waiting'}                     — you're first
                               -> {status:'done', opponent:{handle, rows}} — they'd already finished
```
`cam` per row is `{ap, sh, iso, f, fd, cx, cy, sx, cv, ck}` — the same shape
the client already uses to re-render a photo from settings (`duelRenderFrame`
in the client). Re-score every `rows[i]` server-side with the shared scoring
engine before trusting it for `duelRating` or any leaderboard — exactly the
same rule as §4, for the same reason.

If you submit first, the client polls `GET /v1/duels/:id` every 3s (capped
at ~20 tries) until the opponent's `rows` appear, then renders the same
head-to-head comparison as a code-based duel — average vs average, which
half of the score decided it, both photographs per scene. If the opponent
never finishes, the client shows an honest "still waiting" state rather than
spinning forever; a `startsAt` more than ~5 minutes in the past with no
`done` status is safe to consider abandoned and can be resolved as a
walkover for whoever did submit.

**Why "semi-live" rather than a fully live shared clock.** Two players
literally watching each other's camera move in real time needs a persistent
connection (WebSocket or SSE) and a lot more server state. Queueing live and
starting on a synchronised `startsAt` gets most of the feel — you know
someone real is on the other end of this specific minute — without that
infrastructure, and every endpoint above is plain request/response. If you
later want the fully live version (spectate their frame count down in real
time), the queue and matching logic here does not change — only the duel
session would move to a WebSocket, and `startsAt` becomes the moment the
socket starts pushing.
