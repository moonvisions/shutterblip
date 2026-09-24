/* ShutterBlip — persistence.
 *
 * The reference server kept everything in Maps, which meant a restart wiped
 * every account. That is fine for a demo and disqualifying for real users.
 * This is a real database: SQLite, one file on disk, WAL mode so reads never
 * block writes.
 *
 * Why SQLite and not Postgres: for a game this size it is genuinely the
 * right answer, not a compromise. It handles thousands of concurrent players
 * on a $6 droplet, needs no separate process to run or secure, and backs up
 * by copying one file. Move to Postgres when you outgrow a single machine —
 * the query shapes here port over almost unchanged.
 *
 * Everything is synchronous on purpose. better-sqlite3 is synchronous by
 * design, and for this workload a query takes microseconds; async would add
 * complexity and bugs to buy nothing.
 */
'use strict';
const path = require('path');
const fs = require('fs');

let Database;
try { Database = require('better-sqlite3'); }
catch (e) {
  console.error('\nbetter-sqlite3 is not installed. Run:  npm install better-sqlite3\n');
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'shutterblip.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');     // readers never block the writer
db.pragma('synchronous = NORMAL');   // durable enough, far faster than FULL
db.pragma('foreign_keys = ON');

/* ---------------------------------------------------------------------
   Schema. `schema_version` lets you migrate safely later instead of
   guessing what shape an old database is in.
   --------------------------------------------------------------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  handle_lower   TEXT PRIMARY KEY,
  handle         TEXT NOT NULL,
  email          TEXT,
  name           TEXT,
  birth_year     INTEGER,
  guest          INTEGER NOT NULL DEFAULT 0,
  salt           TEXT NOT NULL,
  pw             TEXT NOT NULL,
  recovery_hash  TEXT,
  google_sub     TEXT UNIQUE,
  created_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL,
  xp             INTEGER NOT NULL DEFAULT 0,
  blips          INTEGER NOT NULL DEFAULT 0,
  live_practiced INTEGER NOT NULL DEFAULT 0,
  duel_rating    INTEGER NOT NULL DEFAULT 1000,
  duel_w         INTEGER NOT NULL DEFAULT 0,
  duel_l         INTEGER NOT NULL DEFAULT 0,
  duel_t         INTEGER NOT NULL DEFAULT 0,
  pz_next        INTEGER NOT NULL DEFAULT 1,
  pz_rating      INTEGER NOT NULL DEFAULT 800,
  pz_solved      INTEGER NOT NULL DEFAULT 0,
  pz_attempted   INTEGER NOT NULL DEFAULT 0,
  pz_streak      INTEGER NOT NULL DEFAULT 0,
  pz_best_streak INTEGER NOT NULL DEFAULT 0,
  equipped_json  TEXT,
  consent_json   TEXT,
  banned         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_lastseen  ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_users_created   ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_duelrate  ON users(duel_rating);

CREATE TABLE IF NOT EXISTS tokens (
  token        TEXT PRIMARY KEY,
  handle_lower TEXT NOT NULL REFERENCES users(handle_lower) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_handle ON tokens(handle_lower);
CREATE INDEX IF NOT EXISTS idx_tokens_exp    ON tokens(expires_at);

CREATE TABLE IF NOT EXISTS owns (
  handle_lower TEXT NOT NULL REFERENCES users(handle_lower) ON DELETE CASCADE,
  sku          TEXT NOT NULL,
  granted_at   INTEGER NOT NULL,
  PRIMARY KEY (handle_lower, sku)
);

CREATE TABLE IF NOT EXISTS bests (
  handle_lower TEXT NOT NULL REFERENCES users(handle_lower) ON DELETE CASCADE,
  level_id     TEXT NOT NULL,
  score        REAL NOT NULL,
  PRIMARY KEY (handle_lower, level_id)
);

CREATE TABLE IF NOT EXISTS shots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  handle_lower TEXT NOT NULL REFERENCES users(handle_lower) ON DELETE CASCADE,
  level_id     TEXT NOT NULL,
  score        REAL NOT NULL,
  at           INTEGER NOT NULL,
  day          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shots_day    ON shots(day);
CREATE INDEX IF NOT EXISTS idx_shots_level  ON shots(level_id);
CREATE INDEX IF NOT EXISTS idx_shots_handle ON shots(handle_lower);

CREATE TABLE IF NOT EXISTS solved (
  handle_lower TEXT NOT NULL REFERENCES users(handle_lower) ON DELETE CASCADE,
  n            INTEGER NOT NULL,
  PRIMARY KEY (handle_lower, n)
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,
  handle_lower TEXT,
  at           INTEGER NOT NULL,
  meta_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_at   ON events(at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS ad_events (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  kind  TEXT NOT NULL,
  slot  TEXT,
  sku   TEXT,
  at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adev_at ON ad_events(at);

CREATE TABLE IF NOT EXISTS puzzle_stats (
  n        INTEGER PRIMARY KEY,
  template TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct  INTEGER NOT NULL DEFAULT 0
);

-- Completed duels. Kept so an opponent's history stays intact even after
-- the other player deletes their account (their side is anonymised, the
-- match still happened).
CREATE TABLE IF NOT EXISTS duels_done (
  id        TEXT PRIMARY KEY,
  seed      INTEGER NOT NULL,
  kind      TEXT NOT NULL,
  player_a  TEXT,
  player_b  TEXT,
  score_a   REAL,
  score_b   REAL,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_duels_at ON duels_done(at);

/* Ghosts: the actual five-scene rows from a completed LIVE duel (never a
   bot duel -- there is no honest ghost of a bot), kept so a later player
   can be matched against a real person's real performance when nobody is
   online to match live. Always served labelled as what it is: a real run,
   from a real time in the past, never presented as happening right now.
   One ghost kept per player at a time -- their most recent -- so the pool
   stays fresh rather than accumulating every duel anyone has ever played. */
