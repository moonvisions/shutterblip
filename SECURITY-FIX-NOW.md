# Do this on your server today

Two holes were open on the live site. Both are now fixed in the code, but
**one of them also needs a change on the server itself**, because nginx
serves files before the game's code ever sees the request.

Follow this top to bottom. Every command is one line — copy it, paste it,
press Enter. Nothing here can break the game; the worst case is a command
says "no such file" and you carry on.

---

## Step 0 — find out whether you were actually exposed

On your own computer, not the server, open a terminal and run:

```
curl -sI https://shutterblip.com/data/shutterblip.db
```

Look at the first line.

- **`HTTP/2 404`** or **`HTTP/2 403`** — good, nothing to panic about.
  Still do everything below.
- **`HTTP/2 200`** — the file was downloadable. Do everything below, and
  also do **Step 6**, which signs everybody out. Assume a copy was taken.

---

## Step 1 — log in to the server

```
ssh root@shutterblip.com
```

---

## Step 2 — move the database out of the web folder

Right now the database sits inside the folder nginx publishes. That is why
it could be downloaded. Move it somewhere nginx cannot reach:

```
mkdir -p /var/lib/shutterblip
```

```
systemctl stop nginx
```

```
pm2 stop shutterblip
```

```
mv /var/www/shutterblip/data/* /var/lib/shutterblip/ 2>/dev/null; true
```

```
chmod 700 /var/lib/shutterblip
```

Do not start anything yet — Step 4 tells the game where the database went.

---

## Step 3 — tell nginx to refuse everything it should not serve

Open the config:

```
nano /etc/nginx/sites-available/shutterblip
```

Find the line that begins `server_name`. **Directly underneath it**, add
these four lines:

```
    location ~ ^/(data|server|tools|node_modules|package|\.) { deny all; return 404; }
    location = /index.html { deny all; return 404; }
    location ~ \.(md|db|db-wal|db-shm|json|zip|log)$ { deny all; return 404; }
    location = / { try_files /index.min.html =404; }
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

Check you did not make a typo:

```
nginx -t
```

It must say `syntax is ok` and `test is successful`. If it does not, run
`nano` again and compare carefully — the indentation does not matter, the
semicolons and braces do.

---

## Step 4 — point the game at the new database location

```
cd /var/www/shutterblip
```

```
pm2 delete shutterblip
```

Now start it again with the new settings. This is one long line — copy the
whole thing:

```
PERSIST=1 DATA_DIR=/var/lib/shutterblip TRUST_PROXY=1 CORS_ORIGIN=https://shutterblip.com ADMIN_PASSWORD='YOUR-ADMIN-PASSWORD' pm2 start server/mock.js --name shutterblip
```

Replace `YOUR-ADMIN-PASSWORD` with your real one, keeping the quote marks.

Save it so a reboot brings it back the same way:

```
pm2 save
```

**What the new settings do**

| Setting | Why |
|---|---|
| `DATA_DIR=/var/lib/shutterblip` | The database now lives outside the web folder. |
| `TRUST_PROXY=1` | Tells the game it is behind nginx, so rate limiting counts the real visitor instead of a header anyone can fake. **Only set this when nginx is in front.** |
| `CORS_ORIGIN=https://shutterblip.com` | Stops other websites driving your API from their visitors' browsers. |

---

## Step 5 — start everything and check it

```
systemctl start nginx
```

```
pm2 logs shutterblip --lines 20
```

You should see `persistent · SQLite`. Press `Ctrl+C` to stop watching.

Now check the hole is closed. From your own computer again:

```
curl -sI https://shutterblip.com/data/shutterblip.db
```

Must say **404**. Then check the game still works:

```
curl -sI https://shutterblip.com/
```

Must say **200**. Open the site in a browser and play a round.

---

## Step 6 — only if Step 0 said 200

Someone may be holding a copy of your database, which includes everyone's
login tokens. Cancel every one of them. Everybody gets signed out once and
signs back in; nobody loses any progress.

```
sqlite3 /var/lib/shutterblip/shutterblip.db "DELETE FROM tokens;"
```

If that says `sqlite3: command not found`:

```
apt install -y sqlite3
```

then run the delete again.

**Change your admin password too.** Repeat Step 4 with a new one. Do not
reuse the old one anywhere.

---

## Step 7 — force HTTPS

Someone on the same café Wi-Fi as you could read your admin session if you
ever reached the site over plain `http`. Certbot usually sets this up, but
check:

```
grep -n "return 301" /etc/nginx/sites-available/shutterblip
```

If that prints nothing, add this as a **separate block** at the very bottom
of the file (`nano` again):

```
server {
    listen 80;
    server_name shutterblip.com www.shutterblip.com;
    return 301 https://$host$request_uri;
}
```

Then:

```
nginx -t && systemctl reload nginx
```

---

## What was wrong, in plain words

**The database was a public download.** The game's folder was published to
the web wholesale, and the database file lives in that folder. Anyone who
typed the address got every player's email, birth year, password hash, and
the table of live login sessions. It needed no skill — only the filename.

**Google sign-in trusted anything.** A Google login is a signed message.
The server was reading the message and never checking the signature, so a
person could write their own saying "I am whoever@example.com" and be
handed that account. This one is fixed entirely in the code; nothing is
needed from you, except that Google sign-in now stays switched off until
`GOOGLE_CLIENT_ID` is set, which is the safe way round.

**Anyone could take everything in the shop for free.** One request granted
every pack and the Supporter badge, and wrote the price into your revenue
figures. The shop now refuses until real Stripe keys exist.

**Guest accounts were being destroyed on every redeploy.** Guest numbering
restarted at 1001 each time the server restarted, so the next visitor was
handed a name somebody already had — and overwrote them. Two people then
shared one account. Reproduced, fixed, and tested.
