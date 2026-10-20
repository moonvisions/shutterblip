# Turning the shop on

ShutterBlip Pro is $3.99, paid once. Until you do the steps below, the
Unlock Pro button politely says the shop is not open yet — it never takes
money and never unlocks anything by accident.

**This takes about 20 minutes.** Do it after the game is running.

> **Why Stripe, and why your server never sees a card.** The player types
> their card on Stripe's own page, not yours. Your server only ever hears
> "Stripe says this person paid". That is what keeps you out of the rules
> about storing card numbers, and it is why there is nothing here about
> encrypting anything.

---

## Part 1 — Make a Stripe account

**Step 1.** In a browser, go to stripe.com and click **Sign up**. Use your
business email.

**Step 2.** Stripe asks for business details — your name, address, and a
bank account for the money to land in. Moon Vision Media LLC and your
business bank account are the right answers.

**Step 3.** It may take Stripe a day or two to approve the account. You can
do everything below in **test mode** while you wait. There is a switch at
the top of the Stripe dashboard that says **Test mode** — leave it ON until
you have done a full practice run.

---

## Part 2 — Get your two secret values

You need two strings. Both are secret: anyone who has them can act as you.

### The API key

**Step 1.** In the Stripe dashboard, click **Developers** (top right), then
**API keys**.

**Step 2.** Find the row called **Secret key**. Click **Reveal test key**.

**Step 3.** Copy it. It starts with `sk_test_` in test mode and `sk_live_`
when you go live. Paste it somewhere safe for a moment — a password
manager, not a text message.

### The webhook secret

A webhook is Stripe phoning your server to say "that person paid". Your
server refuses to believe anyone who cannot prove they are Stripe, and this
value is the proof.

**Step 1.** Still under **Developers**, click **Webhooks**, then **Add
endpoint**.

**Step 2.** In **Endpoint URL**, type your site address followed by
`/v1/purchase/webhook`. For example, if your site is at shutterblip.com,
the whole thing is that domain with `/v1/purchase/webhook` on the end.

**Step 3.** Click **Select events** and tick exactly these four:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`

**Step 4.** Click **Add endpoint**.

**Step 5.** On the page that appears, find **Signing secret** and click
**Reveal**. Copy it. It starts with `whsec_`.

---

## Part 3 — Put the three values on your server

**Step 1.** Open the DigitalOcean console (your droplet → **Console**).

**Step 2.** Type this and press **Enter**:

```
cd /var/www/shutterblip
```

**Step 3.** Open the private settings file. Type this and press **Enter**:

```
nano server/local.env
```

A simple text editor fills the screen. Your admin password is already in
there.

**Step 4.** Using the arrow keys, go to the bottom of the file. Add three
new lines. **Type them** — the console mangles pasted text:

```
SITE_URL=https://yoursite.com
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

Replace `yoursite.com` with your real domain, and the two `xxxxx` values
with what you copied in Part 2. No spaces around the `=`. No quotes.

> `SITE_URL` is where Stripe sends the player back after paying. Get it
> wrong and they pay successfully and then land on a broken page.

**Step 5.** Save and close: hold **Ctrl** and press **O**, press **Enter**,
then hold **Ctrl** and press **X**.

**Step 6.** Restart the game so it reads the new settings:

```
pm2 restart shutterblip --update-env
```

The `--update-env` part matters. Without it, pm2 restarts the game with the
old settings and nothing changes.

---

## Part 4 — Buy it yourself, with a fake card

Do not skip this. It is the only way to know the whole chain works.

**Step 1.** Open the game on your phone, in a **private/incognito window**.

**Step 2.** Create a test account — any username, any email, any password.

**Step 3.** Go to the **You** tab, tap **Shop**, then **Unlock Pro**.

**Step 4.** Stripe's payment page opens. Use its official test card:

- Card number: `4242 4242 4242 4242`
- Expiry: any future date, for example `12/30`
- CVC: any three digits, for example `123`
- Name and postcode: anything

**Step 5.** Pay. You should land back on the game.

**Step 6.** Check it worked:
- The Pro screen should now say **UNLOCKED**.
- All five locations should be open.
- In Stripe, under **Developers → Webhooks**, your endpoint should show a
  successful delivery with a green tick.

**If the payment went through but the game did not unlock:** the webhook is
the problem, not the payment. Check that the endpoint URL is exactly right
and that the signing secret in `local.env` matches the one in Stripe.
Stripe retries for up to three days, so fixing it usually unlocks the
account by itself.

---

## Part 5 — Go live

**Step 1.** In Stripe, turn **Test mode** OFF.

**Step 2.** Get the **live** versions of both values — the secret key now
starts with `sk_live_`, and you must **create the webhook endpoint again**
in live mode and copy its new signing secret. Test and live are separate
worlds; test values do not work in live and vice versa.

**Step 3.** Put the live values into `server/local.env` the same way as
Part 3, and restart with `--update-env` again.

**Step 4.** Buy it once with your own real card. It is four dollars and it
is the only proof that live mode works. You can refund yourself in Stripe
afterwards — and a refund correctly removes Pro from that account, which is
also worth seeing once.

---

## What happens to a refund

If you refund someone in Stripe, or they dispute the charge with their
bank, the game removes Pro from that account automatically. Their scores,
XP and account are untouched — only the paid locations close again. The
receipt stays in your records either way.

## Where the money shows up

Stripe pays out to your bank account on a rolling schedule (usually every
two days once the account is established). The game's admin portal shows
you what was sold; Stripe's own dashboard is the authority on money.

## If you ever change the price

Change it in one place: `price_cents` on the `pro` item in
`server/mock.js`, then restart. Anyone who already paid keeps what they
bought — the game decides what someone owns from what they were granted,
never from what the price happens to be today.