/* Sessions. A "session" is a visit: opened the app, did things, went away.
   Recorded as its own row rather than inferred from event gaps, because
   sessions/week is a headline metric and inferring it from timestamps gets
   fragile the moment someone leaves a tab open overnight. */
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  handle_lower TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  last_beat_at INTEGER NOT NULL,
  day          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_handle ON sessions(handle_lower);
CREATE INDEX IF NOT EXISTS idx_sessions_start  ON sessions(started_at);

/* Referrals. Who invited whom, so viral rate is a real number rather than
   a guess from traffic sources. A row exists only when someone actually
   signed up through a link. */
CREATE TABLE IF NOT EXISTS referrals (
  invitee_lower TEXT PRIMARY KEY,
  referrer      TEXT NOT NULL,
  at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals(referrer);

CREATE TABLE IF NOT EXISTS ghosts (
  handle_lower   TEXT PRIMARY KEY REFERENCES users(handle_lower) ON DELETE CASCADE,
  handle         TEXT NOT NULL,
  seed           INTEGER NOT NULL,
  rows_json      TEXT NOT NULL,
  avg_score      REAL NOT NULL,
  rating_at_play INTEGER NOT NULL,
  played_at      INTEGER NOT NULL
);
`);

const cur = db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get();
if (!cur) db.prepare(`INSERT INTO meta (key,value) VALUES ('schema_version','1')`).run();

/* ---------------------------------------------------------------------
   MIGRATIONS.

   CREATE TABLE IF NOT EXISTS above builds a correct database from nothing.
   It does absolutely nothing to a database that already exists with real
   players in it -- which, now that this is live, is the only case that
   matters. Adding a column to the block above and shipping it would give
   every new install the column and every EXISTING install a stream of "no
   such column" errors.

   So: additive migrations only, each one checked against what is actually
   in the file rather than against a version number we hope is accurate. No
   drops, no renames, no rewrites. A column that already exists is skipped
   silently; a fresh database gets the same columns by the same path.
   --------------------------------------------------------------------- */
function columns(table){
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name)); }
  catch(e){ return new Set(); }
}
function addColumn(table, name, decl){
  if (columns(table).has(name)) return false;
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`); return true; }
  catch(e){ console.error('migration: could not add ' + table + '.' + name + ' — ' + e.message); return false; }
}

/* Where a session happened and what o'clock it was for the player.

   `local_hour` and `local_dow` are STORED, not derived at query time, and
   that is deliberate: SQLite has no idea what "America/Denver" means, so
   the only way to ask "when do people play" in their own evening rather
   than the server's is to work the local clock out once, in Node, at the
   moment the session opens, and keep the answer.

   `country` is derived from the timezone, never from the IP address. See
   server/geo.js for why, and keep the privacy policy in step with it. */
