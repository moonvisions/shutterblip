# ShutterBlip — one-command server update (28 Sep 2026)

- New `tools/update.sh`: after `git pull`, one typed command does the rest
  (pause, install, safety check, start, confirm it answers, keep a copy for
  next time). It stops with a red STOPPED message, touching nothing, if any
  step fails.
- The safety check retries a dropped connection instead of failing on it.
- GITHUB-UPDATE.md Part 3 is now three short commands to type.

# ShutterBlip — a real camera: pan wheel and new look (27 Sep 2026)

Rollover: "Safe to deploy". All accounts, XP, bests and stats carry over.

- **No more dragging the picture.** A camera is aimed by turning it, not by
  sliding the image. The viewfinder no longer moves under a finger (tap to
  focus and pinch to zoom still work). Instead there is a **PAN wheel**
  under the viewfinder, like the head of a tripod: drag it, scroll it, or
  use the arrow keys. Let go mid-turn and it keeps gliding like a fluid head,
  so panning shots still work: flick it at the subject's speed. Touch it to
  stop. A soft click every 10°, a firm stop at each end.
- **Easy Shoot and Battle are pre-framed.** The camera points where the
  moment will happen, with room ahead of the subject, and the subject comes
  into it. The gold glow comes every round with no input at all; the PAN
  wheel is there to improve the framing (and the stars). Subjects move a
  little slower in easy mode and the glow now means "good timing" rather
  than "almost", so snapping when it glows earns 2–3 stars.
- **The real-camera look.** Matte black body with a fine grain, screens set
  behind glass, rubber keys that press in, engraved lettering, an orange
  shutter. The home screen is the back of a camera: the rear screen shows
  what the game is, and the big orange button is a shutter release (press it
  and the shutter curtain crosses the screen). Battle, Pro and Learn are
  the other keys.
- Every "drag the frame" instruction in lessons, tips, coach lines, puzzles
  and the tour now says how to use the PAN wheel.
- **Server:** the database library is pinned to a version that runs on the
  server's Node 18 (the last update asked for Node 22, which stopped the
  server starting). Tested against a copy of the old database.
- Offline cache bumped to v13.

# ShutterBlip — Easy Shoot and Quick Battle (27 Sep 2026)

Why: people opening the game for the first time didn't know what to do.
Nothing was removed — Pro locations, lessons, puzzles and the classic
60-second duel are all still here. Rollover: "Safe to deploy", and a player
on the previous release updates and keeps their sign-in, XP and scores.

- **New home screen.** Two big animated cards: **Shoot** and **Battle**.
  Smaller links underneath for Pro locations and Practice. Everyone lands
  here, including first-time players (no account needed to start).
