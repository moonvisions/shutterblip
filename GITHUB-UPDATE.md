# Updating GitHub, then your server

Two separate things, in this order:

1. Put the new files on **GitHub** (this document).
2. Pull them onto the **droplet** and restart (Part 3, at the bottom).

Do the checks in Part 0 first. One of them matters more than everything
else here.

> **About pasting commands.** Your terminal turns pasted web addresses into
> markdown links, which breaks the command. Nothing below asks you to paste
> an address — where one is needed, you type it or click it in a browser.

---

# Part 0 — two checks, before anything else

## Check 1: is your repository public?

Open a browser and go to your repository on GitHub. Look at the top, right
next to the repository name.

- It says **Public** — anyone on the internet can read every file in it.
- It says **Private** — only you can.

**If it says Public, make it private now.** Your server code, your admin
portal code and possibly your database are in there.

1. Click **Settings** (the tab along the top of the repository).
2. Scroll all the way to the bottom, to the red **Danger Zone** box.
3. Click **Change repository visibility**.
4. Choose **Make private**, then follow the prompts.

Nothing breaks. Your droplet keeps working — it pulls over SSH or with a
token, not because the repo was public.

## Check 2: is your database on GitHub?

This is the one that matters. Your database holds every player's email,
birth year, password hash and live login sessions.

On your repository's main page, look at the file list for a folder called
**data**. Click into it if it exists and look for **shutterblip.db**.

**If it is there:**

- Assume it has been read, especially if the repo was public. Do **Step 6**
  of `SECURITY-FIX-NOW.md` — the one that clears the tokens table — and
  change your admin password.
- Deleting the file in a new commit is **not enough**. Git keeps every old
  version, so the file stays downloadable from the history forever. The
  only clean fix is a new repository: create a fresh one, upload only the
  new files (Part 1 below), point the droplet at it, and delete the old
  repository entirely.
- If that sounds like a lot: it is roughly fifteen minutes and it is the
  correct move. A repository's history cannot be selectively forgotten
  without rewriting it, and rewriting history is harder than starting over.

**If it is not there:** good. The `.gitignore` in this update makes sure it
never appears.

---

# Part 1 — put the new files on GitHub

## The easy way: drag and drop in the browser

No terminal, no passwords, no git. Best if you are not already comfortable
with git.

**Step 1.** Unzip `shutterblip-site.zip` on your computer. You get a folder
called `shutterblip-site` containing `index.html`, `index.min.html`,
`server`, and the rest.

**Step 2.** Open your repository on GitHub in a browser.

**Step 3.** Click the **Add file** button near the top right, then
**Upload files**.

**Step 4.** Open the `shutterblip-site` folder on your computer. Select
**everything inside it** — not the folder itself, the contents — and drag
it onto the GitHub page where it says *Drag files here*.

> On a Mac: open the folder, press `Cmd+A` to select all, then drag.
> On Windows: open the folder, press `Ctrl+A`, then drag.

**Step 5.** Wait for the uploads to finish. `index.html` and
`index.min.html` are large; give it a minute.

**Step 6.** In the box at the bottom, where it says *Commit changes*, type
a short description:

```
Store readiness: privacy pages, app shell, UX fixes
```

**Step 7.** Leave **Commit directly to the main branch** selected. Click
**Commit changes**.

**Step 8 — the one people miss.** The browser uploader does not upload
files whose names start with a dot, so `.gitignore` will not have gone up.
Add it by hand:

1. Click **Add file**, then **Create new file**.
2. In the filename box type exactly: `.gitignore`
3. In the big text area, paste this:

```
data/
*.db
*.db-wal
*.db-shm
node_modules/
.env
.env.*
server/local.env
*.pem
*.key
*.keystore
*.jks
signing-key-info.txt
mobile/www/
.DS_Store
```

4. Scroll down, click **Commit changes**.

That file is what stops your database, your passwords file and your Android
signing key ever being committed by accident.

Done. Skip to Part 3.

---

## The other way: git on your computer

Only if you already have a copy of the repository on your computer and git
installed.

**Step 1.** Unzip `shutterblip-site.zip`.

**Step 2.** Copy everything from inside `shutterblip-site` into your local
repository folder, replacing the existing files when asked.

**Step 3.** Open a terminal and go to your repository folder. Type `cd `
(with a space) and then drag the folder from your file manager onto the
terminal window — it fills in the path for you. Press Enter.