const migrated = [
  addColumn('sessions', 'tz',         'TEXT'),
  addColumn('sessions', 'country',    'TEXT'),
  addColumn('sessions', 'lang',       'TEXT'),
  addColumn('sessions', 'device',     'TEXT'),
  addColumn('sessions', 'local_hour', 'INTEGER'),
  addColumn('sessions', 'local_dow',  'INTEGER'),
  // Last known, on the player record, so "who plays from where" does not
  // need a scan over every session that player has ever had.
  addColumn('users', 'tz',      'TEXT'),
  addColumn('users', 'country', 'TEXT'),
  addColumn('users', 'lang',    'TEXT'),
  addColumn('users', 'device',  'TEXT')
].filter(Boolean).length;
if (migrated) console.log('db: added ' + migrated + ' column(s) for location and time-played analytics');

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_country ON sessions(country);
           CREATE INDEX IF NOT EXISTS idx_sessions_beat    ON sessions(last_beat_at);
           CREATE INDEX IF NOT EXISTS idx_users_country    ON users(country);`);
} catch(e){}

/* ---------------------------------------------------------------------
   Statements, prepared once. Preparing per call is the single easiest way
   to make SQLite slow.
   --------------------------------------------------------------------- */
const S = {
  userByHandle: db.prepare(`SELECT * FROM users WHERE handle_lower = ?`),
  userByEmail:  db.prepare(`SELECT * FROM users WHERE lower(email) = ?`),
  userByGoogle: db.prepare(`SELECT * FROM users WHERE google_sub = ?`),
  allUsers:     db.prepare(`SELECT * FROM users`),
  countUsers:   db.prepare(`SELECT COUNT(*) c FROM users WHERE guest = ?`),
  activeSince:  db.prepare(`SELECT COUNT(*) c FROM users WHERE last_seen_at >= ?`),
  insertUser:   db.prepare(`INSERT INTO users
    (handle_lower,handle,email,name,birth_year,guest,salt,pw,recovery_hash,google_sub,
     created_at,last_seen_at,xp,blips,live_practiced,duel_rating,duel_w,duel_l,duel_t,
     pz_next,pz_rating,pz_solved,pz_attempted,pz_streak,pz_best_streak,equipped_json,consent_json)
    VALUES (@handle_lower,@handle,@email,@name,@birth_year,@guest,@salt,@pw,@recovery_hash,@google_sub,
     @created_at,@last_seen_at,@xp,@blips,@live_practiced,@duel_rating,@duel_w,@duel_l,@duel_t,
     @pz_next,@pz_rating,@pz_solved,@pz_attempted,@pz_streak,@pz_best_streak,@equipped_json,@consent_json)`),
  touchSeen:    db.prepare(`UPDATE users SET last_seen_at = ? WHERE handle_lower = ?`),
  deleteUser:   db.prepare(`DELETE FROM users WHERE handle_lower = ?`),
  /* Sessions have no foreign key to users -- deliberately, so that a row
     recording "somebody visited" survives the odd inconsistency. The cost
     is that they do NOT cascade, so a deleted account would leave its
     visit history, time zone, country and device type sitting in this
     table forever. The privacy policy promises otherwise, so deletion
     calls this explicitly. */
  deleteSessions: db.prepare(`DELETE FROM sessions WHERE handle_lower = ?`),
  setBanned:    db.prepare(`UPDATE users SET banned = ? WHERE handle_lower = ?`),

  addToken:     db.prepare(`INSERT OR REPLACE INTO tokens (token,handle_lower,created_at,expires_at) VALUES (?,?,?,?)`),
  getToken:     db.prepare(`SELECT * FROM tokens WHERE token = ?`),
  dropToken:    db.prepare(`DELETE FROM tokens WHERE token = ?`),
  // Slides the expiry forward on use, so an active player is never signed
  // out. See TOKEN_TTL for why this exists.
  touchToken:   db.prepare(`UPDATE tokens SET expires_at = ? WHERE token = ?`),
  dropUserTokens: db.prepare(`DELETE FROM tokens WHERE handle_lower = ?`),
  pruneTokens:  db.prepare(`DELETE FROM tokens WHERE expires_at < ?`),

  grant:        db.prepare(`INSERT OR IGNORE INTO owns (handle_lower,sku,granted_at) VALUES (?,?,?)`),
  ownsOf:       db.prepare(`SELECT sku FROM owns WHERE handle_lower = ?`),
  countOwners:  db.prepare(`SELECT COUNT(DISTINCT handle_lower) c FROM owns WHERE sku = ?`),

  setBest:      db.prepare(`INSERT INTO bests (handle_lower,level_id,score) VALUES (?,?,?)
                            ON CONFLICT(handle_lower,level_id) DO UPDATE SET score=excluded.score
                            WHERE excluded.score > bests.score`),
  bestsOf:      db.prepare(`SELECT level_id, score FROM bests WHERE handle_lower = ?`),

  addShot:      db.prepare(`INSERT INTO shots (handle_lower,level_id,score,at,day) VALUES (?,?,?,?,?)`),
  countShots:   db.prepare(`SELECT COUNT(*) c FROM shots`),
  shotsOfUser:  db.prepare(`SELECT COUNT(*) c FROM shots WHERE handle_lower = ?`),
  // Every shot a player has taken, for their own data export.
  shotsListOf:  db.prepare(`SELECT level_id AS levelId, score, at FROM shots
    WHERE handle_lower = ? ORDER BY at DESC LIMIT 20000`),
  // Progression funnel: players with any best in a location, and players
  // with every one of its five rounds at the clearing grade or better.
  funnelReached: db.prepare(`
    SELECT substr(level_id, 1, instr(level_id, '-') - 1) loc, COUNT(DISTINCT handle_lower) n
    FROM bests WHERE instr(level_id, '-') > 0 GROUP BY loc`),
  funnelCleared: db.prepare(`
    SELECT loc, COUNT(*) n FROM (
      SELECT handle_lower, substr(level_id, 1, instr(level_id, '-') - 1) loc,
             SUM(CASE WHEN score >= ? THEN 1 ELSE 0 END) good
      FROM bests WHERE instr(level_id, '-') > 0 GROUP BY handle_lower, loc)
    WHERE good >= 5 GROUP BY loc`),
  /* The highest guest number actually in use, so the counter can be seeded
     at boot instead of restarting from 1000 and colliding with a real
     player. GLOB, not LIKE: it is case-sensitive and, with [0-9]*, will not
     match a registered account that merely begins with the word "guest". */
  maxGuestNumber: db.prepare(`
    SELECT MAX(CAST(SUBSTR(handle, 6) AS INTEGER)) n FROM users
    WHERE handle GLOB 'Guest[0-9]*'`),

  markSolved:   db.prepare(`INSERT OR IGNORE INTO solved (handle_lower,n) VALUES (?,?)`),
  isSolved:     db.prepare(`SELECT 1 FROM solved WHERE handle_lower = ? AND n = ?`),

  addEvent:     db.prepare(`INSERT INTO events (type,handle_lower,at,meta_json) VALUES (?,?,?,?)`),
  // By time, not by row id. They usually agree, but a backfill or an import
  // writes rows out of order and the activity feed then reads as nonsense --
  // 08:46 above 08:37 above 08:42.
  recentEvents: db.prepare(`SELECT * FROM events ORDER BY at DESC LIMIT ?`),
  /* The feed, minus individual shots. One player working through a round
     produces a dozen `shot` rows in as many minutes, which buries every
     signup, duel and purchase under a wall of one player's afternoon.
     Shots are still recorded and still counted everywhere else -- they are
     simply not what a live feed is for. */
  recentNotable: db.prepare(`SELECT * FROM events
    WHERE type NOT IN ('shot','puzzle_answer') ORDER BY at DESC LIMIT ?`),
  eventsSince:  db.prepare(`SELECT * FROM events WHERE at >= ?`),
  countEventType: db.prepare(`SELECT COUNT(*) c FROM events WHERE type = ? AND at >= ?`),
  pruneEvents:  db.prepare(`DELETE FROM events WHERE at < ?`),

  addAdEvent:   db.prepare(`INSERT INTO ad_events (kind,slot,sku,at) VALUES (?,?,?,?)`),
  adAgg:        db.prepare(`SELECT kind, slot, COUNT(*) c FROM ad_events GROUP BY kind, slot`),
  adCountSince: db.prepare(`SELECT COUNT(*) c FROM ad_events WHERE kind = ? AND at >= ?`),
  adCount:      db.prepare(`SELECT COUNT(*) c FROM ad_events WHERE kind = ?`),
  pruneAdEvents: db.prepare(`DELETE FROM ad_events WHERE at < ?`),

  bumpPuzzle:   db.prepare(`INSERT INTO puzzle_stats (n,template,attempts,correct) VALUES (?,?,1,?)
                            ON CONFLICT(n) DO UPDATE SET attempts = attempts + 1, correct = correct + excluded.correct`),
  puzzleAgg:    db.prepare(`SELECT template, SUM(attempts) a, SUM(correct) c FROM puzzle_stats
                            WHERE template IS NOT NULL GROUP BY template HAVING a >= 3 ORDER BY (CAST(c AS REAL)/a) ASC LIMIT 10`),

  saveDuel:     db.prepare(`INSERT OR REPLACE INTO duels_done (id,seed,kind,player_a,player_b,score_a,score_b,at)
                            VALUES (?,?,?,?,?,?,?,?)`),
  // sessions: reuse the open one if the player was active in the last 30
  // minutes, otherwise start a new one. That window is the industry-normal
  // definition and stops a quick tab-switch counting as a second visit.
  openSession: db.prepare(`SELECT * FROM sessions WHERE handle_lower = ? ORDER BY id DESC LIMIT 1`),
  newSession:  db.prepare(`INSERT INTO sessions
    (handle_lower,started_at,last_beat_at,day,tz,country,lang,device,local_hour,local_dow)
    VALUES (?,?,?,?,?,?,?,?,?,?)`),
  beatSession: db.prepare(`UPDATE sessions SET last_beat_at = ? WHERE id = ?`),
  // Backfill: a session opened before the client started sending its zone
  // gets the details the first time we do learn them, rather than staying
  // blank forever. Only fills what is still NULL -- never overwrites.
  fillSession: db.prepare(`UPDATE sessions SET
      tz = COALESCE(tz,?), country = COALESCE(country,?), lang = COALESCE(lang,?),
      device = COALESCE(device,?), local_hour = COALESCE(local_hour,?), local_dow = COALESCE(local_dow,?)
    WHERE id = ?`),
  sessionsSince: db.prepare(`SELECT COUNT(*) c FROM sessions WHERE started_at >= ?`),
  // For the player's own data export. Capped, because an export is a
  // response a browser has to hold in memory, not a stream.
  allSessionsOf: db.prepare(`SELECT * FROM sessions WHERE handle_lower = ?
    ORDER BY started_at DESC LIMIT 5000`),
  sessionsPerUser: db.prepare(`
    SELECT COUNT(*) AS total, COUNT(DISTINCT handle_lower) AS people
    FROM sessions WHERE started_at >= ?`),

  /* ---- TIME PLAYED -------------------------------------------------
     A session's length is last_beat_at - started_at: the span from the
     first request of a visit to the last one. Two things about that are
     worth knowing before trusting any number built on it.

     It UNDERCOUNTS the tail. Whatever the player did after their final
     request -- reading a score screen, staring at a photo -- is invisible,
     because nothing told the server they were still there. The client
     heartbeat narrows that gap to about a minute; it does not close it.

     A single-request visit measures ZERO. Somebody who opened the app and
     immediately closed it genuinely played no time, so that is right, but
     it does mean the average is dragged down by bounces. `engaged` below
     counts only sessions of at least a minute, which is the number to read
     when you want "how long do people who actually play, play". */
  timeTotals: db.prepare(`
    SELECT COUNT(*) AS sessions,
           COUNT(DISTINCT handle_lower) AS people,
           SUM(last_beat_at - started_at) AS ms,
           AVG(last_beat_at - started_at) AS avg_ms,
           MAX(last_beat_at - started_at) AS max_ms
    FROM sessions WHERE started_at >= ?`),
  timeEngaged: db.prepare(`
    SELECT COUNT(*) AS sessions, AVG(last_beat_at - started_at) AS avg_ms
    FROM sessions WHERE started_at >= ? AND (last_beat_at - started_at) >= 60000`),
  // The shape of session length, not just its average -- an average of
  // twelve minutes means something very different when it is everyone at
  // twelve than when it is half bouncing and half playing for half an hour.
  timeBuckets: db.prepare(`
    SELECT CASE
      WHEN (last_beat_at - started_at) <  60000 THEN 0
      WHEN (last_beat_at - started_at) < 300000 THEN 1
      WHEN (last_beat_at - started_at) < 900000 THEN 2
      WHEN (last_beat_at - started_at) <1800000 THEN 3
      ELSE 4 END AS b, COUNT(*) c
    FROM sessions WHERE started_at >= ? GROUP BY b`),
  timePerDay: db.prepare(`
    SELECT day, SUM(last_beat_at - started_at) ms, COUNT(*) n
    FROM sessions WHERE started_at >= ? GROUP BY day ORDER BY day`),
  timeTopPlayers: db.prepare(`
    SELECT u.handle, u.country,
           COUNT(s.id) AS sessions,
           SUM(s.last_beat_at - s.started_at) AS ms,
           MAX(s.last_beat_at) AS last_at
    FROM sessions s JOIN users u ON u.handle_lower = s.handle_lower
    GROUP BY s.handle_lower ORDER BY ms DESC LIMIT 15`),
  timeOfUser: db.prepare(`
    SELECT COUNT(*) AS sessions, SUM(last_beat_at - started_at) AS ms,
           AVG(last_beat_at - started_at) AS avg_ms
    FROM sessions WHERE handle_lower = ?`),

  /* ---- WHEN --------------------------------------------------------
     Local hour and local weekday, as stored at session start. Rows from
     before the client sent a timezone have NULL and are excluded rather
     than silently counted as midnight Sunday. */
  whenHeat: db.prepare(`
    SELECT local_dow d, local_hour h, COUNT(*) c
    FROM sessions WHERE started_at >= ? AND local_hour IS NOT NULL AND local_dow IS NOT NULL
    GROUP BY d, h`),
  whenHours: db.prepare(`
    SELECT local_hour h, COUNT(*) c FROM sessions
    WHERE started_at >= ? AND local_hour IS NOT NULL GROUP BY h ORDER BY h`),
  whenDows: db.prepare(`
    SELECT local_dow d, COUNT(*) c FROM sessions
    WHERE started_at >= ? AND local_dow IS NOT NULL GROUP BY d ORDER BY d`),
  whenKnown: db.prepare(`
    SELECT SUM(CASE WHEN local_hour IS NULL THEN 0 ELSE 1 END) known, COUNT(*) total
    FROM sessions WHERE started_at >= ?`),

  /* ---- WHERE -------------------------------------------------------
     Country comes from the device's timezone setting, never from the IP
     address. NULL means a client that has not told us -- an old cached
     build, or a browser we could not read a zone from. */
  whereCountries: db.prepare(`
    SELECT country, COUNT(*) sessions, COUNT(DISTINCT handle_lower) people,
           SUM(last_beat_at - started_at) ms
    FROM sessions WHERE started_at >= ?
    GROUP BY country ORDER BY people DESC, sessions DESC`),
  wherePlayers: db.prepare(`
    SELECT country, COUNT(*) c FROM users WHERE guest = 0 GROUP BY country ORDER BY c DESC`),
  whereLangs: db.prepare(`
    SELECT lang, COUNT(DISTINCT handle_lower) c FROM sessions
    WHERE started_at >= ? AND lang IS NOT NULL GROUP BY lang ORDER BY c DESC LIMIT 12`),
  whereDevices: db.prepare(`
    SELECT device, COUNT(*) sessions, COUNT(DISTINCT handle_lower) people,
           AVG(last_beat_at - started_at) avg_ms
    FROM sessions WHERE started_at >= ? AND device IS NOT NULL GROUP BY device`),
  setUserGeo: db.prepare(`UPDATE users SET tz=?, country=?, lang=?, device=? WHERE handle_lower=?`),

  /* ---- Activity, from the database rather than from memory ----------
     These used to be read off the in-memory events array, which meant
     every chart on the dashboard reset to empty on each redeploy. */
  eventsPerDayType: db.prepare(`
    SELECT type, COUNT(*) c, at FROM events WHERE at >= ? GROUP BY type`),
  signupsPerDay: db.prepare(`
    SELECT date(at/1000,'unixepoch') d, COUNT(*) c FROM events
    WHERE at >= ? AND type IN ('signup','guest') GROUP BY d ORDER BY d`),
  duelKindSplit: db.prepare(`
    SELECT json_extract(meta_json,'$.kind') k, COUNT(*) c FROM events
    WHERE type = 'duel_result' GROUP BY k`),
  recentPurchases: db.prepare(`
    SELECT * FROM events WHERE type = 'purchase' ORDER BY id DESC LIMIT ?`),
  revenueTotal: db.prepare(`
    SELECT COALESCE(SUM(json_extract(meta_json,'$.cents')),0) cents, COUNT(*) n
    FROM events WHERE type = 'purchase' AND at >= ?`),

  addReferral:   db.prepare(`INSERT OR IGNORE INTO referrals (invitee_lower,referrer,at) VALUES (?,?,?)`),
  referralCount: db.prepare(`SELECT COUNT(*) c FROM referrals WHERE at >= ?`),
  topReferrers:  db.prepare(`SELECT referrer, COUNT(*) c FROM referrals GROUP BY referrer ORDER BY c DESC LIMIT 10`),

  /* Retention, done properly: of the people who SIGNED UP in a given day
     window, how many were still active N days later. Counting "active
     today who joined N days ago" would flatter the number by ignoring
     everyone who never came back. */
  cohortSize: db.prepare(`SELECT COUNT(*) c FROM users WHERE created_at >= ? AND created_at < ?`),
  cohortRetained: db.prepare(`
    SELECT COUNT(DISTINCT s.handle_lower) c
    FROM sessions s JOIN users u ON u.handle_lower = s.handle_lower
    WHERE u.created_at >= ? AND u.created_at < ? AND s.started_at >= ? AND s.started_at < ?`),

  gamesPerUser: db.prepare(`
    SELECT u.handle, u.created_at,
      (SELECT COUNT(*) FROM shots sh WHERE sh.handle_lower = u.handle_lower) AS shots,
      (SELECT COUNT(*) FROM sessions se WHERE se.handle_lower = u.handle_lower) AS sessions
    FROM users u WHERE u.guest = 0 ORDER BY shots DESC LIMIT 12`),

  saveGhost:    db.prepare(`INSERT OR REPLACE INTO ghosts (handle_lower,handle,seed,rows_json,avg_score,rating_at_play,played_at)
                            VALUES (?,?,?,?,?,?,?)`),
  // A random ghost that is not the asking player's own, and not stale --
  // a run from six months ago is not a fair or interesting opponent, and a
  // deleted account's ghost is removed by the CASCADE above automatically.
  randomGhost:  db.prepare(`SELECT * FROM ghosts WHERE handle_lower != ? AND played_at >= ?
                            ORDER BY RANDOM() LIMIT 1`),
  ghostCount:   db.prepare(`SELECT COUNT(*) c FROM ghosts WHERE played_at >= ?`),
  countDuels:   db.prepare(`SELECT kind, COUNT(*) c FROM duels_done GROUP BY kind`),
  anonDuels:    db.prepare(`UPDATE duels_done SET player_a = NULL WHERE player_a = ?`),
  anonDuelsB:   db.prepare(`UPDATE duels_done SET player_b = NULL WHERE player_b = ?`),

  boardRuns: db.prepare(`
    SELECT u.handle AS handle, MAX(s.score) AS score, COUNT(*) AS runs
    FROM shots s JOIN users u ON u.handle_lower = s.handle_lower
    WHERE u.guest = 0 AND (@day IS NULL OR s.day = @day) AND (@level IS NULL OR s.level_id = @level)
    GROUP BY u.handle_lower ORDER BY score DESC LIMIT 50`),
  /* Per-level leaderboard for a time window. From the shots table, so it
     survives every restart -- the runs board used to be built from an
     in-memory list that started empty after each deploy. */
  boardLevel: db.prepare(`
    SELECT u.handle AS handle, u.equipped_json AS equipped_json, MAX(s.score) AS score
    FROM shots s JOIN users u ON u.handle_lower = s.handle_lower
    WHERE u.guest = 0 AND u.banned = 0 AND s.level_id = @level AND s.at >= @since
    GROUP BY u.handle_lower ORDER BY score DESC LIMIT 50`),
  levelBestOf: db.prepare(`
    SELECT MAX(score) AS score FROM shots WHERE handle_lower = @me AND level_id = @level AND at >= @since`),
  levelRankOf: db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM (
      SELECT s.handle_lower, MAX(s.score) AS best FROM shots s JOIN users u ON u.handle_lower = s.handle_lower
      WHERE u.guest = 0 AND u.banned = 0 AND s.level_id = @level AND s.at >= @since
      GROUP BY s.handle_lower) WHERE best > @score`),
  // General standing: every player's personal bests, from the bests table.
  allBests: db.prepare(`
    SELECT b.handle_lower, u.handle, u.equipped_json, b.score
    FROM bests b JOIN users u ON u.handle_lower = b.handle_lower
    WHERE u.guest = 0 AND u.banned = 0`),
  boardPuzzles: db.prepare(`
    SELECT handle, pz_rating rating, pz_solved solved, pz_streak streak
    FROM users WHERE guest = 0 AND pz_attempted > 0
    ORDER BY pz_rating DESC LIMIT 50`),
  boardDuels: db.prepare(`
    SELECT handle, duel_rating rating, duel_w w, duel_l l
    FROM users WHERE guest = 0 AND (duel_w + duel_l + duel_t) > 0
    ORDER BY duel_rating DESC LIMIT 50`),
  searchUsers: db.prepare(`
    SELECT * FROM users
    WHERE (@q = '' OR lower(handle) LIKE @like OR lower(COALESCE(email,'')) LIKE @like)
    ORDER BY
      CASE WHEN @sort='lastSeen' THEN last_seen_at
           WHEN @sort='xp'       THEN xp
           WHEN @sort='duel'     THEN duel_rating
           ELSE created_at END DESC
    LIMIT 50`),
  countSearch: db.prepare(`
    SELECT COUNT(*) c FROM users
    WHERE (@q = '' OR lower(handle) LIKE @like OR lower(COALESCE(email,'')) LIKE @like)`)
};