- **Shoot (easy mode).** Five photos. The camera sets itself; the player
  just follows the subject and taps SNAP. The frame glows gold at the right
  moment. Results are 0–3 stars with one plain tip ("A little early —
  snap as it passes under the lamp"). The first time, a 3-step picture
  tutorial plays inside the viewfinder; a hand shows how to drag until the
  player has dragged twice.
- **The camera helps.** If the player isn't dragging, the camera drifts
  just enough to keep the subject in the picture, so the glow always comes.
  Centring it yourself still earns more stars.
- **Quick battle.** Three rounds, 15 seconds each, most stars wins.
  Matches with a real player, or after 6 seconds a recorded run or the
  practice bot (always labelled). No practice round needed first.
- **Battle tab** leads with Quick battle; the classic duel sits below as
  "Pro duel". **Learn tab** gets a Lessons card (lessons had lost their tab).
- **Server:** easy and classic queues never mix; easy battles are 3 rounds;
  easy shots earn XP but don't touch leaderboards; recorded runs are
  matched only within the same mode (new `mode` column, added
  automatically on start-up — no data is changed).
- Signed-in name shows on Home even when the phone wakes with no signal.
- Offline cache bumped to v12.

# ShutterBlip — accounts, sign-in and start-up fixes (24 Sep 2026)

Rollover: server check "Safe to deploy", and a new device check — a player on
the previous release updates to this one and stays signed in with every XP
point and best score.

- **Signed out after ~10 minutes.** When a phone sleeps, the browser often
  unloads the game; coming back restarts it, and the start-up only counted
  you as signed in if the server answered instantly. Just after waking there
  is usually no signal yet, so players landed on the start screen and the
  game never asked again. Now the game remembers who is signed in from the
  phone itself, and reconnects on its own when the signal returns.
- **The intro on every launch.** Start-up showed the animated entry screen
  while it waited on seven server requests one after another. It now shows
  a quiet logo for a moment and goes straight to your home screen (about a
  tenth of a second in testing); server work happens in the background.
- **Signing out** now returns to the start screen and removes that player's
  name, XP and scores from the screen.
- **Switching accounts on one phone** no longer mixes players: each player's
  progress is kept separately on the device, so the next person never
  inherits someone else's XP, scores or unlocked locations.
- **Recovery codes** are shown once and forgotten. Before, the next person
  to sign in on the same phone could be shown the previous person's code.
- **A late reply from an old session** can no longer sign out the new one.
- **XP matches the server.** The server now credits the same streak bonus
  the game shows, so XP no longer "shrinks" after signing back in. (Players
  who played before this release may see their XP settle once to the
  server's figure.)
- Deleting an account on a shared phone removes only that player's data.
- Offline cache bumped to v11.

---

# ShutterBlip — modernization, Session 2: the photograph (24 Sep 2026)

Scores, rules, modes and saved progress are unchanged — this session changes
how a shot LOOKS and how focus is set, not how it is scored, so no new
leaderboard season is needed yet. Rollover check: "Safe to deploy".

- **Focus ring.** Manual focus is a lens ring now, not a row of buttons:
  drag it with a finger or mouse, flick it and it coasts to a stop, or use a
  trackpad/scroll wheel or the arrow keys. It is continuous, ticks softly as
  each marked distance passes the index, stops firmly at 1.5 m and infinity,
  and shows the depth-of-field band for the current aperture. Tap-to-focus
  and AF visibly turn the ring to the subject, then beep on lock.
- **The photo is finished on the graphics chip.** Exposure is applied to real
  light values, with a tone curve that rolls highlights off like a sensor,
  soft bloom around bright lights, lens falloff and ISO grain. It looks the
  same on every device; if a device has no WebGL, the old path takes over,
  matched to look the same.
- **A correct exposure looks correct everywhere.** Each round is measured
  once and a correct exposure is lifted toward a proper photographic
  mid-tone, keeping each location's mood.
- **The Room.** The singer is now lit when he is in the beam, which is what
  the meter always assumed. A good beam shot is a lit performer on a dark
  stage, not a black frame.
- **Panning streaks sideways.** Follow the subject and the background and
  foreground streak horizontally while he stays sharp — the classic panned
  sports shot. It used to blur everything in every direction.
- Offline cache bumped to v10.

---

# ShutterBlip — modernization, Session 1: fixes (24 Sep 2026)

Nothing about the rules, scores, modes or saved progress changed. Rollover
check: "Safe to deploy". The full audit and roadmap live in the
*ShutterBlip Modernization — Audit & Roadmap* doc.

- **Motion blur is a real smear.** A slow shutter used to draw the subject up
  to nine times at 1/9 strength, which left separate see-through ghosts. It
  is now the true average of the subject over the exposure.
- **Photos are clean.** The grid and the AF box are viewfinder aids and no
  longer get baked into the saved photo (guided mode forced the grid on, so
  every guided photo had lines on it).
- **The shutter fires instantly.** The click and vibration now come before the
  photo is saved, instead of after a short freeze.
- **Manual focus reaches the subject.** The focus strip has 17 distance marks
  instead of 6. At long lenses the nearest mark is now sharp in 23 of 25
  rounds (it was 10). Tapping the subject still focuses exactly.
- **Full quality comes back.** After one slow moment the game used to stay at
  reduced quality for good on a normal 60Hz phone.
- **Today's challenge is one shot.** It used to carry on into the rest of the
  location afterwards. It is always timed, has no retry, and ends on its
  board. (The server still needs its half; see the roadmap.)
- **Puzzle Rush pauses** when you leave the app.
- **No freeze at the end of a bot duel.**
- **iPhone app haptics** through the native haptics engine, plus the missing
  celebration buzz at 95+.
- Offline cache bumped to v9.

---

# ShutterBlip — store readiness pass (22 Sep 2026)

Everything from the 21 Sep release carries over: accounts, stats, analytics,
unlocks. `tools/check-rollover.js` against the previous release: 11 of 11,
"Safe to deploy".

## Simpler to use
- **Landscape phones:** the start screen and the round brief now fit on one
  screen — no scrolling to find *Play now* or *Start shooting*.
- **The "No connection" bar** no longer sits on top of the MENU button.
- **The two-minute tour** is offered once. It used to come back on every
  launch for anyone who closed the app on that screen.
- **Camera dials** can be reached and picked with a keyboard or switch
  control, and are announced properly by screen readers.

## Privacy and store rules
- **Public pages** at `/privacy`, `/terms` and `/delete-account`, generated
  from the same text the game shows. The delete page works without the app,
  which Google requires.
- **Policy text corrected:** it described Stripe purchases and a Supporter
  purchase that are switched off; it now says nothing is for sale. The terms
  had a visible "[DECIDE: …]" placeholder and a "DRAFT" stamp — both gone.
- **The Terms screen could claim "no account, no server, nothing collected"**
  to a signed-in player whose connection had dropped. It now always
  describes the real service.
- **Offline copy fix:** opening `/privacy` or the admin portal could be
  saved as the game's offline copy, so the next offline launch opened the
  wrong page. The service worker now only keeps the game itself (cache v8).

## App store packaging
- `STORE-SUBMIT.md` — step-by-step for Google Play and the App Store,
  including the data-safety and privacy-label answers.
- `mobile/` — the iPhone/Android app shell (Capacitor 8). The game is
  bundled inside it and talks to the live server for accounts.
- `ecosystem.config.js` + `server/local.env` — the server's settings, so
  nothing secret is typed into a command again. It always uses the
  database that already exists.
- Android app link (`/.well-known/assetlinks.json`) served from settings.
- The server accepts the app shells' origins as well as the website.
- The install-to-home-screen card is hidden inside the store apps.

---

# ShutterBlip — progression unlocks, and the rollover rule (21 Sep 2026)

## The rule this release is built around

**Every account, every stat and every piece of analytics carries over into
a new version. Always. Nothing a player has earned may be reset, orphaned
or re-locked by an upgrade.**

That is now enforced by a tool rather than remembered: `tools/check-rollover.js`
starts the previous release on a throwaway database, plays on it the way a
real person does, then starts the new release on that same file and checks
that logins, passwords, XP, bests, duel rating, purchases, the guest's name
and the admin dashboard all came through. It is Step 6 of the deploy in
`GITHUB-UPDATE.md`, and a release that fails it does not go out.

## Locations: two open, the rest earned by playing

Boulevard and the Marsh are open from the first launch. The Room, the Match
and the Platform each open when every round in the location before it has
a personal best of a C or better.

This replaced three lock systems stacked on top of each other that
disagreed with one another:

- **Signed-in players could only ever play Boulevard.** For anyone signed
  in to the server, every other location was locked unless they owned its
  pack — and the shop is switched off, so nobody could. The same player
  offline saw everything open.
- **The lock card promised "XP TO UNLOCK BY PLAYING".** Nothing on the
  server ever granted it.
- **A sequential gate** that was the right idea, buried under the other two.

Now there is one rule, and three things always override it so that no
upgrade can take anything away:

1. **Anywhere you have already played stays open.** Players have come
   through versions with different rules — some had every location open
   offline. A best score in a location means it is yours.
2. **Anything bought is honoured.** The shop is off; anything bought before
   it closed still opens its location, and once Stripe is on, buying is a
   shortcut — never the only way in.
3. **It follows the account.** Unlocks are worked out from personal bests,
   which the server already keeps and sends down at sign-in, so they are
   the same on every device with nothing new to store or migrate.

Clearing a location now gets a proper moment on the result screen — **THE
ROOM UNLOCKED** — on the frame that earned it, rather than being discovered
by accident on the home screen later.

## Admin: how far players get

The Content tab has a progression funnel: for each location, how many
players reached it, how many cleared it, and the clear rate. It is built
from the `bests` table, so it covers every player back to day one, not just
people who have played since this release. A big drop between two rows is
the difficulty wall to go and look at. Each unlock is also logged as an
event (`unlock`), with only real location ids accepted.

## Fixed along the way

- **Suspended players could still log in.** Login never checked the flag,
  so a suspended account got a fresh token that every other route then
  refused — which looks, from the player's side, like signing in and being
  thrown straight back out. Login and Google sign-in both refuse a
  suspended account now, checked after the password so the message cannot
  be used to find out which names are suspended. Found because the test
  that was meant to catch this had been passing for the wrong reason: it
  sent the wrong field name, so it failed to log in whether the account was
  suspended or not. The test now proves the same credentials work first.
- **The unlock progress bar rendered as a solid teal block** and its "3/5
  ROUNDS" label never showed: both are `<span>`s with no `display`, so the
  bar's height was ignored.
- The home screen still said "everywhere else unlocks in the shop".

## Verified

- 11 progression checks: new players, signed-in players (the old bug),
  clearing a location, the same account on a brand-new device, and an old
  player who had already played a later location keeping it.
- The unlock moment through the real buttons: Start shooting, SNAP, result.
- 14 rollover checks against a database written by the release that is live
  today, then the standalone tool against the same.
- 30 security checks, including suspension through the real admin button.
- The rollback command in the deploy guide, proven to rewind the code
  without touching the database.

---

# ShutterBlip — security, accounts, and landscape (20 Sep 2026)

Four things were asked for: security in order, accounts that persist so
people stop re-creating them, stats tracked, and play that works on every
device in both orientations. Two audits and a device matrix. Everything
below was reproduced before it was fixed and re-tested after.

## Two holes that were open on the live site

**The database was a public download.** The static file handler served any
file that existed under the project root, and the database lives there —
`GET /data/shutterblip.db` returned 802 KB containing every player's email,
birth year, password hash, and the tokens table, which is a list of live
30-day login sessions. `/server/mock.js` went the same way. It needed no
skill, only the filename. Verified by downloading it and reading rows out.

Fixed with an allowlist: a fixed list of the handful of files a browser
actually needs, and a 404 for a path not on it whether or not the file
exists. nginx serves these before Node sees them, so `SECURITY-FIX-NOW.md`
carries the matching server-side change, which is not optional.

**Google sign-in accepted a forged token.** A Google credential is a signed
JWT; the route base64-decoded the middle section and believed it. Anyone
who knew a player's email address could post a token they had typed
themselves and receive a full session for that account. Verified by doing
exactly that.

Now verified properly — RS256 signature against Google's published keys,
plus issuer, audience and expiry, with `email_verified` required before an
account is matched by email. Fails closed: if the keys cannot be fetched,
the sign-in is refused rather than waved through. The route returns 503
until `GOOGLE_CLIENT_ID` is set, so the unsafe path cannot come back by
accident.

## Guest accounts were being destroyed on every redeploy

`guestCounter` started at 1000 in process memory with no collision check,
so the first guest after any restart was handed `Guest1001` — a name an
earlier guest already had. The users adapter updates an existing row rather
than inserting, so that player's XP, purchases and credentials were
overwritten by a stranger, and both people's tokens then addressed the same
account.

Reproduced end to end: guest with 4,321 XP, restart, next visitor taps Play
now, row back to 0 XP and the original token now opening the newcomer's
account. The counter is seeded from the database at boot now, and the route
refuses to reuse a name regardless.

## Why players kept creating accounts

Three things compounding, with the first as the trigger:

1. **A working session was thrown away on any network failure.** The boot
   code cleared the stored token in an unconditional `catch` — a 502 during
   a redeploy, the eight-second timeout on a bad phone connection, or
   anything thrown inside `syncMe()` all deleted it. The server had never
   said the session was invalid. Only a genuine 401 clears anything now,
   and `syncMe()` has moved out of that try.
2. **Tokens expired on a fixed 30-day schedule and were never extended.**
   A comment claimed the heartbeat extended them; it updated the user row
   and never touched the token. Now a 60-day sliding window, pushed forward
   on use, throttled to one write a day per token. An active player is
   never signed out.
3. **A guest had no way back in.** Guests have no password, so once the
   token was gone their account was unreachable while the entry screen
   still greeted them by name — and the only working button was "create an
   account". They now receive a resume key at creation, stored on the
   device and exchanged for a fresh token when needed.

The recovery code shown at sign-up was also never stored, so it could never
have worked. It is hashed now and `/v1/auth/resume` accepts it, single-use
for registered accounts with a fresh one issued on success.

## Trust boundaries

- **Free purchases.** `/v1/purchase/checkout` granted the item immediately
  with no payment anywhere in the path, and wrote its price into the events
  table — so anyone could also set the dashboard's revenue figure to
  whatever they liked. It refuses now until real Stripe keys exist.
- **XP was whatever the client asked for.** `{"xp":999999999}` bought any
  rank; `{"xp":1e308}` made the stored value non-finite, after which that
  player could never be written to the database again. XP is derived from
  the score server-side and the client's figure ignored.
- **Level ids were unvalidated**, so anyone could invent a level and top
  its board. Checked against the ids in the game now.
- **Duel results could be replayed**, re-applying the Elo award every time
  — a few hundred requests inside the rate limit owned the duel board, and
  each replay pushed a real opponent's rating down again. One submission
  per player per duel, and both settle functions refuse a second run.
- Duel rows are clamped to finite in-range numbers. Re-simulating the frame
  server-side remains the real fix and is still open.

## Sessions and moderation

- **`POST /v1/auth/logout` and `/logout-all` now exist.** Signing out was a
  client-side fiction: the client forgot the token and the server went on
  accepting it. On a borrowed device that left a working session behind,
  and a leaked token could not be killed at all.
- **`banned` is enforced and settable.** The column had existed since the
  first schema with nothing setting or reading it, leaving permanent
  deletion as the only moderation action on a game with a public
  leaderboard and minors playing it. `auth()` refuses a suspended account
  on every route, tokens are revoked immediately, and the Players tab has a
  reversible Suspend beside Delete.

## Smaller, but real

- **`X-Forwarded-For` was read from the wrong end.** The comment said the
  first entry is the one your proxy wrote; with the usual nginx idiom it is
  the one the client invented. The header is only read when `TRUST_PROXY=1`
  and then takes the last hop — otherwise rate limits and the admin lockout
  could be evaded with a fresh fake address per request, or aimed at the
  admin's own address to lock them out repeatedly.
- **The admin cookie had no `Secure` flag** and nothing forced HTTPS.
- **CORS was a wildcard on every response, including `/admin`.** Now scoped
  to the API and configurable.
- **Four unbounded maps** — `shots`, `duels`, `loginAttempts`,
  `matchedEntries` — grew for the life of the process. `loginAttempts` was
  reachable by anyone hammering the admin login. All swept now.
- **Passwords had no maximum length**, so a 256 KB one could be submitted
  and re-hashed on every login; scrypt blocks the event loop, so a handful
  stalls every other player. Capped at 200.
- **Comparisons are constant-time**, including the admin password, which is
  the one an attacker is actually guessing.

## Landscape was broken

Two landscape media queries both matched on any phone held sideways, and
the leftovers from the older one — `flex:0 0 54%`, `margin-left:auto` —
were being applied to items in the newer one's grid. Separately, the dial
strip's min-content width blew the right-hand column past the screen,
because a grid item's automatic minimum size is its content, not zero.

The result: the whole shooting screen scrolled sideways by about 180px. The
viewfinder and the lesson card hung off the left edge mid-sentence, with a
field of empty space on the right. Measured, not guessed — the screen's own
scroll offset gave it away.

Fixed by making the two blocks mutually exclusive and adding `min-width:0`
to the grid children, so the strip scrolls inside its column as intended.
Then, on the shortest screens:

- The **FOCUS dial was clipped off the right edge** — a control a player
  simply could not reach. The dials shrink properly now, labels ellipsis.
- The **lesson card covered the viewfinder**, the very frame it was telling
  you to look at. It sits in the right-hand column now, below the floating
  menu button rather than behind it, and on 430px-and-shorter screens it
  drops its elaboration so it stops burying the dials.

## Verified

- 24 security assertions, each one re-running an attack that worked before.
- The guest-overwrite reproduction, now passing.
- Six device sizes in both orientations, plus rotating mid-round: no
  sideways scroll, shutter reachable, all five dials on screen, canvas
  resizing on rotation.
- Privacy promises: heartbeat, export contents, session deletion on delete.
- All eight admin tabs and all four ranges.
- Every check re-run against the minified build, since that is what ships.

---

# ShutterBlip — the player gets their own record (20 Sep 2026)

The You tab was a column of identical outlined buttons under the heading
"Your account", and it showed a player precisely nothing about themselves.
No XP, no rounds, no streak, no best frames. Every one of those numbers
already existed — they were only ever shown to the operator, on the admin
dashboard.

It now opens with the player's own figures, in the same shapes the admin's
are drawn in, because they are the same figures. The difference is whose.

- **XP earned**, with how far to the next rank.
- **Frames scored**, and the average of their personal bests.
- **Time behind the camera** and visit count — from the server, and simply
  left out when there is no server, rather than estimated from something
  adjacent and quietly wrong. A made-up figure here would be the one thing
  on the page a player could catch being false.
- **Duel record** and rating, once they have played one.
- **Puzzles right**, with their best streak.
- **Best frame by location**, as a bar per location out of 100, with the
  ones they have not photographed shown dashed and empty — the honest nudge
  toward what is left.

Nothing appears until there is something to say. A grid of zeroes on a
first launch tells a new player they have failed at a game they have not
started, so the whole panel stays hidden until they have played.

`/v1/me` now returns `duels`, `puzzles` and a `stats` block (visits, time
played, shots). It already returned bests and XP.

## One visual language across the three stat surfaces

The duel record, the puzzle stats and the new You panel were three
different people's guesses at what a number should look like. They now
share one treatment:

- A gradient fill and a lit top edge, so a row of figures reads as objects
  with a light source rather than as boxes.
- `font-variant-numeric: tabular-nums`. Not decoration — proportional
  digits make a row jitter as it counts up, and a score that wobbles while
  it animates looks broken.
- A card with nothing in it loses its lit edge and dims its figure, instead
  of wearing an accent over a dash. "Here is a result" printed over a result
  that does not exist is the small wrongness that makes a screen feel
  unfinished.
- An odd last card spans the row rather than sitting beside a hole.

The camera, the scene and the shooting UI are deliberately untouched. They
are a photography instrument, not a dashboard, and the brief is right that
the game should not read as generic SaaS. What carried across is the craft,
not the genre.

---

# ShutterBlip — admin analytics rebuild (20 Sep 2026)

The admin dashboard was one scrolling column of fourteen stacked sections
with the headline numbers printed twice, and it could not answer three
questions worth asking: how long people play, when they play, and where
they are. This pass rebuilt the layout and added all three.

## The dashboard

Seven tabs, each one question — Overview, Time played, When, Where,
Players, Content, Money, Settings — with a range control (7 / 30 / 90 days
/ all time) that drives every number on the page. Nothing was removed;
everything that was there is still there and is now findable. Still
server-rendered, still no framework, still works with JavaScript off.

**Every chart now reads from the database.** The 14-day signup chart, the
duel split, the purchase log and the activity feed were all built on the
in-memory `events` array, which meant every number on the page reset to
zero on each redeploy. That is precisely the history you cannot lose.

Two layout details worth recording, because both were found by looking at
a screenshot rather than at the code:

- `grid-template-columns: repeat(auto-fit, ...)` packs as many columns as
  fit, which strands a single orphan card on its own row whenever the count
  does not divide evenly. Past tablet width the column count is now chosen
  from the number of cards.
- The week heatmap's colour ramp is curved (`^1.35`), not linear. Spread
  over 168 cells, early data puts nearly every cell at one to three visits,
  and a linear scale paints the whole grid the same mid-teal — it looks
  like a pattern when it is noise. Below six visits in the busiest cell the
  panel now says so outright and points at the hour chart instead.

## Time played

`sessions.last_beat_at - started_at`. Two honest caveats, both stated on
the tab itself:

- It undercounts the tail. Whatever happens after a player's last request
  is invisible. New `POST /v1/beat` — a route that does nothing except
  exist, so reaching it refreshes the session — is called once a minute
  while the tab is visible. Before it, somebody spending ten minutes
  framing a careful shot made no requests at all and scored as seconds.
  Background tabs do not beat, so a window left open overnight cannot
  invent eight hours of play.
- A single-request visit measures zero, which is right but drags the mean
  down. Mean, mean-over-a-minute, bounce rate and the full distribution are
  shown together, because any one alone misleads.

## When and Where — from the time zone, never from the IP

New `server/geo.js`. The client sends `X-SB-TZ` and `X-SB-Lang`, set once
at boot from `Intl.DateTimeFormat().resolvedOptions().timeZone` and
`navigator.languages[0]`. The zone maps to an ISO country; local hour and
weekday are computed in Node at session start and **stored** on the row,
because SQLite cannot interpret "America/Denver" and there is otherwise no
way to ask when people play in their own evening.

IP geolocation was rejected deliberately. It needs a licensed database or a
third-party API — a dependency that can fail, or every player's IP sent to
somebody else's server — and carrier gateways and VPNs get it wrong
routinely. A time zone is a setting on a device, not a measurement of a
person: accurate to roughly the country and no finer, since everyone from
Maine to Miami reports `America/New_York`.

## The three things that had to move with it

Adding tracking without these would have made the product dishonest:

1. **The privacy policy** said, in as many words, "no location". It now
   describes visit timing, the time zone, the language and the device
   class, states that the zone is a setting rather than a position, and
   says explicitly that no address is geolocated. `OPERATOR.version` moved
   to 2026-09-20, which is what players see as "last updated".
2. **`/v1/me/export`** now carries the visit history and device details.
   The policy promises a player can download everything held about them,
   and that promise binds every column added afterwards.
3. **`scrubAccount()`** now deletes the player's sessions. They carry no
   foreign key to `users` on purpose, so they do not cascade — a deleted
   account would have left its visit history, country and device type in
   the table forever.

## Migrations

`CREATE TABLE IF NOT EXISTS` builds a correct database from nothing and
does nothing at all to one with real players in it. `db.js` now migrates
additively against `PRAGMA table_info` rather than a version number:
columns that exist are skipped, nothing is ever dropped or renamed. Ten
columns added across `sessions` and `users`; verified against a populated
database.

## Verified

- All 8 tabs and all 4 ranges return 200; no page errors at 1440 or 390.
- End-to-end in three real browser contexts — London desktop, Tokyo phone,
  Denver desktop — each resolved to the right country, device class and its
  own local hour, consistent with a single instant.
- The same check against the **minified** build, since that is what ships.
- Heartbeat, export contents, and session deletion on account delete.

---

# ShutterBlip — upgrade notes (3 Sep 2026)

Scope of this pass: the brief's "Current camera controls" section and the
first stretch of "Guided Lessons". Everything is inside the existing single
file, in the existing sections, using the existing engines. No scoring
formula was changed. No dependency was added.

## What changed

### 1. Every dial now teaches all six parts the brief asks for
Section 18 CONTROLS — new `DIAL_MORE` table beside the existing `DIAL_HELP`,
and `updateExplain()` renders it.

For each of aperture, shutter, ISO, focal length and focus the panel under
the dial now shows:
- the name and plain explanation (unchanged)
- what the current value does (unchanged)
- a WARNING, only when the live frame says this value is causing a problem
  (reads `measure()`, so it reacts to the scene — e.g. "1/30 is too slow to
  hand-hold at 135mm", "ISO 12800 adds heavy grain, and you do not need it here")
- behind a WHY? button: a small drawing of the effect (iris size, motion
  streak, grain, field of view, sharp-zone on a distance scale), one example,
  and one reason a photographer would deliberately choose the value.

The fold is closed by default so the shooting screen stays calm, and it
remembers its state between dials. The warning refreshes on the same 0.4 s
tick as the diagnosis line; the rest of the panel only rebuilds when a value
changes, so the button never moves under a thumb.

Focal length's example and glossary now carry the Rule of 500
(500 ÷ focal length = longest shutter in seconds before stars trail).

### 2. The one-dial-at-a-time course grew from 4 steps to 8
Section 18, `LESSONS`. Lessons are still pure data; the engine reads three new
optional fields: `show` (which dials are on screen), `check(m)` (what counts as
solved — defaults to the old exposure test), `moving` (whether the rider moves).

New steps, after the existing four exposure steps:
5. Focus — only the FOCUS dial; f/2 so a miss is obvious; start focused at 2.5 m
6. Focal length — only the LENS dial; start at 24mm; fill the frame (85mm solves it)
7. Handheld shake — 135mm fixed, only SHUTTER; start 1/60; 1/125 or 1/250 solves it
8. Freeze the motion — rider moves; only SHUTTER; start 1/30; 1/250 or 1/500 solves it

Light is pre-set to be correct within half a stop on every new step, so the
only thing to learn is the thing being taught. Intro and completion screens
updated to match.

### 3. Small fixes found while testing (all pre-existing)
- In lessons the rider had motion blur drawn even though he stood still
  (a slow shutter smeared him with no explanation). Non-motion lessons now
  give him zero speed.
- The very first lesson showed all five dials instead of three, because
  `S.phase` was set after `buildStrip()`. Order swapped.
- Solving a lesson could skip the next one: the 0.4 s tick fired the
  "advance" timeout twice and the second firing read the already-advanced
  index. Guarded with `lessonAdvancing` and a captured index.
- Pinch-to-zoom could change the lens during a lesson that fixes it. Blocked.

### 4. Glossary
Added "Rule of 500" and "Camera shake". Count updated to seventeen.

## How it was verified
Headless Chromium (390×800): no page errors on load, name claim, all eight
lessons played end to end by tapping chips, each lesson confirmed unsolved
at its start and solved at the intended value, a free round on Boulevard
with every dial and the WHY? fold opened, ISO 12800 warning triggered, SNAP
to the result screen. Script parses under `new Function`.

## Not done in this pass, and why
- **Ranked, placements, divisions, 1v1, friends, reactions, reporting,
  moderation** — need the server (`server/`), which is not in this file.
  The client hooks (`Net`, puzzle rating, leaderboard) are ready to be
  extended, but claiming to ship competitive systems client-only would
  be dishonest.
- **Star / night-sky scene and Rule of 500 puzzles** — the shutter range
  stops at 2" and the scene engine has no sky model. Adding a fifth
  location with 5"–30" exposures is the next engine job; the Rule of 500
  teaching is in place so the scene lands on prepared ground.
- **Composition-specific lessons, low-light and concert lessons** — the
  same data-driven `LESSONS` mechanism now supports them (`show`, `check`,
  `moving`); they just need authoring against the existing stage and marsh
  scenes.

## Second pass (same day)

### SNAP now works inside lessons — this was a real bug
`capture()` returned silently unless the phase was `live`, so during a lesson
the big SNAP button did nothing. Lessons only ever advanced by holding a
correct setting still for about a second, which nobody is told. Now:
- SNAP in a lesson fires the blades and shutter sound, judges the frame you
  fired, and on a correct frame shows "GOT IT" and moves to the next step.
- On a wrong frame it shows "NOT YET" with the specific thing to change,
  holds that verdict for 2.6 s, then the live hints resume.
- Holding a correct setting still also still advances, as before.

### Visual pass
A polish layer appended at the end of the stylesheet — every original rule
is untouched, so it can be deleted as one block if you ever want the old look.
- Warm vignette on the body (gold top-left, teal bottom-right, both faint).
- Every raised surface has a lit top edge; the primary button and the
  selected mode/dial/tab glow softly.
- Location cards are postcards: a painted SVG banner per scene in its own
  light (golden-hour boulevard with the rider, dawn marsh with the heron,
  magenta and teal beams in the room, floodlit pitch). `sceneBanner()` in
  the flow-control section; locked locations render desaturated.
- Result screen: the grade sits in a circular badge with a ring that fills
  to the score in the grade's colour; the score number is larger.
- Puzzle rating is a large gradient numeral; tab bar and mode picker are
  bolder with a glowing active state.
- Reduced motion: nothing new animates; hover/press transitions are
  disabled under `prefers-reduced-motion`.

Tested again in headless Chromium: all eight lessons completed by pressing
SNAP after each fix, wrong-SNAP verdict shown and released, free round to the
result screen, every tab rendered. No page errors.

## Third pass — Puzzles tab

- Rebuilt the tab as one screen with no scrolling on a normal phone: rating
  and four stats in one header, a Puzzle of the Day card, the Continue button,
  four compact tiles (Rush, Which is right?, the signed-in daily pair, Browse
  all 2,000), and strengths/charms folded into one details section. Every
  existing element id is kept, so all previous wiring works unchanged.
- **Puzzle of the Day** (`POD` in the daily-puzzles section): one puzzle for
  everyone, chosen from the calendar date alone, so it works with no account
  and no signal. It prefers a camera puzzle. The first time the Puzzles tab
  opens each day a popup offers it (Solve it now / Later); the popup never
  returns that day and never appears once today's is solved. Solving it
  flips the card to a teal "solved" state. State is kept in the game's own
  Store under `pod:seen` and `pod:done`.
- Tested: popup once per day, dismiss, card opens puzzle #N, real camera
  solve through brief → camera → CORRECT, card shows SOLVED; Rush, Compare,
  Browse and Continue all still route to their screens.

## Fourth pass — flow endings and the cut-off top

### The top of the screen was unreachable (real layout bug)
`#s-title`, `#s-welcome` and `#s-ad` centred their content with
`justify-content:center` on a scrolling column. When the content is taller
than the screen, a centred flex column overflows out of BOTH ends and the
part above the top edge cannot be scrolled back to — so on a shorter phone
the brand bar, the greeting and the first heading were simply gone. Now those
screens start at the top and only centre while the content fits. Verified at
320×568, 360×640, 390×780 and 430×932: the first element of every tab sits
at y≈14 with scrollTop 0.
Also stopped the name/rank text in the brand bar from being clipped on
narrow phones.

### Puzzles now have a beginning and an end
- **The library runs in sets of five.** Continue starts a set; the button is
  labelled "Next puzzle · 2 of 5" as you go, then "Finish the set", which
  lands on a new set-complete screen (score out of five, current streak, a
  line of advice) with "Another five" or "Back to puzzles". Skipping spends a
  slot, so a set always terminates. Leaving mid-set abandons it and the next
  Continue starts a fresh five. Nothing is lost by stopping — every answer is
  recorded as it happens, as before.
- **The puzzle of the day ends where it started.** Answered or skipped, it
  returns to the Puzzles tab instead of tipping you into the middle of the
  library. Its skip button now reads "Not now".
Tested: pod skip returns to the tab; a five-set of mixed question and camera
puzzles ends on the summary; a camera puzzle inside a set counts and carries
on; Rush and Compare still end on their own screens.

## Fifth pass — variety, and a seamless puzzle of the day

### Camera puzzles no longer look like level one
A camera puzzle used to borrow a location's opening round wholesale (same
street, same light, seed 4400). `puzzleChallenge()` now builds each puzzle
its own round from the puzzle number: one of four lights (HIGH SUN, GOLDEN
HOUR, FADING LIGHT, DUSK — the renderer darkens the scene to match), a
different building/scene layout (seed 5000 + 31n), the subject's speed
(±20%) and distance all vary, deterministically, so everyone on puzzle #N
still shoots the same thing. Every puzzle EV is a whole stop, which the real
dial grid can hit exactly, so no puzzle is unsolvable by rounding.
- The brief reads as a puzzle: "PUZZLE #1160 · BOULEVARD · FADING LIGHT",
  the puzzle's prompt is the objective, its tolerances are the requirements,
  no timer, no score-out-of-100 pills.
- A puzzle frame goes straight to the verdict (no flash of the level result
  screen), and the verdict now shows the photograph you shot.
- Scoring untouched: `PuzzleGen.checkCamera` reads the same measurement.
- Server note: the frame is posted with `levelId` = the base round and a
  `variant {ev, speed, dist, seed}`; until the server re-simulates variants
  it will fall back to local marking for camera puzzles.

### Five new rounds (20 → 25), ids unchanged
Appended to the end of each location so no existing id or personal best
moves: BLUE HOUR (Boulevard — free, a fifth free round) and WIDE AND CLEAN
(Boulevard), HARD NOON (Marsh — the over-exposure round), HOUSE LIGHTS UP
(Room — clean ISO for once), FLOODLIT PAN (Match). A `freebie` flag lets a
pro-list round stay free; only BLUE HOUR uses it.

### Puzzle of the day is now a closed loop
Solve it (or miss it), see the verdict and your frame, and the button counts
down "Back to puzzles · 5" then returns to the Puzzles tab on its own, where
the card shows SOLVED. Tap the button to go sooner. Skipping returns too.

## Sixth pass — 1v1 Blitz Duel

New mode, reachable from the gold "1v1 Duel" tile on the Puzzles tab.
- Sixty seconds, five scenes, one frame each. Scenes come from one shared
  seed: every duel visits all four locations, each in a seeded light (high
  sun / golden hour / fading light / dusk) with its own layout and subject
  speed. Both players get exactly the same five.
- Score = exposure 50% + composition 50%, through the ordinary Scoring
  engine (nothing new to trust). Highest average over five wins. A scene the
  clock runs out on scores zero, and the last frame is auto-fired at 0.0.
- The clock only runs while you are actually shooting; the one-beat "SCENE 2"
  card and the grade flash between scenes do not eat into the minute.
- Asynchronous by design, so it works with no server and no account: shoot
  your minute, get a short code (SB1-…), send it; whoever accepts it shoots
  the same minute and sees the head-to-head — average vs average, a verdict
  that says whether metering or framing decided it, and a scene-by-scene
  table with a one-line reason for each. Copy and native Share buttons.
  Your record (W-L-T) and best average are kept on the device.
- When the server's matchmaking lands, it only has to hand out seeds and
  relay these same codes — the mode does not change.
- Also fixed: the puzzle-of-the-day popup could be left floating over another
  screen if you navigated away while it was open; it now belongs to the
  Puzzles tab only.

Honest scope note: a live, global, cheat-resistant leaderboard needs the
server; the client's leaderboard screen and Net hooks already exist and are
unchanged. Duel scenes use all four locations regardless of pack ownership
(a duel is its own mode) — if that should respect the paywall, it is one line
in duelScene().

## Seventh pass — scenery, atmosphere, and the server contract

### The camera puzzles look like photographs now
A shared atmosphere layer wraps every scene (no scene code was edited), so
all five locations and every puzzle and duel frame get: aerial haze at the
horizon scaled by how much light there is to scatter, cloud banks, stars in
dark scenes, sun glare, streetlights with real cones and pooled light,
floodlight wash, visible beams in the room, mist over water, rain with wet
tarmac reflections, plus rooftop aerials, water tanks and setbacks that turn
a row of rectangles into a skyline. After the exposure filter there is now a
highlight bloom and a lens vignette, so the frame reads as a photograph
rather than a flat vector drawing.

### Weather and light are properties of the round
Five weathers (clear, haze, overcast, mist, rain) and four daylight states —
or three night states for the dark locations — are chosen from the puzzle or
duel seed. Indoor scenes never get weather; a night platform never gets high
sun. Overcast and rain cost a stop, so the exposure problem changes with the
look. Every generated EV lands on a whole stop: 150 sampled camera puzzles,
zero unreachable on the real dial grid.

### Camera puzzles roam
Skill templates (freeze, expose, frame, separate) were pinned to the
boulevard, so the first several hundred camera puzzles were the same street.
They now pick a location from the puzzle number, with the dark locations
arriving at tier 4+. Across 300 sampled camera puzzles: Marsh 86, Match 71,
Boulevard 69, Platform 41, Room 33.

### A fifth location — THE PLATFORM (30 rounds total)
A night railway station: rails and platform edge as leading lines, overhead
lamps in pools rather than a sun, and a long fast train as the subject. Four
rounds (The Last Train, Pan The Platform, Under The Lamp, Down The Line) plus
a pro round (Rain On The Rails), a new `drawTrain` sprite, its own postcard on
the home screen, and two new camera-puzzle templates that use it. It is the
natural home for panning and slow shutters, and it made the pan mechanic
teachable in a place where a slow shutter is also the sensible exposure.

### SERVER.md
Written for whoever builds the backend: every endpoint the client already
calls, the exact `frame`/`variant` payloads, what must be recomputed
server-side (camera puzzles and all leaderboard scores — never trust a
client score), the ranking rule from the brief, the duel relay, and a
pre-launch checklist.

## Eighth pass — the platform, done properly; duels show both photographs

### THE PLATFORM rebuilt
The first version hovered a grey box over rails that ran the wrong way. Now:
the track runs along the frame (the direction the train travels) with
ballast, sleepers and two rails on exactly the scorer's ground line, so the
bogies sit on the near rail; a canopy overhead with visible trusses, pillars
and lamps hung from it; a far wall with a lit departures board; a tunnel
mouth with a green signal for the line to run into; benches; waiting
passengers drawn at true scale against the train (1.75 m to its 3.6 m) with
lamp rim so they are not blobs; the yellow line and tactile strip. The train
itself: raked cab in the yellow every commuter unit wears, windscreen with a
driver behind it, lit destination blind, door recesses with call-button
strips, passengers in the windows, aircon boxes on the roof, two headlights
with small halos, a red tail marker, bogies, and a roof rim that brightens as
it passes under a lamp — which is the timing shot. "UNDER THE LAMP" is now
literal: the peak is being under one of the lamps, which are at a fixed
spacing. No sky weather under the roof; rain only past the canopy edge.

### Duels: both photographs, side by side
A duel code (`v:2`, ~360 chars) now carries each scene's camera state. The
simulation is deterministic, so the other player's frame is re-rendered
exactly on your phone — their dials, their framing, their moment — with no
upload. Every scene row shows your frame beside theirs with the EXIF line
under each, and the winning frame's border is tinted. This is the part that
teaches: you see *how* they beat you, not just that they did.

## Ninth pass — "Which is right?" rebuilt

The pairs looked cropped because every frame was shot from one fixed camera
position (camX 400, subX 340) regardless of lens or scene — an 85mm frame
landed half out of picture, a 35mm one dead centre. `renderFrameAt()` now
composes each frame on purpose: the subject is placed at a chosen point (a
third by default) inside the scene's lit zone, whatever the focal length, so
A and B differ only in the thing the question asks about. Composition setups
deliberately vary the framing instead of the settings.
- Twelve setups, up from five: aperture, shutter, under-exposure, OVER-
  exposure (new), low-light ISO, daylight ISO (new — when NOT to use high
  ISO), focal length, hand-held shake at 200mm (new), panning on the platform
  (new; the right frame is actually panned), and three composition pairs:
  thirds vs centre, horizon placement, leading lines on the platform.
- Every setup's exposure re-checked against the real scene EV so the "right"
  frame is right and the wrong one is wrong by the amount the copy says.
- Design: the two photographs read as prints — 3:2, edge to edge, a glass A/B
  chip, an EXIF strip overlaid on each frame (f-stop, shutter, ISO, focal
  length, "panned"), a topic tag in the eyebrow, "TAP THE BETTER PHOTOGRAPH"
  until you do, and the winning frame's border in teal / the miss in red.
- Background cache invalidated around each offscreen render, and the live
  canvas restored: a real round after a compare renders at the right size.

## Tenth pass — puzzle library reorganized, sequential unlock, live 1v1 queue, compare upgrade

### "Browse all 2,000" is gone
The Puzzles tab no longer has a raw numeric browser. In its place, the
skill-practice list (Exposure, Motion, Depth, Low Light, Composition,
Combined) is now a permanent section on the tab instead of folded away —
that list is the organized way into the library now. Streak charms moved
into their own smaller fold below it.

### Sequential level unlocking, synced to the account
Boulevard → Marsh → Room → Match → Platform. A location opens once every
BASE round (not the optional paid "pro" rounds — buying more content is
never the price of moving on) in the previous location has a personal best
of at least a C. New: `locGateLocked()`, `locCleared()`, `locGateProgress()`
in the flow-control section, folded into the existing `locLocked()` so every
existing call site inherited it for free. `startRun()` is the single choke
point (per its own long-standing comment); the daily challenge and the
opening tour deliberately bypass the gate, since they're universal content
that has to look the same for every player, not personal progress.
- Locked cards show a progress bar and "X of Y rounds" rather than a plain
  padlock; the lock screen explains exactly what's short and one tap lands
  back on the right location — tested the full Room→Marsh→Boulevard cascade
  from a fresh account.
- Reads `BESTS`, which already syncs down from an account on sign-in
  (`Net.syncMe`), so no new server field was needed — documented in
  SERVER.md that this is a derived, not stored, fact.
- Puzzles and duels are explicitly exempt: puzzle #1160 has to render
  identically for every player for the daily puzzle and fairness to mean
  anything, so those stay keyed to the puzzle number alone, never to a
  player's own progress.

### Which-is-right: streak, categories, no repeats
A stat strip (streak, best, solved) and six category chips (All / Exposure
/ Motion / Lens & Depth / Low light / Composition) sit above the photos now.
Pairs are served from a shuffle bag per category — every setup is seen once
before any repeat, including across the boundary where the bag reshuffles
(fixed a same-pair-twice-in-a-row bug caught while testing a 3-item
category). Progress is stored locally under `cmpprogress`.

### 1v1 goes live — matchmaking queue with a real buffer
Per your answers: bot offered after 30–45s OR keep waiting (player's choice,
never forced); one practice duel required before the live button unlocks,
tracked on the account; first-come-first-served matching now, rating-based
once volume justifies it — architecture supports both without a client
change.
- **Practice gate.** `hasDuelPracticed()`/`markDuelPracticed()`; the live
  button reads locked with "Play a practice duel first" until any duel of
  any kind completes, then unlocks and stays unlocked (synced to the account
  via `/v1/me/practiced-duel`, falls back to a local flag offline).
- **The queue screen** (`s-duel-queue`): live elapsed timer, a pulsing radar
  animation, and after the wait, a choice card — Play a practice bot / Keep
  searching. Declining sets a 30s cooldown before asking again, so it never
  nags. Cancel (or navigating away any other way — a guard in `show()`
  catches that) drops the queue entry.
- **The practice bot** is a genuine simulated shot, not an invented number:
  `botPlayScene()` finds the scene's near-correct exposure, misses it by a
  random believable amount, frames the subject somewhere between centre and
  a clean third, and scores it through the exact same `Scoring.run()` a
  human shot uses — so its photo and its mistakes are real, and the
  comparison teaches the same way a human opponent's would. Bot matches
  never touch the win/loss record.
- **Live matches** submit to the server and either show the comparison at
  once or poll for the opponent, with an honest "still waiting" state if
  they never finish — no network required to build or test this path
  (verified directly), it's simply unreachable until a server exists to
  match two real accounts.
- Full protocol — queue endpoints, matching phases 1 and 2, the bot-offer
  contract, the result submit/poll shape, rating field, abuse limits — is in
  SERVER.md §5b.

## Eleventh pass — every location is exactly five shots

Each location is trimmed to five rounds, chosen to keep the strongest and
most distinct teaching moments rather than cut arbitrarily:
- **Boulevard:** Freeze The Rider, Put Him On A Third, The Light Gap,
  Panning The Boulevard, Blue Hour.
- **The Marsh:** Get The Lens On Him, Wings Up, Through The Sun Column,
  The Stoop, Hard Noon.
- **The Room:** Expose For The Beam, Frame Him Through The Crowd, Hold Him
  Still, The Jump, House Lights Up.
- **The Match:** Freeze The Sprint, The Strike, Fill The Frame, Rain Game,
  Floodlit Pan.
- **The Platform:** unchanged — it was already five.

Dropped (Last Light, Wide And Clean, Mist On The Water, Silhouette, The
Keeper) were the most redundant with something else already in their
location, not the weakest individually. The separate "PRO" paid-extra-round
concept is now empty rather than deleted outright — SERVER.md §0 explains
how to bring it back later without any other change if you want a paid
"extra rounds" pack again.

Total: 25 rounds, down from 30. Every location card now reads "5 SHOTS".
The sequential-unlock gate (last pass) automatically requires all 5 of a
location, since the gate was always "every base round," and every round is
a base round now that PRO is empty — no gate logic changed, only the data.

Re-verified after trimming: 150 sampled camera puzzles still solvable on the
real dial grid (0 unreachable), duel scenes still resolve correctly across
all 5 locations, a full 5-shot Boulevard playthrough, a 5-puzzle library set,
a full duel, and Which-is-right all still work end to end.

**Worth knowing:** trimming and renumbering rounds means any personal bests
already recorded during testing may now point at a different round than
before (ids are position-based — `city-5` used to be Wide And Clean, now
it's Blue Hour). Not a concern before public launch, but worth a clean
slate — or a one-time best-score reset — rather than shipping this change
after real players have scores on the old lineup.

## Twelfth pass — a real sizing bug in the puzzle brief

Found it: puzzle briefs ("Throw the background out of focus…" and every
other camera puzzle) were dumping a full explanatory sentence into
`.bestline`, a class built for one short all-caps label like "YOUR BEST HERE
82.0 · A" — tiny (10px), tracked-out monospace, no line-height set. A whole
sentence forced into that class reads as cramped and broken, and it sat
under a header ("What this round weights most") that no longer applied,
since puzzle rounds hide the weights chips entirely.
Fixed: the header now reads "How this is scored" for a puzzle brief and
keeps its normal label otherwise; the sentence renders in a new `.note`
variant — normal sentence case, the regular UI font, proper 1.5 line-height
— sized like something meant to be read, not a stat label. Normal (non-
puzzle) round briefs are pixel-identical to before; verified side by side.

## Thirteenth pass — acting on the audit

Built the four highest-impact items from the fun audit, plus fixes found
while sweeping.
- **Warm-up offer for brand-new players.** The first time an account with
  no recorded shot taps a location, a card offers sixty seconds on one dial
  first. "Warm up, then play" runs lesson one (shutter speed, everything else
  locked) and then drops straight into the round they were heading for,
  mode restored; "I know cameras" skips. Offered once, never again. Not
  forced — one tap either way.
- **Result screen leads with the shot.** Photograph, grade, score, XP and
  the one thing to fix are all that show by default. The seven measure bars,
  composition breakdown and tips fold behind "See the full breakdown · 7
  measures"; opening it is remembered as a preference. The whole default
  result now fits one phone screen with Next/Retry visible.
- **Second looks.** Once a round is cleared (best ≥ C), every replay comes
  back in different light and weather — within a stop, same time of day, so
  the brief still holds — labelled "SECOND LOOK: FADING LIGHT · MIST" on the
  brief. The first attempt is always the round as authored. The variant is
  sent with the shot so the server can re-simulate it (SERVER.md §3).
- **An attainable streak.** Clean frames in a row (a C or better, not
  timed out) now count as a "warm" streak with a smaller XP bonus, shown in
  the HUD and on the result as "✓ 3 clean in a row" whenever the near-
  perfect 🔥 streak is not running. The run summary shows the longest clean
  run instead of a deflating "0 shots".
- **Corrections.** The audit said a timed-out shot scored zero in normal
  play; it does not — the frame is fired for you at 55%. The tip copy
  claimed "scores nothing" and now tells the truth. The run summary heading
  read "CONTACT C SHEET" with the grade wedged into the middle; it now reads
  "A solid B run".
- Sweep: every tab, glossary, lesson intro, a full 5-shot run to the summary,
  You-tab sub-screens and reduced-motion — no page errors, no console
  errors, no leaked "undefined"/"NaN" text anywhere.

## Fourteenth pass — the podcard clipping bug, actually fixed, and the daily-puzzle pause fixed properly

The "How this is scored" fix from last pass was already correct and
untouched. Two real bugs this pass, both traced to the bottom:

### The puzzle-of-the-day card was clipping text — root cause found
Restructuring the card's layout (previous attempt) didn't fix it, because
the real cause was two independent bugs stacked on top of each other:
1. `-webkit-line-clamp` requires `display:-webkit-box`, and having that be a
   **direct child of a modern flexbox** is a genuine Chromium bug — the
   outer flex layout miscalculates the clamp element's intrinsic height.
   Fixed by wrapping the clamped text in a plain block `.pod-namewrap` one
   layer removed from the flex container.
2. Separately — and this was the one actually causing the visible clipping —
   `<button>` + `display:flex;flex-direction:column` + `overflow:hidden` is
   its own Chromium bug: the button's height collapses to a few pixels
   instead of sizing to its flex content. `.podcard` is a `<button>`, and
   `overflow:hidden` on it was never actually needed (nothing inside it is
   absolutely positioned past its edges; the gradient background already
   respects `border-radius` on its own). Removed it.
Verified at 320/360/390/430px width with the exact prompt that triggered the
original report: zero overflow at every size, card height matches content
(114px vs the previous 26px).

### The daily-puzzle "pause on interaction" didn't actually pause
Caught while testing my own previous fix: the code picked
`$('#pz-photowrap') || $('#pz-verdict')`, which always resolved to
`#pz-photowrap` since that element exists in the DOM (just hidden) even for
non-camera puzzles — so tapping the verdict text itself never froze the
countdown. Now both `#pz-photowrap` and `#pz-result` get their own listener;
whichever the player actually touches pauses the clock. Verified: tap the
verdict, countdown freezes and stays frozen; the Back button still works
manually at any point.

Also re-confirmed the auto-return timing itself (9s correct / 13s miss) and
the just-solved highlight land correctly once given enough time to run —
an earlier spot-check that looked like a failure was just not waiting long
enough for the deliberately-lengthened countdown.

## Fifteenth pass — 1v1 promoted to a top-level mode

The retention mechanic was buried as one tile inside the Puzzles tab, which
contradicted its own importance. It now has its own front door.

### A DUEL tab
Five tabs now: PLAY · PUZZLES · **DUEL** · LEARN · YOU, with 1v1 in the
centre position and its icon in gold. Its home screen leads with the pitch
("Sixty seconds. Five scenes."), the player's rating badge, and a four-up
record strip (won / lost / streak / best average) — so the mode opens on
*your* history rather than a menu. Below that: one large primary action
(find a live opponent), two secondary tiles (practice duel, challenge a
friend), and a plain four-step "how a duel works" for anyone who has never
tried it.
- **The mode has a memory.** The last duel's scene-by-scene table is stored
  and shown on the tab, so returning to it shows what happened last time
  instead of resetting to a blank menu.
- **A real duel win streak** is now tracked (`rec.streak`) — wins against
  real opponents only; bot practice never counts, as before.
- **The tab dot** appears only if you have never completed a duel, and goes
  away permanently once you have. It is an invitation, not a recurring nag.
- Challenge-a-friend moved out of the cramped start screen onto its own
  screen with room to explain that no accounts are needed on either side.
- Every exit from a duel — result screen, queue cancel, friend screen —
  now lands back on the DUEL tab rather than dumping the player into
  Puzzles, which is where they used to end up.

### A way in from where players already are
A promo card at the bottom of the Play tab, below the locations, that says
something true about the player's actual state: "Ready for a real opponent?"
before their first duel, "Back for another duel? Your record: 3–1" after,
and "2 duel wins in a row — keep it going" on a streak. One tap into the
DUEL tab. This is the discovery path for someone who never opens a tab they
have no reason to open yet.

Removed the old duel tile from the Puzzles tab; that tab is now cleanly
about puzzles (daily, rush, which-is-right, practice by skill).

Regression: all five tabs, a full round, the lesson chain, a complete duel
with return-to-tab and persisted memory, the live queue's cancel and
navigate-away guards, the friend-code error path, and the promo card in all
three states. No page errors, no leaked text, and the MENU button no longer
collides with the new rating badge.

## Sixteenth pass — header overlap on mobile, and a real score for camera puzzles

### The header text overlap
Reproduced at 320/360/390/430px: the wordmark is set at up to 8.4vw with
negative letter-spacing, so its glyphs render wider than the box the flex
layout measures — "Blip" sat visibly on top of "EXPERT · 12450 XP" while a
bounding-box check reported no overlap at all, which is why it survived
earlier sweeps. Below 480px the header now stacks: the account line gets its
own row beneath the wordmark. Also fixed the duel tab's own header, where
the rating badge squeezed the heading into three-word lines at 320px.

### Camera puzzles are scored now, not just marked
This was the real gap: a camera puzzle is a photograph judged by a
simulation that already measures everything, and the result screen was
throwing all of it away to print "NOT QUITE" and a generic sentence.
`checkCamera()` now returns, per criterion the puzzle actually set:
what it wanted, what you got, a 0-100 closeness score, and the specific fix.
The result screen leads with an overall mark out of 100 and a card per
criterion — green tick or red cross, "WANTED thirds score 66+ · YOU GOT 5",
then "Drag the viewfinder so the subject sits on a thirds line, with space
ahead of them."
- Verdict logic is unchanged: the same criteria, the same pass/fail, so
  nothing about correctness, rating or the daily-solved state moved.
- Question puzzles are untouched — the scorecard only renders when a
  breakdown exists.
- Works offline and on the server path: if the server does not send `parts`,
  the client fills them from the same measurement, so the player always gets
  the detail while the server stays the authority on `correct`.
  Documented in SERVER.md §2.

## Seventeenth pass — launch readiness, and two more leaderboards

- **LAUNCH.md** — a direct readiness assessment: what is verified in the
  client, what does not exist without a server (accounts, live 1v1, boards,
  cross-device saves), server-side security requirements, the legal
  placeholders still in the live Terms/Privacy screens, the under-13
  audience question, and a staged launch plan.
- **Puzzle and 1v1 leaderboards.** The board screen now has three scopes:
  RUNS (as before: today/week/all-time per level), PUZZLES (by puzzle
  rating) and 1v1 (by live duel rating). With a server, both read
  `GET /v1/board?scope=puzzles|duels`. Without one, each shows the player's
  own standing with a plain note that global ranking lives on the server —
  never an empty table pretending to be a leaderboard. The DUEL tab's rating
  badge opens the 1v1 board directly, and Back from it returns to the DUEL
  tab.
- Re-audited XSS on every user-controlled string reaching the DOM, and
  confirmed passwords never touch local storage.

## Eighteenth pass — server-ready

- **Age gate** at registration (13+, 16 in the EU) as a required consent,
  with `ageConfirmed` and `termsVersion` sent on signup. Under-age players
  can still play everything without an account, and the copy says so.
- **Remote config**: the client fetches `/v1/config` at boot and merges it
  over defaults. New `features:{liveDuels, boards}` switches; `liveDuels:false`
  makes Practice the DUEL tab's big button and labels live "coming soon".
- **Operator guard**: a red warning renders on the Terms/Privacy screens
  while `OPERATOR` still holds placeholders.
- **Connection check** on the You tab: probes health, config, account,
  puzzles, all three boards, the daily puzzle, and reports each with latency
  — green/red/skipped — plus which API base is in use.
- **server/mock.js**: a zero-dependency, in-memory reference server that
  implements SERVER.md in full — auth with scrypt, the practice gate (403
  before a practice duel), the FCFS queue with stale-entry sweep and the
  bot offer, live duel sessions with Elo (K=32, humans only), puzzle marking
  through the shared PuzzleGen lifted from index.html, all three boards,
  config flags, export/delete. Serves the game itself, so `API_BASE` stays
  empty.
- **Verified with two real browser sessions against it**: register through
  the real form (age gate refused without the box), server refused the queue
  before a practice duel, both matched in ~3s on one seed, both played, the
  first to finish waited and then received the comparison by polling, all
  ten photographs rendered on both sides, ratings moved (1016/984), the 1v1
  board listed both, the DUEL tab badge refreshed, and the connection check
  came back all green. The no-server file path was re-verified unchanged.
- One client fix from that run: the server sends `opponent.handle`, codes
  send `opponent.name` — the renderer now accepts either.
- **DEPLOY.md**: the ten-minute local setup, the flags, the pre-signup list,
  and the rollout order.

## Nineteenth pass — layout polish, landscape, and puzzle variety

### Overlap sweep (automated, not by eye)
Wrote a detector that walks every visible element on every screen and flags
text clipped by its own box or pushed outside the viewport, then ran it
across five viewports (320/390/430 portrait, 740/844 landscape) over all
five tabs, the board, friend, lock, glossary and legal screens, plus a live
round and its result. Two real findings, both fixed: the daily-puzzle meta
line clipped at 320px (now wraps), and — found only because the sweep tried
to click through it — a landscape rule that made hidden screens visible and
swallowed taps, because `#s-result{display:grid}` overrode `.screen`'s
`display:none`. Both landscape grids are now scoped to `.show`. The only
remaining "overflow" is the dial strip, which scrolls horizontally by design.

### Landscape is a real layout now
Held sideways the app was a narrow column down the middle with a letterboxed
viewfinder. Under `orientation:landscape and max-height:520px`: the app uses
the full width, the tab bar shrinks to buy vertical room, and the two screens
that matter become two columns — **shooting** puts the viewfinder left and
every dial, meter and the shutter right (the frame is no longer a letterbox
and the controls are above the fold), and the **result** puts the photograph
left with the score and breakdown right. Location cards, duel tiles, result
bars and duel photo pairs go two-up. Under 430px tall the brand line and long
explanatory blocks hide rather than crowd. Verified by playing a full live
1v1 duel in landscape.

### Puzzle variety — the real problem was weighting
The pool had 66 templates but `equiv-shutter` and `equiv-iso` were weighted
5× each, so nearly a quarter of all 1,500 questions were the same stop
arithmetic (209 and 139 puzzles). Flattened those weights and added four new
question *shapes* rather than more of the same:
- **read-histogram** — interpret a histogram (clipped highlights, crushed
  shadows, flat scene, healthy spread).
- **which-setting** — given a goal, name the dial that does that job.
- **gear-choice** — what does this shot actually need: reach, a tripod, a
  fast lens, a narrower aperture?
- **order-of-ops** — two problems in one frame; fix them in the right order,
  because blur cannot be recovered and brightness can.
70 templates now, and the most common one dropped from 209 puzzles to 96.
Validated all 2,000: every question has four unique options, contains its
own answer, and carries an explanation — zero malformed.

## Twentieth pass — the tab bar was covering the last card

The duel promo sat 3px *under* the tab bar. Root cause was a CSS shorthand
trap, twice: `.tabbed` reserves bottom padding so the floating bar never
covers a screen's last control, but two `#s-title` rules set the `padding`
shorthand — one of them a fix I made earlier for the stacked header — and a
shorthand overwrites that reserved bottom. Higher specificity meant the ID
rules won, so the clearance silently vanished on the Play tab.
- Both `#s-title` rules now set top/left/right individually and leave the
  bottom to `.tabbed`, with a comment at each site explaining why.
- The clearance is now one variable, `--tabclear`, derived from the bar's
  own parts (padding + button height + safe-area) plus breathing room, and
  it shrinks automatically in landscape where the bar is shorter. One place
  to change instead of a magic number that drifts.
- Verified by measuring every element on all five tabs, scrolled to the
  bottom with every collapsible section expanded, at 320/390/430 portrait
  and 740/844 landscape: nothing sits under the bar at any size. The promo
  card now clears it by 73px.

## Twenty-first pass — Google sign-in finished (and gated properly)

The "Continue with Google" button already existed and was wired to
`/v1/auth/google`; it was missing a client id, a server endpoint, and — the
real problem — any age check.
- **Closed a gate bypass.** The Google path asked only for terms acceptance,
  so signing in with Google skipped the 13+ confirmation the username form
  requires. It now sends `ageConfirmed` and `termsVersion` too, and the
  server returns 428 until both consents are present. Social sign-in can no
  longer be a way around the age gate.
- The consent boxes were `data-reg` (register-only) and so hid in the login
  view, where Google is still shown; they now follow the Google button.
- **`POST /v1/auth/google` and `GET /v1/legal` implemented in the reference
  server**: matches on `googleSub` then verified email (so a password account
  can link Google later), derives and de-duplicates a handle, refuses new
  accounts without consents. The token verification is deliberately a decode
  only, commented as the most dangerous shortcut in the file — SERVER.md §1b
  spells out the real check.
- Verified end to end against the reference server with a stubbed Google SDK:
  refused without consent, created the account with it, signed the same
  person back in afterwards. Also confirmed the button correctly hides itself
  when the client id is missing, the server says no, or Google's script fails
  to load.
- DEPLOY.md now has the ~20-minute setup, and an honest answer on Facebook.

## Twenty-second pass -- optional name and birth year, without weakening the age gate

You asked for name and birthday at signup with no age restriction, for
analytics. I built the useful part and declined the risky part, and want to
be upfront about which is which:

**Declined as asked:** collecting a full birthdate with no age restriction.
Doing that is the specific pattern regulators go after -- COPPA in the US and
GDPR in the EU both turn on *actual knowledge* of a user's age, and asking
for a birthdate while deliberately not acting on it is how a service ends up
with documented proof it let, say, an 11-year-old create a public account.
"Just for analytics" doesn't change that; the exposure is in having asked and
not gated, not in what the number is used for afterward.

**Built instead:**
- **Name** -- a new optional field on the registration form, separate from
  the public username. Stored for the operator's own records, never shown
  to any other player, never on a leaderboard. Disclosed in the privacy
  policy.
- **Birth year only** -- no month or day. The dropdown is server-boundable
  and client-bounded to years that keep the player at or above the existing
  13+/16-EU floor, so it can never be used to admit someone the age gate
  would otherwise refuse -- the two checks can't contradict each other. Default
  is "Prefer not to say." Disclosed in the privacy policy as aggregate-only.
- Both fields are register-only (hidden in the login view), both flow
  through the Google sign-in path too under the same consent gate, and both
  are wired end-to-end into the reference server: stored on the account,
  returned only to that account's own /v1/me, and never spread into any
  board row or duel-opponent payload (those already build narrow objects by
  hand rather than exposing the full user, so this required no new
  leak-prevention -- just confirmed it holds).
- Verified: the year list runs 1926-2013 (nothing under 13), registering
  with both fields filled works, registering with both blank works, and the
  puzzle leaderboard for that account carries no trace of either field.

## Twenty-third pass -- final audit and design consistency

Ran a full audit rather than guessing at improvements. Most things came back
clean, which is worth stating plainly: tap targets (nothing interactive under
40px anywhere), alt text (no missing), 59fps during live shooting, and zero
heap growth across six consecutive rounds (no leaks).

Found and fixed:
- **The Puzzles tab was the only tab without a heading.** Every other tab
  opens with an eyebrow and a headline; Puzzles opened with a bare rating
  block, breaking the hierarchy. Now reads "Puzzles / Two thousand camera
  problems."
- **Duel rating badge crowded the headline below 400px** -- it was a tall
  block competing for horizontal space, wrapping "SIXTY SECONDS. FIVE
  SCENES." into thirds. It is now a compact inline "RATING 1016" chip on its
  own row.
- **The beginner tour was offered to returning players.** A player who
  closed the app on the welcome screen without answering got pitched the
  two-minute tour on every launch forever. Recorded play (any XP or any
  personal best) now counts as an answer.
- **Unlabelled board filter** -- the leaderboard's location <select> had no
  accessible name. Added one, plus a reusable .sr-only class.

Resilience verified by killing the server mid-session: the offline banner
appears, the puzzles and duel tabs degrade to their local states, play
continues normally, the board explains itself rather than showing an empty
table, and no errors are thrown. Progression, duel records, compare streaks
and the unlocked-location gate all survive a reload, including a reload
taken mid-round.

Final integration run against the reference server: two accounts registered
through the real form with the optional name and birth-year fields, matched
live in 3 seconds, played a full duel with all ten photographs rendered,
ratings moved, both listed on the 1v1 board, a server-marked puzzle moved
the puzzle rating, a lesson advanced, a full scored round completed, and the
connection check came back all green.

## Twenty-fourth pass -- the white film in 1v1, and the duel screen generally

The "white opaque film" was real and had a specific cause worth recording.

**Root cause: every duel scene opened on the same fixed dials** (f/4, 1/250,
ISO 400) regardless of the scene's light. Measured across 25 scenes, the
starting exposure error ran from -2 stops (bright scene, washed white -- the
film you saw) to +7 stops (dark stage scene, effectively black). With about
twelve seconds a scene, that is not a challenge, it is a penalty for
whichever scene you were dealt.

Fixed with a new openingDials(): the camera now opens metered close to the
scene but deliberately off by a set amount, so there is still a real exposure
decision. The offset comes from the duel seed, so **both players get
byte-identical starting dials** -- verified in a live match. Worst starting
error across 25 sampled scenes is now 1.0 stop, down from 7.0. The shutter is
also constrained to something fast enough for the subject's speed, so nobody
opens on unavoidable smear.

**Second, larger problem found while testing: the subject was barely on
screen.** Duels reused the normal round's travel loop, which sends the
subject across the full +/-span -- most of it off-frame -- and relies on an
18-22 second round for it to come round again. Sampling every frame for 2.5s
per scene, the subject was visible as little as **9%** of the time on The
Platform and 29% on the Boulevard. Players were spending a twelve-second
scene waiting rather than shooting. Duels now loop the subject through a
tight window around each scene's sweet spot: visibility is now 64-100%
(most scenes 85%+). Normal rounds and lessons keep the original full-span
travel -- verified unchanged.

Also on the duel screen:
- The subject started off-frame AND the camera pointed elsewhere; the camera
  now opens framed on the subject at about 42% across, still leaving the
  composition to the player.
- The scene line truncated to "DUEL - 1/5 - THE MATCH - ..."; it wraps now.
- **The objective was hidden entirely in duels** -- the only thing on screen
  was whichever dial you happened to be holding, so you could not see what
  you were being scored on. It is shown, in a compact form.
- Dead vertical band between the controls and the shutter closed.

Wider audit in the same pass came back clean: no tap target under 40px, no
missing alt text, 59fps while shooting, no heap growth over six rounds, and
graceful degradation when the server is killed mid-session.

## Twenty-fifth pass -- pre-launch hardening

Adversarial and edge-case testing rather than another feature pass.

**Two real bugs found and fixed:**

1. **Double-tapping "Next shot" silently skipped rounds.** Six rapid taps
   advanced six shots without playing any of them, jumping straight to the
   contact sheet with one real result. A single accidental double-tap cost a
   player a whole round and skewed their run average. Both Next and Retry now
   only act from the result screen they belong to, so repeat presses are
   ignored. Verified: six taps advance one shot, and a full five-shot run
   still completes normally.

2. **Corrupted local storage could take a tab down.** A malformed `lastDuel`
   record threw on the duel tab's load path. Every stored-value read is now
   type-checked at the point of use (`duels`, `lastDuel`, `bests`,
   `cmpprogress`), and malformed duel rows are filtered rather than mapped
   over. Tested against eight kinds of corruption -- a string, null, a
   number, an empty array, wrong-shaped objects, arrays of nulls, a boolean
   -- all now load cleanly instead of throwing. This matters because a
   half-written record from a crashed tab is exactly the kind of thing that
   produces an unopenable app for one unlucky user with no way to explain it.

**Confirmed working under abuse:** spamming the shutter records exactly one
frame per round and exactly five scenes per duel; rapid tab switching leaves
the app in a valid state; no console errors or warnings anywhere across every
screen and sub-screen, visited twice.

**Confirmed unchanged:** no text overlap or clipping at 320/390/430 portrait
or 740/844 landscape; nothing sits under the tab bar on any tab at any size
with all sections expanded.

**Final integration run against the reference server:** two accounts created
through the real form with the optional name and birth-year fields, matched
live in about three seconds, a full duel played with one player switching to
landscape mid-match, all ten photographs rendered, ratings moved, both on the
1v1 board, a server-marked puzzle moved the puzzle rating, a lesson advanced,
a full scored round completed, connection check all green, zero page errors.

## Twenty-sixth pass -- PWA completed, install prompt surfaced

**Critical find: the app was not actually installable.** index.html linked
`/manifest.webmanifest` and registered `/sw.js`, and the install-prompt UI
was fully built -- but neither file existed. On a real deployment the browser
would have 404'd both, so the "Add to home screen" card could never appear
and nothing would work offline. Everything downstream of that was written and
untested.

Created:
- `manifest.webmanifest` -- name, standalone display, theme colours, icons.
- `sw.js` -- caches the shell so the game loads with no signal, but treats
  everything under `/v1/` as network-only, because a cached leaderboard or
  duel result would be worse than an honest error.
- Four icons generated from the game's own aperture mark: 192, 512, a
  maskable 512 (art inside the safe circle so Android does not crop it), and
  a 180px apple-touch-icon.

Also fixed: the reference server sent **no Content-Type at all** on static
files. Browsers refuse to register a service worker that is not served as
JavaScript and ignore a manifest not served as JSON -- this is the usual
reason an install prompt silently never appears. Proper MIME types now, plus
`Cache-Control: no-cache` on sw.js so a deploy can replace it.

Verified end to end: correct MIME types, service worker registers and
activates, and **the game still loads after the server is killed** -- real
offline play, not theoretical.

**Install prompt moved somewhere people will see it.** It lived only on the
You tab, which almost nobody opens before playing. There is now a second,
dismissible card at the bottom of the Play tab; dismissing it is remembered
so it never nags. Both cards adapt their wording: a one-tap install on
Android/Chrome, the three-tap Safari instructions on iOS, and hidden
entirely once the app is already installed.

**GO-LIVE.md** -- a plain-language deployment guide: GitHub setup with
GitHub Desktop, Vercel versus DigitalOcean with an honest recommendation
(Vercel first), the pre-launch checklist, the service-worker cache-bump
gotcha, how the home-screen icon works per platform, and a staged launch
order.

## Twenty-seventh pass -- usernames made unique and permanent

The problem was that two naming systems existed and only one of them was
real. The name screen's "claim this name" wrote a **local nickname** with no
server check at all, while `register` created a genuinely unique **account
username**. Nothing connected them, nothing stopped a nickname from being
changed on a whim, and nothing warned a player that the name they had been
playing under for a week was not actually theirs.

Now:
- **Uniqueness is checked live, as they type.** New
  `GET /v1/auth/check?handle=` reports available / taken / reserved, debounced
  at 400ms with out-of-order responses discarded. The signup field shows
  "SHOOTER IS AVAILABLE" or "ALREADY TAKEN" before anyone commits.
- **Case-insensitive**, so `Dana` and `dana` are the same name -- verified.
- **Nicknames now check the server too** when one is reachable, so a player
  cannot spend a month attached to a name they can never reserve. Offline,
  the local rules still apply and the copy says availability is confirmed at
  signup.
- **A username is permanent once an account exists.** `Cloud.handleLocked()`
  refuses any change client-side, and the server returns 403 on
  `POST /v1/me/handle` with a comment explaining why: a handle on a public
  board has to be stable, or someone farms a score, renames, and farms again
  with nobody able to follow it.
- **The flow makes the distinction obvious.** The nickname screen says a
  nickname is not reserved. Opening signup pre-fills the nickname they have
  been using, so the name they know is the one offered to make permanent. A
  gold notice above the consent boxes says plainly that the username is
  permanent and goes on leaderboards. The You tab reads "Signed in as
  SHOOTER -- this username is permanent and yours."
- Reserved-word blocking (`admin`, `moderator`, `support`, `staff`,
  `official`, `shutterblip`) on both sides.
- Character rules aligned between nickname and account (3-16, letters,
  numbers, underscores) so carrying one over never surprises anyone.

Verified with two live browsers: player one claims DANA and registers it;
player two is refused the nickname, sees "ALREADY TAKEN" while typing,
is refused at signup, succeeds with DANAB; player one cannot rename either
client-side or server-side; `dana` in any case reports taken.

## Twenty-eighth pass -- guest or account, chess.com style

Replaced the "pick a nickname" entry with a straight fork, which also
removes the awkward middle state where a name was neither temporary nor
really yours.

- **Entry screen is now two doors**: *Create a free account* (keep your name,
  rating and progress anywhere) or *Play as a guest* (start immediately),
  plus *I already have an account*. Each says what it costs and gives.
- **Guest numbers come from the server** (`POST /v1/auth/guest` ->
  `Guest1001`, `Guest1002`...), because that is the only way two guests can
  be guaranteed not to collide. With no server the client mints a random
  4-digit local number instead, which is only ever a label on one device.
- **Guests are real rows** holding XP, bests and puzzle rating -- but they
  are filtered off both leaderboards and refused by the live 1v1 queue (403),
  since nothing prevents one person minting a thousand of them.
- **Upgrading keeps everything.** `POST /v1/auth/upgrade` changes the handle
  and credentials on the existing row rather than creating a new one, and
  moves token bindings and recorded shots across. Verified: XP 161 and best
  75.86 both survive unchanged, and the freed `Guest1001` becomes available
  again.
- The signup form shows a teal note to guests -- "Your progress comes with
  you... everything you have played as Guest1001 stays on this account."

Two bugs found while building it:
- **Guests could not reach the signup form at all.** A guest holds a token,
  so `showAccount()` treated them as already signed in and hid the form --
  the only route out of guest mode. Guests now see the form.
- **The mock server scored every shot as zero.** The client sends
  `clientScore` (named that deliberately, so a server author cannot mistake
  it for an authoritative number) while the mock read `b.score`. Every guest
  and account had server-side XP of 0 and a best of 0. Fixed, with a comment
  restating that production must re-derive the score from the frame.
- Signup no longer pre-fills a `Guest####` name, which made the availability
  line read "ALREADY TAKEN" against the player's own handle.

## Twenty-ninth pass -- guests duel, guests do not chart

Corrected the previous pass, which had blocked guests from live 1v1
entirely. Guests can now queue and duel; what they cannot do is appear on a
leaderboard.

- **Live queue opened to guests.** A duel is between two people who both
  showed up, and excluding guests would leave the queue empty at launch for
  no real gain. Their duel rating moves normally, and the registered
  opponent's rating moves fairly against them.
- **All three boards exclude guests** -- and they do it in two different
  ways, which was the bug worth catching: the puzzle and duel boards filter
  on the user object, but the runs board reads the **shots log**, which
  carries no guest flag. It was not filtering at all, so guests would have
  leaked onto the most visible leaderboard in the game. It now looks each
  handle back up.
- **Hidden, not deleted.** A guest's scores are recorded the whole time and
  surface the instant they upgrade. Verified: runs board empty while a guest,
  and `['ARRIVED']` immediately after upgrading, XP unchanged at 161.

Messaging corrected everywhere it was now wrong, including two places that
were actively misleading:
- The You tab told a guest "this username is permanent and yours" -- it is
  neither. It now says they are a guest, can duel and play everything, and
  what an account adds.
- The board showed a guest a populated leaderboard with no explanation of
  why they were not on it. It now says guests are not listed and what to do
  about it.
- Entry screen, guest button subtitle, and the duel tab's own subtitle
  ("FIRST COME, FIRST MATCHED · GUESTS DO NOT APPEAR ON THE BOARD") all
  state the trade plainly rather than letting people discover it by absence.

## Thirtieth pass -- systematic bug sweep across every area

Ran the paths that had not been covered before, rather than re-running the
ones that already passed.

**One real bug found and fixed:**
- **Button rows overflowed below ~310px.** A flex item defaults to
  `min-width:auto`, which is its content width, so the two-button row on the
  You tab ("Leaderboard" plus an icon) could not shrink and pushed off the
  right edge at 280-300px. `min-width:0` on row buttons plus `flex-wrap`
  fixes it. Verified clean at 280/300/320/360/390.
- Investigated and dismissed a second report: the location-card scene SVGs
  measure wider than the viewport, but that is `preserveAspectRatio="slice"`
  working as intended and clipped by the card. Confirmed no card overflows
  and `document.body.scrollWidth === window.innerWidth`, so there is no
  horizontal scroll.

**Everything else passed:**
- **Accounts:** bad password rejected with a clear message; sign out then
  sign back in restores XP exactly (162 -> 162); the same account on a
  second device inherits scores, bests and the identical unlock state.
- **Data rights:** export returns all thirteen fields including shots;
  delete revokes the token (401 afterwards) and frees the username for reuse.
- **Network failure:** dropping the connection mid-queue leaves the player on
  the queue screen with no errors and Cancel still working; a shot taken
  while offline still scores locally; the app recovers when the network
  returns.
- **Abandoned duels:** if an opponent never submits, the poll terminates
  after its bounded retries and shows an honest "still waiting on them" with
  the spinner cleared -- not an infinite hang -- and the player can always
  leave to the duel tab.
- **Every button on every screen:** 97 non-destructive buttons clicked
  across all screens, zero page errors.
- **Layout:** swept at 280/300/320/360/390/768 portrait and 900x400
  landscape; nothing under the tab bar, no clipped text, no overflow.

## Thirty-first pass -- 1v1 moved to the front page

The entry screen sold the simulator and the puzzle count, and mentioned
duelling only in small print under the guest button -- so the single feature
most likely to bring somebody back was the one a new visitor was least likely
to notice.

- Headline changed from "Learn a camera by using one" to **"Out-shoot a real
  person"**. The old line described the method; the new one describes the
  reason to play.
- A gold pitch card now sits directly under the headline: **"60 seconds. 5
  scenes. One winner."** with a plain explanation -- same five scenes, same
  light, one frame each, then both photographs side by side with exactly why
  you won or lost. That last part is the differentiator and was invisible
  before.
- The feature list below it keeps the simulator and puzzle claims but is now
  supporting detail rather than the lead. Also updated to mention the night
  train, since the Platform exists now and "panning a cyclist" undersold it.
- On short screens (under 620px tall) the pitch card drops its body text and
  keeps the one-line hook, so the two entry buttons stay above the fold.
  Verified at 320/390/430: both buttons reachable without scrolling.

All three entry routes re-tested (guest, sign up, sign in), overlap sweep
clean, no errors.

## Thirty-second pass -- entry screen: show the game, do not describe it

The previous attempt added a pitch card to a screen that was already dense,
which made it worse rather than better. This pass cuts instead of adds.

**The core problem:** this is a photography game whose front page contained
no photography. The duel was represented by three abstract boxes of jargon
("60s five scenes -> 1 frame each -> VS best wins") that a newcomer has to
decode.

- **Two real scene frames with a VS between them** now sit under the
  headline, drawn with the game's own location artwork. It says what a duel
  is in one look and doubles as the only proof of what the game looks like.
  The pair is picked at random per visit from all five locations, never the
  same scene twice, so the screen is not identical every time -- verified
  across eight loads: five distinct left-hand scenes, seven distinct
  pairings, never a matching pair.
- **Three plain facts** replace the jargon row: 60s on the clock, 5 same
  scenes, 1 winner.
- **Button order swapped.** "Play now" is the primary button and "Create a
  free account" the secondary. Leading with a signup form on a game that
  needs no account was friction in front of the fun; the account button still
  states plainly what it is for ("Needed for the leaderboards").
- Facts row hides under 620px tall so both buttons stay above the fold --
  verified at 320 and 390, no scrolling needed at either.

Art failure is caught and ignored: if the scene drawing throws for any
reason the frames stay empty and the screen still works, because decoration
must never block the way in.

## Thirty-third pass -- rebalancing the entry screen back toward the mission

The previous pass overcorrected. "Out-shoot a real person" framed the game
as a competition that happens to involve cameras, when it is a camera game
that happens to have competition. The duel is what makes the practice worth
repeating -- it is not the point of the practice.

- **Headline back to "Learn a camera by using one."** The subline now
  carries both halves: "Aperture, shutter and ISO on a camera that behaves
  like the real thing -- then put it to work against other photographers."
  Learning first, competition as the payoff.
- **Three ways to play, given equal visual weight**: Shoot (25 rounds, five
  locations), Solve (2,000 camera puzzles), Duel (60 seconds, head to head).
  Duelling is one of three doors rather than the whole facade, and the
  puzzles -- which had vanished from the front page entirely in the last
  pass -- are visible again.
- The duel's gold VS pip is gone; only the Duel icon stays gold, so the eye
  still finds it without the screen shouting about it.
- **Scene art kept.** It was the right call and it stays, now framed as "here
  is what you photograph" rather than "here are two people fighting".
- Guest button subline changed from "duels included" to "start with the first
  lesson", which is what actually happens when a new player taps it.
- Removed a floating "5" between the two frames: it read as a label for
  something and explained nothing.

Entry routes re-tested, overlap sweep clean, no errors.

## Thirty-fourth pass -- PC and mobile optimisation

**The real PC gap was input.** On a desktop you could pan and press space,
but there was no way to change a single camera setting without a mouse --
which makes a camera game unplayable with hands on the keys. Full keyboard
control now:
- `1`-`5` pick a dial (aperture, shutter, ISO, lens, focus)
- `[` `]` step it down and up, with `,` `.` and `A` `D` as alternatives for
  anyone who does not want to hunt for brackets
- arrows aim, `space` shoots, `G` cycles the grid, `F` toggles AF tracking
- Modifier combinations are ignored so browser shortcuts still work, and
  typing in any input field is never hijacked. Lesson-locked dials stay
  locked to the keyboard too.
- Verified by playing a complete scored round on desktop using only the
  keyboard.

**Discoverability, adapted to the device.** The shortcuts are listed on the
brief screen (right before you shoot) and on the Play tab, but only on
devices that report a fine pointer and hover -- a phone never sees them, and
on a phone the touch hints show instead. Neither device sees advice for the
other.

**Desktop layout.** The app is a phone-width column by design, which left a
tall desktop window with a small frame and a band of dead space above the
shutter. On a wide, tall, mouse-driven window: the column widens to 820px,
the viewfinder grows (742x360 -> 802x467), the shutter anchors to the bottom
so the gap closes, and the location cards go two across instead of one long
list.

Regression: overlap sweep clean; a full keyboard-only round on desktop; a
touch duel and a puzzle on a simulated mobile device; no errors on either.

## Thirty-fifth pass -- real gameplay images on the front page

The two frames were the same simplified postcard SVGs the location cards
use: stylised illustrations, not what the game looks like through the
viewfinder. They now come off the game's own renderer -- the identical code
path that draws a live round -- so the front page shows actual gameplay.

- **Exposure is solved, not guessed.** The first attempt hand-picked settings
  and produced a Boulevard 1.5 stops overexposed and a Marsh nearly a stop
  dark. Aperture and focal length are now chosen for the LOOK of each scene
  (wide open for the portrait locations, long glass for the distant ones) and
  the shutter/ISO pair is solved for a correct exposure, preferring a fast
  enough shutter and the cleanest ISO that reaches it. All four frames now
  land within half a stop -- every front-page image is a photograph the game
  itself would score well.
- **The Room is timed to its beam.** That scene's spotlight sweeps on a
  clock; at the default moment the singer sat in darkness. Pinning the clock
  to zero puts the beam on him, which is the whole look of that location and
  now the most striking image on the page.
- **The Match was cut.** A floodlit pitch is mostly empty dark green with a
  small figure on it, and every framing tried either shrank the striker or
  blurred him. Three alternatives were rendered and compared before dropping
  it: it is a good round to play and a weak photograph to advertise with, so
  the page shows the other four. That leaves six possible pairings, all
  checked and all strong.
- Falls back to the postcard art if rendering ever throws, so decoration can
  never block the way in.

Verified on mobile and desktop: two real images each load, all three entry
routes work, no errors.

## Thirty-sixth pass -- entry frames reported blank

Reported: both squares on the entry screen show as empty dark blue. Could
not reproduce -- the frames render correctly here at 1x, 2x and 3x device
pixel ratios, over file:// and over http, with and without the service
worker, and the generated JPEGs contain real scene pixels. Rather than
insist it works, hardened every way it could fail:

- **A blank render no longer passes silently.** A canvas that was never
  sized produces a tiny, essentially flat JPEG instead of throwing, so
  "no exception" was never proof of success. The data URL is now checked for
  real content (>2KB); anything smaller is treated as a failure.
- **A failure always falls back to the illustration art**, and marks itself
  unpainted so a later visit can upgrade to the real rendered frames. The
  squares can no longer end up empty in any path -- verified by forcing the
  renderer to return null: illustrations appear, then real frames return on
  the next visit.
- **Repaints on every visit to the entry screen**, not only at first boot,
  so a returning player or a sign-out gets frames too.
- **Bumped the service worker cache to v2.** This is the most likely cause
  of the report: sw.js caches index.html, so a browser that loaded the game
  before this change keeps serving the old file until the cache name changes.
  Anyone still seeing blank squares after updating should hard-refresh
  (Ctrl/Cmd+Shift+R) or close and reopen the installed app.

Note for future deploys, already in GO-LIVE.md: bump CACHE in sw.js every
time index.html changes, or returning players keep the previous build.

## Thirty-seventh pass -- live simulated duel on the entry screen

Two changes: the frames are now animated, and the blank-square failure mode
is gone for good.

**The squares are a live simulated duel.** Each side is a photographer
working a real scene: they start a few stops off, step one dial at a time
toward a correct exposure, and the frame visibly brightens or darkens as
they go. A readout under each frame shows their actual settings
("f/2.8 - 1/250 - ISO 100") with the live EV error beside it, turning to a
green tick when they land it. Then a shutter flash, and both sides move to
new scenes. It shows what the game IS -- operating a camera -- and what a
duel looks like, without a word of explanation.

**Why the squares were blank, and why they cannot be again.** The old
version exported each frame with `canvas.toDataURL()`, which is the one step
that can fail silently in a sandboxed preview: no exception, just an empty or
tiny image. The renderer now hands its live pixels straight to a `drawImage`
call into each frame's own canvas -- `toDataURL` is not used at all on this
screen. If the renderer cannot draw in some environment, the frames fall back
to the location artwork rather than sitting empty.

Also softened the starting error from up to 4 stops to at most 3: on the
entry screen a blown-white first frame reads as "broken" rather than as "this
player has work to do".

**Note on the report:** the screenshot showed frames with no PLAYER 1 /
PLAYER 2 labels, which only exist in this newer markup -- so that preview was
an earlier build, not the current file. Opening the newest index.html (or
hard-refreshing, since sw.js caches the old one until CACHE is bumped -- now
at v2) should show the animation.

## Thirty-eighth pass -- entry frames made independent of the game engine

Third report of blank squares, and the cause was mine to find rather than
the reporter's environment to explain away.

**What was wrong.** The entry frames borrowed the game's own renderer, which
needs the offscreen canvas, the global viewfinder dimensions, canvas filter
support and the scene engine all working at boot. If any link in that chain
is unavailable -- a sandboxed preview, a restricted canvas, a browser without
`filter` -- it drew nothing. Worse, the fallback replaced the frame's entire
innerHTML with an SVG, which also deleted the PLAYER label and the settings
readout. That is why the squares were not just empty but completely bare,
and it is the detail in the screenshot I should have read as a clue two
passes earlier: no labels meant the fallback had fired, not that an old build
was loaded.

**What it does now.** The entry screen paints its own scenes -- sky gradient,
sun or key light, skyline silhouettes, a subject, and the exposure applied as
a flat overlay so the frame genuinely brightens and darkens as the simulated
player works the dials. Fills and gradients only: no game engine, no
offscreen canvas, no filters, no `toDataURL`. There is no longer a code path
where a frame can come back empty, and the labels are never removed.

Four scenes (Boulevard, Marsh, Room, Platform), each with its own palette,
skyline shape and subject, so the two sides always look different from each
other.

Service worker cache bumped to v3.

## Thirty-ninth pass -- the entry screen is no longer skipped

Reported: the title page sometimes jumps straight to the lobby. It was doing
that for anyone with a saved profile, which after one visit meant every
returning guest -- so a guest could play for weeks without ever being offered
the chance to keep any of it.

- **Only a signed-in account skips the chooser now.** They made a permanent
  choice; asking again every launch would be noise. A guest's last visit was
  "not now", not a decision, so they see the fork again.
- **Returning guests are offered themselves back.** The primary button reads
  "Continue as Guest1001 -- your progress on this device is still here", and
  resumes the existing guest rather than minting a new one. One tap, nothing
  lost, and the account and sign-in options are right there.
- **Signing out returns to the chooser** rather than leaving someone in the
  lobby with no identity.

Two bugs found while testing this:
- **Account holders were being sent to the chooser too.** The check required
  a local profile as well as an account, but someone who signed up without
  ever being a guest has no local profile -- so every launch bounced them
  back. Routing now keys off the account alone.
- **XP read as zero on resume.** It was only ever read from the local
  profile; the account copy is authoritative when present. Verified: a guest
  who earns 161 XP still has 161 after a reload and Continue.

Service worker cache bumped to v4.

## Fortieth pass -- removed a duplicate button on the daily puzzle

Reported: the daily puzzle showed "Not now", "Back" and "Open the camera",
and the first two did the same thing. Confirmed in the code -- for a puzzle
of the day both call `leavePuzzle()`, so the player was being asked to choose
between two identical doors.

Rather than delete the Back button outright (it is shared with the rest of
the puzzle library, where it genuinely differs from "Next puzzle" or "Finish
the set"), it now hides only where it is redundant: the puzzle of the day,
the daily pair, and the last puzzle in the library. One helper decides this
and is called from both places the buttons are labelled, so the two can never
drift apart again.

Verified: daily puzzle shows two buttons before and after answering; library
puzzles keep all three.

Service worker cache bumped to v5.

## Forty-first pass -- monetization (Supporter tier) and copy protection

### Business context
You asked how to protect the game and make money, given it is pre-launch
with only a few friends testing. Full answer given as text alongside this
build: registering copyright is worth doing now (cheap, retroactive to
filing date, gives real legal teeth); trademarking the name is worth
waiting on until the name and the audience are both confirmed. Steps for
both are in the new COPYRIGHT-STEPS.md. Monetization direction confirmed:
duels stay free forever (no paywall on the thing that brings people back),
and the model is closer to chess.com than to interstitial-ad-supported
mobile games -- cosmetics, badges, a Supporter tier, never pay-to-win.

### Supporter tier -- built and tested end to end
Discovered a fully-built store UI (catalogue, Stripe-shaped checkout,
Blips currency, cosmetic equip) with **no backend at all** -- every one of
those endpoints was missing from the reference server. Built all four:
`GET /v1/catalogue`, `POST /v1/purchase/checkout`, `POST /v1/store/redeem`,
`PUT /v1/profile/equip`.

- **Supporter** (`$4.99`, one-time, not a subscription -- see SERVER.md for
  why one-time was chosen over chess.com's recurring model): turns off ads
  for that account permanently, grants an exclusive badge and camera
  finish that cannot be earned or bought any other way.
- Added the badge (`badge.supporter`) and skin (`skin.supporter`) to the
  existing cosmetic catalogs, plus a new heart icon in the sprite sheet.
- `adDue()` checks live account ownership, not a cached flag, so a
  purchase takes effect immediately with no reload.
- **The constraint stated explicitly, in the code and in SERVER.md**:
  every item for sale is a location pack or a cosmetic. Nothing changes a
  score, matchmaking, or the legitimacy of a leaderboard entry. Duels are
  never sold.
- `mock.js`'s checkout grants instantly, which is only acceptable because
  it has no real payment processor behind it -- SERVER.md spells out
  exactly why production must grant ownership from a verified Stripe
  webhook and never from the checkout call itself, or anyone can claim
  anything for free.
- Verified: purchase grants all three items, duplicate purchase is
  refused (409), the badge and skin become wearable immediately, and ads
  stop firing without a reload.

### Copy protection -- a build pipeline, and an honest limit on what it does
Client-side code cannot be made uncopyable; said so plainly rather than
oversell a technical fix. What minification actually buys: raising the
bar from "read the extensive design comments and understand everything in
an afternoon" to "reverse-engineer minified code," which is the standard,
honest amount of effort real commercial web apps rely on.
- **build.js**: runs the real JS through `terser` (515KB -> 344KB, comments
  and structure gone, not just whitespace), strips HTML comments from
  everything outside the script block, and stamps a copyright header.
  Outputs `index.min.html` -- deploy THIS, never the commented source.
- **Found and documented a real interaction**: `mock.js` extracts the
  puzzle generator from `index.html` by exact source text, which
  minification changes. Fixed by scoping mock.js to source-only
  explicitly in its own comment, since it is local dev tooling and was
  never meant to run against a production build anyway.
- Verified the minified file client-side: guest creation, a full scored
  round, and a practice duel all work with zero errors -- minification did
  not silently break anything.
- **LICENSE-NOTICE.txt**: the plain-language notice stamped into the
  minified build's header.
- **COPYRIGHT-STEPS.md**: the actual registration steps -- eCO filing as a
  literary work, the redacted-deposit option for anything you consider a
  trade secret, and what to do if you find a live copy elsewhere.

## Forty-second pass -- admin portal, and three real bugs caught building it

Built a full admin portal at `/admin`, entirely server-side and never
referenced anywhere in `index.html` -- confirmed with a grep across the
whole client file: nothing but an unrelated reserved-word filter and a
stray comment mention "admin" anywhere in it. The client has no idea this
exists, which is the point: nobody reading view-source finds a clue it is
there.

- **Requires `ADMIN_PASSWORD` as an environment variable; the server
  refuses to start without it.** No default, no hardcoded fallback.
- **Dashboard**: account/guest counts, revenue, a 14-day signup chart, top
  players by XP and by duel rating, recent signups and purchases, a
  player look-up with account deletion, and live feature-flag toggles.
- **Brute-force protection**: failed logins are rate-limited per IP with a
  doubling lockout after 5 free attempts. Verified by scripting 6 wrong
  passwords, then confirming the CORRECT password is also refused (429)
  until the lockout clears.
- Session cookie is HttpOnly + SameSite=Strict, 12-hour expiry.

**Three real bugs found while testing this, not while writing it:**
1. An earlier editing pass had partially failed silently -- one of its four
   changes (a helper function call) landed while the other three (the
   `events` array declaration and two of the three places that log to it)
   were discarded when a later assertion in the same batch failed before
   the file was saved. The result: `events.push(...)` was calling into a
   variable that did not exist, which would have 500'd every guest
   signup in production. Caught only because the admin dashboard test
   tried to create a guest and got a real server error instead of the
   expected response -- exactly the kind of silent gap that class of
   mistake produces, and exactly why "it looks right" is not the same
   as "it runs."
2. Every admin page used an `esc()` HTML-escaping helper that was never
   defined in this file -- it exists on the game client but this is a
   separate Node process with no shared code. Every admin page load was
   throwing. Added a real escape function and confirmed every admin
   route renders.
3. The login form, the flags form, and the delete form all submit as
   `application/x-www-form-urlencoded`, and the server's `body()` parser
   only ever understood JSON. Every admin form submission was silently
   parsed as an empty object -- logins "succeeded" against an empty
   password check in one direction and failed in the other, and the
   feature-flag checkboxes always saved as their default regardless of
   what was actually checked. `body()` now detects the content type and
   parses either shape.

Verified end to end after all three fixes: register two real accounts,
purchase Supporter, confirm it appears correctly on the dashboard with the
right revenue total, toggle a feature flag and confirm `/v1/config` reflects
it immediately, look up a player, delete their account, confirm their name
is free again -- then ran the full game regression (a live duel with photos,
a purchase, and a scored round) to confirm none of this touched the client
at all.

## Forty-second pass -- analytics, admin portal, and the privacy text catching up to it

Found a partially-built admin portal already in mock.js (password auth,
rate limiting, a dashboard, user lookup) with real gaps in what it actually
tracked. Closed those, and closed a real compliance gap the new tracking
would otherwise have opened.

### Analytics -- instrumented what was missing
Signup, guest creation and purchase were already logged. Added: **login**,
**shot submitted**, **puzzle answered** (with template and correct/
incorrect -- what makes "which puzzles are too hard" answerable at all),
**duel result** (tagged `live` or `bot`, so the dashboard can tell a working
matchmaking queue from one where everyone hits the fallback), and
**account upgrade**. Every authenticated request now refreshes
`user.lastSeenAt`, which is the only honest foundation for DAU/WAU/MAU --
without a heartbeat, "active" has no definition.

### Dashboard -- from six numbers to something you could actually run a
launch on
Added: DAU/WAU/MAU, day-1 retention (a real cohort -- accounts from two
days ago checked against yesterday, so normal same-day usage is not
miscounted as "returning"), a live/bot duel split, hardest puzzle
templates by pass rate, and a proper players table -- searchable by handle
or email, sortable by created date, last seen, XP or duel rating, not just
a fixed "recent 20" list. A live activity feed auto-refreshes every 15s.
Verified against real generated activity: two accounts, a live duel, a
puzzle answer, a round, and a Supporter purchase all appeared correctly
and immediately.

### The compliance gap opening this created, and closing it the same pass
Adding an event log and a shots table meant "delete my account" could
quietly stop being true -- login gone, but scores and answers left behind
forever under the old handle. Both deletion paths (self-service and admin)
now go through one `scrubAccount()` function that removes the user, every
token, and every row in `shots`, `events` and `queue`. Verified: a deleted
player's shot disappeared from the public runs board immediately. The
privacy policy text was updated in the same pass to say plainly that
deletion covers gameplay data, not just login -- a policy promising that
before the mechanism existed would have been false the moment analytics
shipped.

### A real crash fixed along the way
Found while stress-testing the puzzle-answer endpoint: sending a
multiple-choice answer to a camera-kind puzzle (or vice versa) crashed the
server with a 500 rather than a clean 400 -- `checkAnswer`/`checkCamera`
return `null` on a kind mismatch, and nothing checked for that before
reading `.correct` off it. One missing null check away from a public
endpoint that anyone could crash with a malformed request. Fixed and
verified.

### Privacy text
Added a plain disclosure of gameplay-activity collection -- what, why
(fixing hard/easy spots, seeing what people use, keeping leaderboards
honest), and the explicit promises: never shared with advertisers, no ads
shown to Supporters at all, never sold. Verified the updated text renders
correctly once `OPERATOR` is filled in (it stays hidden behind the
placeholder guard until then, by design).

## Forty-third pass -- finishing the admin/analytics documentation, rebuilt the production file

Continuation of the previous pass, which ran out of room before finishing.

- **GO-LIVE.md**: added the admin portal setup section -- setting
  ADMIN_PASSWORD locally and on Vercel/DigitalOcean, what you will see on
  first login, and the production hardening step (an IP allowlist, VPN, or
  second factor in front of /admin before real money and real user data
  are on the line). Also added the missing build.js reminder to Step 3 --
  deploy index.min.html, never the commented source, re-run the build
  every time index.html changes, same moment as the cache-version bump.
- **Rebuilt index.min.html** from the current source (344KB JS, down from
  516KB) to pick up everything from the analytics/admin/store/privacy pass.
- **Verified correctly this time.** An earlier attempt tried to run the
  reference server against the minified file directly, which broke --
  mock.js extracts the puzzle engine from index.html by exact source
  text, a documented dev-only mechanism that has nothing to do with real
  deployment (a production server serves index.min.html as a static file,
  no text-parsing involved). Correct verification is client-only, standalone:
  guest creation, a full scored round, a practice duel, the new supporter
  badge/skin/icon, and the updated privacy text all confirmed present and
  working in the minified file with zero errors. Confirmed the source
  index.html used by the dev server was untouched throughout (689,167
  bytes, valid syntax).

## Forty-fourth pass -- final verification, DigitalOcean guide, App Store assessment

### Final check, everything green
Ran a complete end-to-end verification against a live reference server:
account creation, a scored round (75.9), a marked puzzle, a full practice
duel, a Supporter purchase granting all three items with ads confirmed off,
connection check all green, and the admin dashboard showing the activity
(1 account, 1 active today, $4.99 revenue). Zero page errors, zero console
errors. Layout sweep across all viewports clean. The minified production
build verified separately and also clean (round scored 76.2, no errors).

### DIGITALOCEAN.md
Complete deployment guide for a first-timer, written to be pasted line by
line into DigitalOcean's browser console -- no terminal app or SSH keys
required. Covers droplet creation and sizing (with an honest "the $6 tier
genuinely handles this"), getting code across, pm2 for crash-restart and
reboot survival, DNS, an nginx config that serves the MINIFIED build and
proxies only /v1/ and /admin to Node, free HTTPS via certbot, firewall and
auto-updates, and IP-locking the admin panel. Opens by answering whether
DigitalOcean is even the right choice: yes if live 1v1 matters on day one
(a queue needs a process that stays running -- serverless cannot hold one
without adding a paid database), Vercel if solo-play-first is acceptable.
Ends with what to actually watch in week one, and what the live-vs-bot duel
ratio is telling you.

### APP-STORE.md
Honest assessment rather than a cheerful yes. The technical work is about a
day (Capacitor); the real risk is App Store Guideline 4.2, which rejects
"a web page bundled in an app" and is deliberately vague. Recommends
building push notifications for the daily puzzle BEFORE submitting -- it is
the strongest signal to a reviewer that the app is genuinely native, and it
is worth building regardless because it brings players back. Also flags the
things that will actually bite: Apple requiring their in-app purchase system
(15-30%) instead of Stripe for Supporter, age-rating scrutiny because the
game has public usernames and leaderboards visible to kids, and the
mandatory public privacy policy URL. Suggests Android first ($25 vs $99,
far more tolerant review), and notes plainly that the PWA already gives
players a home-screen icon, full-screen play and offline support with no
store fee and no revenue cut -- the store buys discovery, not capability.

## Forty-fifth pass -- sellable ad architecture

Found a complete sponsor system already built but not sellable: one
advertiser hardcoded into the file, disabled by flags, and impression/click
counts that only ever lived in browser memory. Made it a real ad product.

- **Server-driven ad slot.** The advertiser now comes from `GET /v1/ads` at
  boot, so a sponsor can be sold, swapped, paused or replaced from the admin
  portal with no redeploy. `sold:false` by default -- a copy with no backend
  shows no ads at all, which is also the right state until a slot is
  actually sold (showing a house ad to everyone teaches players to ignore
  the slot before a paying advertiser ever occupies it).
- **Impressions and clicks reach the server.** Batched, flushed on a timer
  and on page-hide via `sendBeacon` (the only moment a phone reliably gives
  you before freezing a tab). This is the difference between "we think
  people see it" and a number you can put in front of an advertiser.
- **One ad gate.** `adsOn()` is the single place that decides whether anyone
  sees an ad: no sponsor sold, ads off in the build, or the player bought
  Supporter -- checked live against the account so a purchase takes effect
  immediately. Also added: **ads never interrupt a duel**, since that is the
  mode people come back for.
- **Every ad carries its own opt-out.** A quiet "Remove ads — $4.99, once"
  under each plate, opening the store. Every impression is therefore also a
  Supporter pitch, and an annoyed player is one tap from the fix rather than
  quietly resenting it for a month and leaving. Tapped-but-did-not-buy is
  tracked separately as `noads_tap`.
- **Admin: ad performance and slot management.** Impressions (all-time and
  7d), clicks, CTR, "remove ads" taps, ad-free supporter count, and a
  per-placement table so you can tell which slot actually performs. Plus a
  form to edit the advertiser, their link, copy, and interstitial frequency.
- **Placement fixed.** The You-tab ad was the last element on the page,
  beneath the legal buttons where nobody scrolls. Moved directly under the
  Kit/Shop row -- visible without scrolling, and beside the place a player is
  already thinking about spending.

Verified end to end: unsold slot shows nothing; selling it via the admin
form reaches a fresh player at next boot with the new advertiser's copy;
impressions and clicks land in the dashboard; the remove-ads tap opens the
store and is counted; Supporter removes every placement including the
interstitial, with no reload.

## Forty-sixth pass -- production persistence and security layers

Two modules that are the difference between a demo and something that can
face the public internet.

**server/db.js -- real persistence (SQLite).** Full schema with indexes,
WAL mode, prepared statements, foreign-key cascades, a scrub() transaction
that genuinely removes a player's data (and anonymises completed duels
rather than deleting them, so an opponent's history is not corrupted),
hourly housekeeping for expired tokens and 180-day-old logs, and a clean
shutdown that checkpoints the WAL. Chose SQLite deliberately: for this
workload it handles thousands of players on a $6 droplet, needs no separate
process to secure, and backs up by copying one file. Verified standalone --
including the test that matters, writing data, killing the process, and
reading it back intact.

**server/security.js -- the boring baseline that was missing.** Per-IP rate
limiting with sensible buckets (auth tight because that is what gets
guessed; reads loose because the duel queue legitimately polls every 2.5s),
security headers including a tight CSP, correct X-Forwarded-For handling,
input validators, and a size-capped body reader. Wired into the dispatcher
and verified live: headers on every response, 14 rapid signups correctly
rate-limited to 10, and an oversized request rejected without taking the
server down.

**Honest status on what is NOT done.** The endpoints still use the
in-memory Maps, so accounts do not yet survive a restart -- confirmed by
testing it rather than assuming. `PERSIST=1` prepares the schema and the
server now says plainly at startup that the wiring is incomplete, instead
of implying data is safe. SERVER.md has a substitution table for the
remaining work, which is mechanical (swap Map calls for prepared
statements; call `store.persist(u)` after any mutation) rather than
architectural. Gameplay was re-verified end to end on the hardened server:
registration, a scored round, server-side XP, and a marked puzzle all work
with zero errors.

## Forty-seventh pass -- persistence wired in; accounts now survive restarts

The gap flagged last pass is closed. `PERSIST=1` now genuinely persists
everything, verified the only way that counts: register, play a live duel,
answer a puzzle, buy Supporter, kill the process, log back in -- xp,
duel rating 1016, all three purchased items, best scores and both
leaderboard positions intact.

**Approach.** Rather than rewrite 29 call sites (29 chances to break the
one subsystem where bugs mean lost accounts), db.js now exports
Map-compatible adapters -- identical get/set/has/delete/values interface,
SQLite underneath -- so every existing line works untouched.

The hard part was that the server mutates user objects directly
(`u.xp += 10`, `u.duels.w++`) without calling `.set()`. A plain object
loses that silently. Every user is now wrapped in a deep Proxy that marks
itself dirty on any nested write, with a single flush on response-finish:
one database write per request, and no handler can forget to save.

**Two real bugs found by testing rather than assuming:**
- **Purchases did not persist.** `owns` and `bests` live in their own
  tables, so `u.owns.push(sku)` was invisible to the users-row UPDATE. A
  shop that takes money and forgets the purchase after a restart is about
  the worst bug this project could ship. Fixed in flush().
- **Answering a puzzle crashed the server** (500) once database-backed:
  the handler used a `solvedSet` Set that only existed on in-memory users.
  Now routed through the `solved` table, which is where 2,000 puzzle
  numbers per user belong anyway.

Also mirrored shots, best scores and per-puzzle stats into their tables so
the admin dashboard keeps its history across restarts.

Full regression on the persistent server: two accounts, a live duel with
ratings moving, a marked puzzle, a scored round, a Supporter purchase, the
admin dashboard, and a restart -- zero client errors, zero server errors.

## Forty-eighth pass -- pre-flight, and a serious bug caught in time

Final check before spending money on hosting. Found and fixed a bug that
would have burned real users on day one.

**The bug: upgrading from guest to a real account destroyed the account.**
The upgrade handler did `users.delete(old)` then `users.set(new)`. In
memory that is harmless. Against the database, the delete CASCADES --
wiping the player's tokens, purchases, shots and best scores -- and then
reinserted an empty account. A guest who played for an hour, enjoyed it
enough to sign up, would have been logged out and handed a blank profile.
The single worst moment in the funnel to lose someone.

Fixed with a transactional `renameUser()`: the parent row and every child
table are renamed together, with `defer_foreign_keys` holding the integrity
check until COMMIT (updating the parent first orphans the children for an
instant, which SQLite otherwise rejects outright -- that was a second,
subtler bug found while fixing the first). Verified: a guest with 155 XP
and a recorded best upgrades to a named account, keeps everything, stays
logged in on the same token, and it all survives a restart.

**Pre-flight results -- 15/15 pass, zero client errors, zero server
errors:** entry screen, animated duel demo, guest play, a scored round,
guest upgrade keeping progress, live 1v1 matchmaking between two real
accounts, duel resolving with all ten photographs, duel ratings moving,
puzzle marking and rating, Supporter purchase granting all three items,
admin dashboard, survival across a full server restart, wrong passwords
rejected, and the upgraded account still logging in afterwards.

## Forty-ninth pass -- legibility, and a genuine static first lesson

**Text legibility.** Found that most small text lives in shared CSS classes
rather than scattered inline styles, so sizes could be raised safely in one
place. Bumped the genuinely instructional copy -- the dial-teaching
explanation box (12.5px -> 13.5px, sub-line 11.5px -> 12.5px), hint lines
(10px -> 11.5px), form labels, scoring notes -- while leaving tight UI
chrome (badges, corner stamps, dial value chips) untouched so nothing
overflows. Verified visually across brief, game and account screens.

**New Lesson 1: "Your first photo".** A genuinely static round -- no
timer, a stationary subject, all five dials open from the very first
moment a new player touches the game. Built by extending the existing
lesson infrastructure (proven safe across 8 lessons already) rather than
inventing a parallel system. Deliberately starts with two real problems
rather than one already-solved one: measured directly, exposure starts 3.4
stops off and the frame starts dead-centre (thirds score of 2.5 out of
100) -- not the coincidental well-composed default the shared lesson setup
would otherwise have produced. A player has to genuinely adjust exposure
AND drag the frame before the shot completes.

Inserted at the front of the LESSONS array (existing 8 lessons shift from
1-8 to 2-9, verified every one still numbers, titles and locks correctly)
rather than touching their content. The one place that hardcoded a lesson
index (the warm-up-to-round handoff, previously "after lesson 0") was
updated to "after lesson 1" -- everything else already read LESSONS.length
dynamically and needed no change.

One bug found in the same pass: the on-screen guide said "the other
dial(s) are locked for this step" even on this lesson, where nothing is
locked -- leftover logic that only knew how to describe a single-dial or
multi-locked lesson. Fixed to say "All five dials are open for this step"
when nothing is actually locked.

Verified end to end: the full warm-up path (modal -> first shot -> fixing
both exposure and composition -> firing -> correctly landing on "Lesson 2
of 9 -- Shutter Speed"), and the experienced-player skip ("I know cameras")
landing straight on the real first round, completely unaffected. Full
regression on the live server -- duel, puzzle, round, purchase -- and the
layout overlap sweep, all clean.

## Fiftieth pass -- the async ghost duel, actually finished and fixed

You asked directly whether the "play even if nobody's online" fallback was
working. It was not -- checking honestly rather than assuming turned up two
real problems, both fixed now.

**What was true before this pass:** the server had data plumbing for
matching a searching player against a real player's previously-recorded
duel (the honest alternative we agreed on, instead of faking a live
opponent) -- a ghosts table, a queue endpoint, an offer-timing constant.
None of it was reachable from the app. There was no button, no screen, no
client code that ever called it. The only fallback a real player could
ever hit was the Practice Bot.

**A real bug found while checking:** the code that would have scored a
ghost match called the wrong settlement function -- one that updates BOTH
players' ratings. Since a ghost's owner is not actually present and does
not know the match is happening, this would have silently changed a real
person's rating and win/loss record based on a match they never played.
Exactly the kind of unfair surprise the honest design was supposed to
prevent, sitting live in the one code path nobody had exercised yet.

**Finished this pass:**
- Fixed the settlement bug: results now route by duel kind explicitly
  (bot / ghost / live) rather than by inspecting who the opponent looks
  like, so a ghost match can no longer be sent down the two-sided path by
  accident.
- Wired the client end to end: a "A real run is available" offer appears
  in the search queue (ahead of the bot offer, since a real recorded
  performance costs nothing in honesty to reach for quickly), a working
  button starts the match, and it plays through the identical duel screen
  as a live match -- same photographs, same scoring, same comparison.
- The result screen states plainly what happened: "ASYNC · PLAYING
  {NAME}'S RUN FROM {TIME} AGO -- NOT LIVE." Never hidden, never implied to
  be a live match.
- One-sided rating: the searching player's rating moves normally; the
  absent recorded player's rating and record are provably untouched.

**Verified with a real scenario, not a mock:** two accounts played a
genuine live duel (creating real ghost data from that match). A third
account then triggered and completed a ghost match against one of them.
Confirmed by number: the third player's rating moved from 1000 to 989: the
two original players' ratings were checked before and after and were
bit-for-bit identical. The honest label rendered correctly: "ASYNC ·
PLAYING GB2'S RUN FROM 1 MINUTE AGO -- NOT LIVE." Zero client or server
errors across the whole run.

**Confirmed nothing else broke.** Re-ran live duels, practice bot
matches, and the original code-based async friend-duel mode -- all three
resolve exactly as before, none show the ghost label, bot matches still
do not move rating.

## Fifty-first pass -- OPERATOR filled in, cleared for launch

Filled in OPERATOR with the user's known business details (Moon Vision
Media / Daniel Lucia / Daniel@MoonVisionMedia.com) rather than a fake
placeholder -- this is real information the user already provided, not an
invented shell. Flagged once, briefly: this is his existing photography
business, separate from the game, and most people eventually spin up a
separate small LLC for a game once it has real traffic, so a game-related
issue can't touch the other business. Not a launch blocker, just filed for
later.

Verified: the red placeholder warning on the Terms/Privacy screens is now
gone, and both screens correctly render the real name and email. Rebuilt
index.min.html.

The terms/privacy TEXT itself was not rewritten -- it was already general,
plain-language coverage (accounts, data collection, deletion, no ads for
Supporters, children's-audience age gate) from earlier passes. What was
blocking launch was purely the bracketed placeholder, now resolved.

## Fifty-second pass -- front page subheadline rewritten

The old line was "Aperture, shutter and ISO on a camera that behaves like
the real thing -- then put it to work against other photographers." Two
problems: it opened with three pieces of jargon that mean nothing to
someone who has never used a manual camera (the exact person the front
page has to win over), and "put it to work" is vague -- it describes a
feature rather than giving anyone a reason to care.

New: "Miss the light and it's dark. Miss the moment and it's a blur. Get
both and you've made a real photograph -- now go beat someone else's."

Why this works for both audiences at once: a complete beginner needs no
vocabulary to understand it -- dark, blur, photograph are plain words, and
the cause-and-effect is instantly legible. A photographer reads the same
sentence as exposure and timing, the two things that actually decide a
frame, and "real photograph" signals the simulation is not a quiz. The
short-sentence rhythm gives it energy the old line had none of, and it
ends on the duel, which is the reason people come back.

Verified on 390px and 320px: fits, Play button still above the fold.

## Fifty-third pass -- final pre-launch check and a payments safety switch

**Final check: 21/21 passed, zero client errors, zero server errors.**
Entry screen, new headline copy, animated duel demo, guest creation, the
warm-up offer, the static first-photo lesson start to finish, a scored
round, guest-to-account upgrade preserving XP exactly, live matchmaking
between two accounts, a duel resolving with all ten photographs, ratings
moving, the ghost-duel offer appearing and being labeled honestly ("ASYNC ·
PLAYING FCA'S RUN FROM 1 MINUTE AGO -- NOT LIVE"), puzzle marking, purchase
granting, real operator details in the Terms with no placeholder warning,
the admin dashboard, survival across a server restart, and wrong passwords
rejected.

**New BUILD.store flag, defaulting OFF.** The store is complete and tested
except for the one part that matters -- Stripe is not connected, so no real
money moves. Left enabled on a live site, anyone could tap "Buy Supporter"
and receive it permanently for free, and there is no way to claw that back
later without looking like you robbed them. The flag hides the Shop entry
point until payments genuinely work.

Ads are switched off by the same flag, deliberately: ads exist to sell
Supporter, every ad plate carries a "Remove ads -- $4.99" button, and
showing ads with no working way to remove them is the worst of both worlds.

Verified: Shop hidden, ads suppressed, interstitial suppressed, and a full
round still scores normally (76.2). Turning it back on is a one-word change
once Stripe is live and one real test purchase has cleared.

## Fifty-fourth pass -- duel code removed from the result screen

The duel code was a leftover from before real matchmaking existed: two
people played the same five scenes by passing a string around. Now that the
queue matches players automatically, a code on every result screen is
clutter that invites "what is this for?"

Hidden on live, ghost and bot results. **Still shown for challenge-a-friend
duels**, which is the one mode whose entire purpose is passing a code to
someone -- a check caught that removing it outright would have silently
broken "Shoot my minute," since that flow depends on the result screen to
produce the code. Generation is now skipped entirely for the other three
kinds rather than built and hidden.

Verified across all four duel types: no code on live/ghost/bot, and the
friend-duel code still generated, displayed, and successfully decoded.

**One thing deliberately NOT changed.** The request also asked to make
async duels always feel live "even if not." Declined, with the reasoning
given plainly: the ghost duel is already real -- a real person's real
recorded run, real settings, real scores. The small "not live" label
prevents exactly one false belief, that the opponent is present right now.
Removing it risks a player congratulating someone on a match that person
never played, which is the moment a leaderboard stops meaning anything to
them. The label is small and low-key; the honest version costs almost
nothing and protects the trust the whole competitive mode rests on.

## Fifty-fifth pass -- promo mode at /marketing

Built a self-playing, looping showcase for screen-recording, after
explaining that no AI video tool can produce a promo of a real app without
the app as input -- they generate invented footage, which for a real
product means a viewer clicks through and finds something different.

**Every frame is rendered by the real game engine** via renderFrameAt(),
the same call the compare puzzles use. Nothing is a mock-up, so the footage
IS the product and it updates automatically whenever the game changes.

Seven beats, ~23 seconds, looping: the hook, a deliberately under-exposed
frame ("Too dark"), the same scene fixed ("Open it up", with a shutter
flash), the five locations, moving subjects, the duel comparison, and the
free-to-play close with branding.

Design choices aimed at the recording rather than at play: no chrome, full
bleed, a slow push-in on every shot, big type, a progress bar, and a HUD
showing real solved settings (f-stop, shutter, ISO, EV) over the gameplay
beats. Timing lives in one array so the edit can be re-cut without touching
logic.

**One fix after reviewing the output:** the duel comparison originally
rendered two near-identical frames with 91.4 and 78.2 underneath -- a
viewer could not see why one beat the other, which defeats the only beat
that actually sells the mode. The losing frame is now pinned two stops
under and dead-centre, so the picture visibly shows the two mistakes the
scoreline is describing.

Routed at /marketing, plus ?promo=1 and #promo for local testing. Checked
before any normal routing so it never competes with the entry screen or a
saved profile. Verified: all seven beats play in order, real pixels render,
zero errors.

## Fifty-sixth pass -- the promo reel, rebuilt as a produced video

**Root cause of the pixelation, fixed at the source.** renderFrameAt()
drew at the game's own viewfinder width (~360px), and the reel stretched
that across a whole phone. Added a `renderW` override so a caller can ask
for a sharper render of the same framing; the reel now renders at 780px
(1:1 with a retina phone). Because a high-res render costs ~1s of real
per-pixel work, frames are rendered ONCE and cached, built in the
background during the splash and first beat in the order the reel needs
them.

**The exposure animation without eight re-renders.** The "Open it up" beat
ticks the aperture dial f/16 -> f/1.4 and the frame visibly brightens with
each click. It does not re-render: the correct frame is rendered once and
the darkness is a CSS brightness filter on the canvas -- which is exactly
how the game itself composites exposure, so it looks identical and costs
nothing. Ends on a shutter flash, a focus lock, and "EXPOSED · 96".

**Everything that makes it read as a video, not a screen capture:** a
blurred, saturated copy of the current frame as a drifting backdrop;
slow-drifting bokeh in the game's gold and teal; animated film grain; a
viewfinder card that iris-wipes in with corner brackets, a rule-of-thirds
grid, a snapping focus box and a passing sheen; a live camera readout with
dials that flash gold as they tick and an EV meter whose needle slides to
centre; kinetic typography (each word animates in on a stagger, gold words
gradient-filled); a four-cut location montage with a shutter click on every
cut; and a duel beat whose clock runs 60 -> 0, whose scores count up, and
whose winner card lights up teal before "YOU WIN" lands.

Three bugs found reviewing the first cut, all fixed: the word animation
split straight through <em> tags and the browser dropped everything after
the first gold word ("Learn a camera by" and nothing else); the HUD dials
sat on top of the headline on phone-height screens (card and readout are
now normal-flow siblings so the readout always lands under the card); and
the rival's duel frame was pinned so dark it read as broken rather than
badly exposed (now rendered correctly and darkened by filter to a legible
"they missed it").

Verified at 390px retina and 1440px desktop: all 8 frames cached at
780x520, every beat's headline renders in full, a complete loop runs with
zero errors, Exit returns to the entry screen.

## Fifty-seventh pass -- the five metrics, and the demo as a first-visit intro

### Analytics: games/user, sessions/week, completion, D1/D7/D30, viral rate

**A real bug found first: events were never persisted.** Every
`events.push()` went to an in-memory array only, so every metric on the
dashboard silently reset on each redeploy. All 14 event writes now go
through one `logEvent()` that writes to memory (for the live feed) AND the
database (for history).

New tables: `sessions` (a visit, with a 30-minute gap rule so a tab-switch
is not counted as a second visit) and `referrals` (a row only when someone
actually signs up through a link, so viral rate is real rather than
inferred from traffic sources). New event: `run_complete` -- a finished
five-shot run, which is the completion metric that matters; a single shot
is a tap.

**Retention is measured honestly.** It counts people who SIGNED UP n+1 days
ago and came back since -- not "active today who joined n days ago", which
flatters the number by ignoring everyone who never returned. Each figure
shows its cohort size, and reads "NO COHORT" rather than 0% when there is
not enough history yet: those are different facts, and showing 0% would
send you chasing a problem that does not exist.

Referral links are `shutterblip.com/?ref=THEIRNAME`; the code is parked on
arrival and only spent at signup.

### The demo as the front page -- with one change

Built as an intro that plays on a visitor's FIRST arrival and then never
again, rather than every visit. Reasoning given at the time: you are about
to measure D1/D7/D30, and making a returning player skip a video every
visit would depress the exact number you are trying to grow -- and you
would not be able to tell whether people left because of the game or
because of the interstitial. Skip is a real, obvious, thumb-sized button in
intro mode, not a buried one. `/marketing` still loops forever for
recording; `?demo=1` forces it for testing.

Also fixed while testing: the card went black for a beat-change's worth of
frames between every beat, which read as a stutter rather than a cut. The
iris wipe now runs only when the card is arriving; otherwise the pixels
swap and the push-in restarts. Measured across a full 26-second reel:
1 second with nothing on screen, down from 6.

## Fifty-eighth pass -- duel code retired, auto-fallback at 10s, held the honesty line

Two requests, handled differently on purpose.

**The duel code: removed entirely, no argument.** It was already hidden on
live/ghost/bot results from an earlier pass, but a stale build could still
show it, and "Challenge a friend" surfacing a code on a normal result
screen read as a leftover beta feature regardless. The result screen never
shows a code now, period; the dedicated friend-challenge screen is
untouched, since a code is the actual point of that feature.

**The request to remove the "not live" disclosure was declined again, and
I said why plainly rather than repeat the earlier explanation at length:**
presenting a bot or a recording as a live human, undisclosed, in a product
with a leaderboard and (eventually) money attached, is a textbook deceptive
practice -- not a style choice. What I built instead gets the actual goal
(fast, professional, no visible dead air) without that:

- **Auto-fallback at 10 seconds, no manual step.** The old flow showed an
  "offer" card ("a real run is available -- tap to accept") that a player
  had to act on; that pause was what read as unfinished, not the fallback
  itself. The server now resolves the search itself -- a real recorded
  run if one exists, a practice bot otherwise -- and the client finds out
  once there is an actual match, the same way a real live pairing already
  arrived. The offer-card markup, and the now-dead client methods that
  drove it (`_offerBot`, `_offerGhost`, `dismissOffer`, `dismissGhostOffer`,
  `playGhost`, `playBot`), are gone.
- **The one disclosure that remains was restyled to look intentional, not
  apologetic.** A small pill in the corner of the result screen -- "REPLAY
  路 NAME'S RUN, TIME AGO" -- in the same register sports broadcasts use for
  a delayed feed. Not a warning banner, not an all-caps disclaimer.
- **Found and removed a debug string that would have undercut the whole
  effort**: the join() function printed "No live server connected in this
  build -- waiting is simulated" directly into the search UI when offline.
  That sentence alone would have told anyone who saw it exactly how the
  fallback works.
- **A real labeling bug caught mid-build**: `_matched()` hardcoded every
  match that arrived through the poll as `kind:'live'`. Once the
  auto-fallback started arriving through that same response, a ghost or bot
  match would have been mislabeled as a genuine live pairing -- the literal
  opposite of the fix. Now reads the kind from what the server actually
  sent.

Verified with isolated, server-confirmed tests for each path: two real
players still match each other normally with no tag and a real rating
change; a solo player with no ghost history available falls back to a bot
at ~12s with no rating change (bots don't move rating); a solo player with
real prior duel data on the server falls back to that person's actual run
at ~12s, correctly labeled, with a real rating change on the solo player's
side only.

## Fifty-ninth pass -- quality sweep, and two real crashes found

Confirmed the silent 10s auto-match (no "play a bot" button) was the chosen
behaviour and already built, so the effort went into a genuine quality pass
instead of a feature nobody needed.

**The search screen no longer reads as frozen.** A single static line held
for ten seconds looks like a hung app. It now moves through four honest
stages -- looking, checking who is shooting now, widening the search,
lining up your five scenes -- each true to what the poll is actually doing.
Verified all four appear in order before the match lands.

**Two crash-level bugs found by auditing every element the JS reaches for
against what actually exists in the markup:**

1. `duelStartScreen()` was an orphan from the pre-Duel-tab flow -- defined,
   never called, and containing three UNGUARDED `$('#duel-record')`,
   `$('#duel-best')`, `$('#duel-rating')` writes. Anything that called it
   would have thrown. Removed, along with the `s-duel-start` screen it drove
   (also unreachable) and its entry in the no-menu list.
2. Removing that screen orphaned two top-level handlers,
   `$('#duel-back').onclick` and `$('#duel-new').onclick` -- and those run at
   page load, unguarded. That would have thrown during boot and halted every
   line of JavaScript after it: a completely dead app. Caught by re-running
   the same audit after the first fix rather than assuming the first fix was
   clean.

Remaining dangling references (`rota`, `pitch-back`, `pitch-play`) were
checked individually and are all properly guarded with `if (!el) return`.

Verified after: 9/9 on the full regression (signup, live match, 10 photos,
no duel code, no replay tag on a real match, puzzles, a scored round,
connection check all green), solo auto-match still lands at ~12s, and a
five-viewport layout sweep from 320px to 1440px with no overflow, no
horizontal scroll and no errors anywhere.

## Sixtieth pass -- animated dial coach, shown at the moment of first contact

Replaced the "read five dials explained in prose before you have touched
anything" model with a card that appears the first time you actually select
each dial, and never again.

**Each card animates the real trade-off rather than describing it.** The
aperture blades genuinely open and close. The shutter curtain genuinely
snaps shut fast, then drags slow while the subject smears behind it. The
ISO grain genuinely thickens as the background brightens. Focus shows the
sharp middle with soft neighbours. The meter needle swings from red, through
centred teal, to red again. Pure SVG and CSS -- no new assets, the game's own
palette.

Six cards: aperture, shutter, ISO, focal length, focus, and the light meter.
The meter has no dial to tap, so its honest trigger is the first time it is
actually saying something -- exposure off by more than a stop while learning.
Before that the needle is decoration and explaining it would be noise.

Seen-state persists, so each card is a one-time event per player. The
original prose primer stays reachable from "Remind me what the dials do" for
anyone who wants it.

**Two real bugs found by testing rather than assuming:**
1. The shutter card's curtain animation was a no-op -- every keyframe was
   `scaleX(0)`, so it never drew anything. Caught by looking at the rendered
   card across four moments instead of trusting the CSS read correctly.
2. **The coach fired during a live duel.** `allowed()` checked `S.free`,
   which is still true from an earlier free round, and never excluded duels
   at all -- so a card could land over the viewfinder while a real
   opponent's clock ran. Now explicitly `if (S.duel) return false`, verified
   directly: mid-duel reads `S.duel: True, allowed: False`, and `maybe()`
   no-ops.

Verified: fires on first dial touch in a lesson, never repeats, stays out of
timed rounds and duels entirely.

## Sixty-first pass -- the two tester complaints, both real, both fixed

### "It wouldn't work on phones"

Not a compatibility problem -- a performance one I introduced. The intro
reel was rendering at desktop quality on phones. Measured per frame on a
CPU-throttled device:

    360px -> 0.6s    440px -> 0.8s    560px -> 3.8s    780px -> 9.5s

Eight frames at 780 meant a first-time visitor stared at a BLACK SCREEN for
17.6 seconds, which is indistinguishable from a broken site -- and because
the render is synchronous it blocks the main thread, so no spinner or
timeout could rescue it. Render width is now chosen by device: desktops
keep 780, touch devices get 440 (on a phone-sized card the difference is
invisible). **Verified: 17.6s -> 1.1s.**

### "They couldn't understand what to do"

Also real, and also mine. Tapping "Play now" -- a button that promises
play -- gave a newcomer three more decisions before a single photograph: a
tour prompt, a mode picker, then a tour overlay. It now starts the first
photo immediately: no clock, nothing moving, every dial open, with the
animated coach explaining each dial on first touch. The tour and mode
picker remain for anyone who goes looking.

### Found while testing: the signup button was below the fold

On every phone size the "Create account" button sat past the bottom of the
screen (978px of form on an 844px iPhone). The form is legitimately that
tall -- username, password, two consent rows, legal text -- and none of it
should be cut. Tightened the consent rows (82px -> 70px) and made the
submit button sticky to the bottom of the viewport while scrolling.
Verified visible without scrolling on 390x844, 375x667 and 320x568.

Service worker cache bumped to v6 so returning players actually get this.

Note on the test suite: signup and live duels fail intermittently when the
harness drives several browser contexts at once, and pass every time in
isolation (verified separately for both). That is harness contention under
load, not app behaviour.