**Step 4.** See what changed:

```
git status
```

You should see `index.html`, `index.min.html`, `server/mock.js`,
`server/db.js`, `server/security.js`, `server/geo.js`, `sw.js` and some new
markdown files. **If you see `data/` or anything ending in `.db`, stop** —
go back to Part 0, Check 2.

**Step 5.** Stage everything:

```
git add -A
```

**Step 6.** Commit:

```
git commit -m "Store readiness: privacy pages, app shell, UX fixes"
```

**Step 7.** Push:

```
git push
```

### If the push asks for a username and password

It will fail. GitHub stopped accepting account passwords here in 2021. You
need a **personal access token**, which is a long password that only works
for git.

1. In a browser, sign in to GitHub.
2. Click your picture, top right, then **Settings**.
3. Scroll to the very bottom of the left sidebar: **Developer settings**.
4. Click **Personal access tokens**, then **Tokens (classic)**.
5. Click **Generate new token**, then **Generate new token (classic)**.
6. Under **Note**, type: `shutterblip`
7. Under **Expiration**, choose **90 days**.
8. Tick the box marked **repo** — just that one, at the top.
9. Scroll down and click **Generate token**.
10. **Copy the token now.** It is shown once and never again. Paste it
    somewhere safe, like a password manager.

Run `git push` again. When it asks for your **username**, type your GitHub
username. When it asks for your **password**, paste the token.

To avoid doing that every time:

```
git config --global credential.helper store
```

Push once more, enter the token, and it is remembered. (That stores it in a
plain file in your home folder — fine on your own machine, not on a shared
one.)

---

# Part 3 — put it on the live server

GitHub now has the new code. The server does not until you pull it.

> **Type these — don't paste them.** The DigitalOcean console adds hidden
> characters to pasted text (you see `^[[200~` at the start), which breaks
> the command. All three are short on purpose.

**Step 1.** In the DigitalOcean website, open your droplet and click
**Console**. Wait for the line ending in `#`.

**Step 2.** Type this and press **Enter**:

```
cd /var/www/shutterblip
```

**Step 3.** Type this and press **Enter**. Wait until the `#` line comes back.

```
git pull
```

**Step 4.** Type this and press **Enter**. Then **don't type anything** until
it finishes — about one to two minutes.

```
bash tools/update.sh
```

It does everything else by itself — pauses the game, installs what it
needs, runs the safety check that every account, XP point and score
carries over, starts the game again and checks it answers. It prints each
step as it goes.

- **Green `ALL DONE`** at the end: finished. Open the game on your phone
  (close the tab and reopen it if it still looks old).
- **Red `STOPPED`**: nothing was deleted and your players' data is safe.
  Take a screenshot of the console and send it to Claude.

### If `git pull` says "Your local changes would be overwritten" or "untracked working tree files would be overwritten"

Type this, press Enter, then do Step 3 again:

```
git stash -u
```

That moves the server's stray copies aside (they are kept, not deleted).

### If `git pull` asks for a username and password

Use your GitHub username, and the personal access token from Part 1 as the
password.

---

# The order that matters

If you have not yet done `SECURITY-FIX-NOW.md`, do it **after** this pull,
not before — it changes how the game is started, and a `git pull` does not
undo that, but doing them the other way round means restarting twice for no
reason.

So: GitHub first (Part 1), pull to the server (Part 3), then
`SECURITY-FIX-NOW.md` from Step 2 onward.

---

# If something goes wrong

**The site is down after the pull, or the rollover check said DO NOT
DEPLOY.** Rewind the code to what was running before the pull:

```
cd /var/www/shutterblip && git reset --hard ORIG_HEAD && pm2 restart shutterblip
```

This only rewinds files git tracks — the code. It never touches your
player database, whether that lives in `/var/lib/shutterblip` (after the
security fix) or still in the `data` folder (before it), because git does
not track the database. Every account and stat stays exactly as it was.

Do **not** "roll back" by copying `/root/prev` over the live folder: that
copy was taken a few minutes ago, and if the database is still inside the
folder, it would replace today's real data with the older snapshot.

**`pm2 logs` shows an error.** Copy the first five lines of it and send
them to me — the first error is the real one, everything after is knock-on.

**"Permission denied (publickey)"** when connecting. You are using a
different computer than the one you set the droplet up from. Use the
DigitalOcean website: open your droplet, click **Console**, and run the
commands there instead.