/* ---------------------------------------------------------------------
   Row <-> object. The rest of the server thinks in objects, so the shape
   conversion lives here rather than leaking SQL column names everywhere.
   --------------------------------------------------------------------- */
function rowToUser(r){
  if (!r) return null;
  const owns = S.ownsOf.all(r.handle_lower).map(x => x.sku);
  const bests = {};
  for (const b of S.bestsOf.all(r.handle_lower)) bests[b.level_id] = b.score;
  return {
    handle: r.handle, handleLower: r.handle_lower,
    email: r.email, name: r.name, birthYear: r.birth_year,
    guest: !!r.guest, banned: !!r.banned,
    salt: r.salt, pw: r.pw, recoveryHash: r.recovery_hash, googleSub: r.google_sub,
    createdAt: r.created_at, lastSeenAt: r.last_seen_at,
    xp: r.xp, blips: r.blips, livePracticed: !!r.live_practiced,
    duelRating: r.duel_rating, duels: { w: r.duel_w, l: r.duel_l, t: r.duel_t },
    puzzles: { next: r.pz_next, rating: r.pz_rating, solved: r.pz_solved,
               attempted: r.pz_attempted, streak: r.pz_streak, bestStreak: r.pz_best_streak },
    owns, bests,
    equipped: r.equipped_json ? JSON.parse(r.equipped_json) : null,
    consent: r.consent_json ? JSON.parse(r.consent_json) : null
  };
}

