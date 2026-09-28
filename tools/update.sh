#!/usr/bin/env bash
# ShutterBlip — finish an update on the server, in one go.
# Run from the game's folder, after git pull:   bash tools/update.sh
cd "$(dirname "$0")/.." || exit 1
APP=shutterblip
say()  { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$1"; }
fail() {
  printf '\n\033[1;31m    STOPPED: %s\033[0m\n' "$1"
  printf '\033[1;31m    Nothing has been deleted. Copy everything above and send it to Claude.\033[0m\n\n'
  exit 1
}
say "1 of 5  Pausing the game while it updates"
pm2 stop "$APP" >/dev/null 2>&1 && ok "paused" || ok "it was not running"
say "2 of 5  Installing the database tool (this can take a minute - please wait)"
rm -rf node_modules/better-sqlite3
if ! npm install --omit=dev --no-audit --no-fund; then fail "the install did not finish"; fi
if node -e "require('better-sqlite3')" 2>/dev/null; then ok "database tool works"
else node -e "require('better-sqlite3')"; fail "the database tool is installed but will not load"; fi
say "3 of 5  Safety check: do all accounts, XP and scores carry over?"
if [ -d /root/prev ]; then
  node tools/check-rollover.js /root/prev | tee /tmp/rollover.txt
  if ! grep -q "Safe to deploy" /tmp/rollover.txt; then fail "the safety check did not pass, so the new version was NOT started"; fi
  ok "everything carries over"
else ok "no previous copy to compare with - skipping"; fi
say "4 of 5  Starting the game"
pm2 restart "$APP" >/dev/null 2>&1 || fail "pm2 could not start the game"
sleep 4
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT:-8787}/ || true)
if [ "$CODE" != "200" ]; then pm2 logs "$APP" --lines 20 --nostream; fail "the game did not answer after starting (code $CODE)"; fi
ok "the game is running"
say "5 of 5  Keeping a copy of this version for next time's safety check"
rm -rf /root/prev && cp -r "$(pwd)" /root/prev && ok "saved"
printf '\n\033[1;32m    ALL DONE. Open the game on your phone.\033[0m\n\n'