const saveUser = db.prepare(`UPDATE users SET
  email=@email, name=@name, birth_year=@birth_year, guest=@guest, handle=@handle,
  salt=@salt, pw=@pw, recovery_hash=@recovery_hash, google_sub=@google_sub,
  last_seen_at=@last_seen_at, xp=@xp, blips=@blips, live_practiced=@live_practiced,
  duel_rating=@duel_rating, duel_w=@duel_w, duel_l=@duel_l, duel_t=@duel_t,
  pz_next=@pz_next, pz_rating=@pz_rating, pz_solved=@pz_solved, pz_attempted=@pz_attempted,
  pz_streak=@pz_streak, pz_best_streak=@pz_best_streak,
  equipped_json=@equipped_json, consent_json=@consent_json, banned=@banned
  WHERE handle_lower=@handle_lower`);

function persist(u){
  saveUser.run({
    handle_lower: u.handleLower, handle: u.handle,
    email: u.email || null, name: u.name || null, birth_year: u.birthYear || null,
    guest: u.guest ? 1 : 0, salt: u.salt, pw: u.pw,
    recovery_hash: u.recoveryHash || null, google_sub: u.googleSub || null,
    last_seen_at: u.lastSeenAt, xp: u.xp, blips: u.blips,
    live_practiced: u.livePracticed ? 1 : 0,
    duel_rating: u.duelRating, duel_w: u.duels.w, duel_l: u.duels.l, duel_t: u.duels.t,
    pz_next: u.puzzles.next, pz_rating: u.puzzles.rating, pz_solved: u.puzzles.solved,
    pz_attempted: u.puzzles.attempted, pz_streak: u.puzzles.streak, pz_best_streak: u.puzzles.bestStreak,
    equipped_json: u.equipped ? JSON.stringify(u.equipped) : null,
    consent_json: u.consent ? JSON.stringify(u.consent) : null,
    banned: u.banned ? 1 : 0
  });
}

/* Deleting an account has to mean it. Foreign keys cascade tokens, owns,
   bests, shots and solved; events referencing the handle are removed
   explicitly; completed duels are anonymised rather than deleted so an
   opponent's own history is not silently corrupted. */
const scrub = db.transaction(handleLower => {
  const u = S.userByHandle.get(handleLower);
  if (!u) return false;
  db.prepare(`DELETE FROM events WHERE handle_lower = ?`).run(handleLower);
  S.anonDuels.run(u.handle);
  S.anonDuelsB.run(u.handle);
  S.deleteUser.run(handleLower);     // cascades the rest
  return true;
});

// Housekeeping: expired tokens, and event logs older than 180 days. Runs
// hourly rather than on every request.
function housekeeping(){
  const now = Date.now();
  S.pruneTokens.run(now);
  const cutoff = now - 180 * 86400000;
  S.pruneEvents.run(cutoff);
  S.pruneAdEvents.run(cutoff);
}
setInterval(housekeeping, 3600 * 1000).unref();
housekeeping();

// A clean close on shutdown means WAL is checkpointed and nothing is lost.
function close(){ try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch(e){} }
process.on('SIGINT',  () => { close(); process.exit(0); });
process.on('SIGTERM', () => { close(); process.exit(0); });

module.exports = { db, S, rowToUser, persist, scrub, close, DB_PATH, DATA_DIR };

/* =========================================================================
   MAP-COMPATIBLE ADAPTERS
   The server was written against `users` and `tokens` as plain Maps, in 29
   places. Rewriting each call site is 29 chances to introduce a bug in the
   one subsystem where a bug means lost accounts. Instead these expose the
   exact same interface -- get/set/has/delete/values/entries -- backed by
   SQLite, so every existing line keeps working untouched.

   The subtle part: the server mutates user objects directly (`u.xp += 10`)
   without calling `.set()` afterwards. A plain object would lose that. So
   every user handed out is wrapped in a deep Proxy that marks it dirty on
   any property write, nested ones included, and `flush()` persists them
   after the request completes. One write per request, not one per field.
   ========================================================================= */
const dirty = new Set();
const cache = new Map();          // handleLower -> proxied user object

function deepProxy(target, onWrite){
  if (target === null || typeof target !== 'object') return target;
  return new Proxy(target, {
    get(o, k){
      const v = o[k];
      // re-wrap nested objects so `u.duels.w++` is caught too
      if (v && typeof v === 'object' && !(v instanceof Date)) return deepProxy(v, onWrite);
      return v;
    },
    set(o, k, v){ o[k] = v; onWrite(); return true; },
    deleteProperty(o, k){ delete o[k]; onWrite(); return true; }
  });
}

function wrap(user){
  if (!user) return null;
  const proxied = deepProxy(user, () => dirty.add(user.handleLower));
  cache.set(user.handleLower, proxied);
  return proxied;
}

const usersAdapter = {
  get(k){
    k = String(k).toLowerCase();
    if (cache.has(k)) return cache.get(k);
    return wrap(rowToUser(S.userByHandle.get(k)));
  },
  has(k){ return !!S.userByHandle.get(String(k).toLowerCase()); },
  set(k, u){
    k = String(k).toLowerCase();
    const exists = S.userByHandle.get(k);
    if (!exists){
      S.insertUser.run({
        handle_lower: k, handle: u.handle,
        email: u.email || null, name: u.name || null, birth_year: u.birthYear || null,
        guest: u.guest ? 1 : 0, salt: u.salt, pw: u.pw,
        recovery_hash: u.recoveryHash || null, google_sub: u.googleSub || null,
        created_at: u.createdAt || Date.now(), last_seen_at: u.lastSeenAt || Date.now(),
        xp: u.xp || 0, blips: u.blips || 0, live_practiced: u.livePracticed ? 1 : 0,
        duel_rating: u.duelRating || 1000,
        duel_w: (u.duels && u.duels.w) || 0, duel_l: (u.duels && u.duels.l) || 0, duel_t: (u.duels && u.duels.t) || 0,
        pz_next: (u.puzzles && u.puzzles.next) || 1, pz_rating: (u.puzzles && u.puzzles.rating) || 800,
        pz_solved: (u.puzzles && u.puzzles.solved) || 0, pz_attempted: (u.puzzles && u.puzzles.attempted) || 0,
        pz_streak: (u.puzzles && u.puzzles.streak) || 0, pz_best_streak: (u.puzzles && u.puzzles.bestStreak) || 0,
        equipped_json: u.equipped ? JSON.stringify(u.equipped) : null,
        consent_json: u.consent ? JSON.stringify(u.consent) : null
      });
    }
    // the in-memory object may carry things the INSERT above does not cover
    if (!u.handleLower) u.handleLower = k;
    for (const sku of (u.owns || [])) S.grant.run(k, sku, Date.now());
    for (const [lvl, sc] of Object.entries(u.bests || {})) S.setBest.run(k, lvl, sc);
    if (exists) persist({ ...u, handleLower: k });
    cache.delete(k);
    return usersAdapter;
  },
  delete(k){ k = String(k).toLowerCase(); cache.delete(k); dirty.delete(k); return scrub(k); },
  values(){ return S.allUsers.all().map(r => wrap(rowToUser(r))); },
  entries(){ return S.allUsers.all().map(r => [r.handle_lower, wrap(rowToUser(r))]); },
  get size(){ return S.allUsers.all().length; },
  [Symbol.iterator](){ return this.entries()[Symbol.iterator](); }
};

/* TOKEN LIFETIME.

   This was a flat 30 days set at sign-in and never touched again, which
   meant every player -- the one who plays nightly as much as the one who
   plays monthly -- was hard-signed-out on a fixed schedule twelve times a
   year, and had to find their password or, far more often, make a new
   account. A comment elsewhere claimed the heartbeat extended the session;
   it did not. It updated `last_seen_at` on the USER row and never went
   near the token.

   It is a sliding window now: 60 days, pushed forward whenever the token
   is actually used. Somebody who plays every few weeks is never signed
   out. Somebody who stops playing expires, which is the point of an expiry.

   The extension is throttled to once a day per token so that a player
   making a request every few seconds is not also writing to the tokens
   table every few seconds. */
const TOKEN_TTL = 60 * 86400000;          // 60 days from last use
const TOKEN_SLIDE_EVERY = 86400000;       // write at most once a day

const tokensAdapter = {
  get(t){
    const r = S.getToken.get(String(t));
    if (!r || r.expires_at <= Date.now()) return undefined;
    const now = Date.now();
    if (r.expires_at - now < TOKEN_TTL - TOKEN_SLIDE_EVERY){
      try { S.touchToken.run(now + TOKEN_TTL, String(t)); } catch(e){}
    }
    return r.handle_lower;
  },
  set(t, k){ const now = Date.now(); S.addToken.run(String(t), String(k).toLowerCase(), now, now + TOKEN_TTL); return tokensAdapter; },
  has(t){ return this.get(t) !== undefined; },
  delete(t){ S.dropToken.run(String(t)); return true; },
  entries(){ return db.prepare(`SELECT token, handle_lower FROM tokens WHERE expires_at > ?`).all(Date.now()).map(r => [r.token, r.handle_lower]); },
  [Symbol.iterator](){ return this.entries()[Symbol.iterator](); }
};

// Called once per request, after the handler has responded.
/* persist() writes the users row. Owns and bests live in their own tables
   -- a purchase is `u.owns.push(sku)` and a new record is
   `u.bests[level] = score`, both plain mutations the row UPDATE knows
   nothing about. Syncing them here is what makes a purchase survive a
   restart, which is the difference between a shop and a bug that takes
   people's money. */
function flush(){
  if (!dirty.size) return;
  const now = Date.now();
  for (const k of dirty){
    const u = cache.get(k);
    if (!u) continue;
    try {
      persist(u);
      for (const sku of (u.owns || [])) S.grant.run(k, sku, now);
      for (const [lvl, sc] of Object.entries(u.bests || {})) S.setBest.run(k, lvl, sc);
    } catch(e){ console.error('persist failed for ' + k + ': ' + e.message); }
  }
  dirty.clear();
}

/* Renaming a guest into a real account. This MUST be a rename, never a
   delete-then-insert: deleting cascades their tokens, purchases, shots and
   best scores, so the "upgrade" would hand someone a brand new empty
   account and log them out. Found exactly that way -- a guest who played
   for an hour, signed up, and lost all of it.
   SQLite updates the child rows automatically here because every foreign
   key is declared ON UPDATE CASCADE by default for a PRIMARY KEY change...
   it is not, so we do it explicitly and inside a transaction. */
const renameUser = db.transaction((oldLower, newHandle) => {
  const newLower = newHandle.toLowerCase();
  // Order matters. Updating the parent row first orphans every child for an
  // instant and SQLite rejects the whole transaction on a foreign key
  // violation. `defer_foreign_keys` holds the check until COMMIT, by which
  // point parent and children agree again.
  db.pragma('defer_foreign_keys = ON');
  db.prepare(`UPDATE users SET handle = ?, handle_lower = ? WHERE handle_lower = ?`).run(newHandle, newLower, oldLower);
  for (const t of ['tokens','owns','bests','shots','solved','events'])
    db.prepare(`UPDATE ${t} SET handle_lower = ? WHERE handle_lower = ?`).run(newLower, oldLower);
  cache.delete(oldLower); dirty.delete(oldLower);
});

module.exports.renameUser = renameUser;
module.exports.usersAdapter = usersAdapter;
module.exports.tokensAdapter = tokensAdapter;
module.exports.flush = flush;
module.exports.wrap = wrap;
