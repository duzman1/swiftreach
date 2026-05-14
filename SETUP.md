# WhatsApp Cloud API — Setup Guide

This walks you from zero to a working WhatsApp Cloud API integration. Plan for 30–60 minutes the first time. Meta's UI changes occasionally — if a label is slightly different, look for the closest match.

Once you're done, copy the values into `.env.local` (keys listed in `.env.example`) and restart the dev server.

---

## 1. Create a Meta Business account

1. Go to <https://business.facebook.com>.
2. Click **Create Account**.
3. Enter your business name, your name, and a work email.
4. Verify the email when Meta sends a confirmation.

You only need one Business account. If you already have one, skip to step 2.

---

## 2. Create a Meta Developer App

1. Go to <https://developers.facebook.com>.
2. Top-right → **My Apps** → **Create App**.
3. Use case: pick **Other**.
4. App type: **Business**.
5. Name the app (e.g. "WhatsApp Sender — Internal"), pick the Business account from step 1.
6. Click **Create App**.

---

## 3. Add the WhatsApp product

1. In your new app's dashboard, scroll to **Add products to your app**.
2. Find **WhatsApp** → click **Set up**.
3. Choose the Business account → **Continue**.

You'll land on **WhatsApp → API Setup**. This page is your friend.

---

## 4. Copy the Phone Number ID and WABA ID

Still on **WhatsApp → API Setup**:

- **Phone number ID** — under the "From" dropdown. Copy this string of digits → goes into `WHATSAPP_PHONE_NUMBER_ID`.
- **WhatsApp Business Account ID** — shown right below the From section. Copy → goes into `WHATSAPP_BUSINESS_ACCOUNT_ID`.

Meta gives you a free **test phone number** automatically. You can use this for development without registering a real number.

---

## 5. Generate a permanent System User access token

The token Meta shows you on the API Setup page is **temporary** (24 hours). For real use you need a permanent token.

1. Go to <https://business.facebook.com/settings/system-users>.
2. Click **Add** → name it (e.g. "WhatsApp Sender Bot") → role **Admin** → **Create System User**.
3. Click your new system user → **Add Assets** → select the WhatsApp Account from step 3 → grant **Full control**.
4. Click **Generate New Token**:
   - **App**: pick the app you created in step 2.
   - **Token expiration**: **Never**.
   - **Permissions**: check
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - Click **Generate Token**.
5. Copy the token immediately — you can't see it again. → goes into `WHATSAPP_API_TOKEN`.

---

## 6. Add test recipient numbers (development mode)

While your app is in development, Meta only allows you to message numbers you've explicitly approved. Up to **5** recipients.

1. **WhatsApp → API Setup** → **Recipient phone number** → **Manage phone number list** → **Add phone number**.
2. Enter a real WhatsApp number (yours, a teammate's). Meta will text it a verification code.
3. Recipient enters the code in their WhatsApp app. They're now allowed.

Repeat for each test recipient.

---

## 7. Send a test message

Still on the API Setup page, Meta gives you a `curl` snippet pre-filled with your IDs and token. Run it from your terminal — you should get a `hello_world` template message on the recipient's phone within seconds.

If it works, your credentials are good. If you get an error, check:
- Recipient is in the approved list (step 6).
- Token has `whatsapp_business_messaging` permission.
- Phone Number ID matches the From number you selected.

---

## 8. Create a message template (for outbound first contact)

Free-form text only works **within 24 hours** after a customer messages you first. To start a new conversation, you must use an approved template.

1. Go to <https://business.facebook.com/wa/manage/message-templates/>.
2. **Create Template**.
3. Category: **Utility** (transactional notifications) is the easiest to get approved. **Marketing** has stricter rules.
4. Name: lowercase, no spaces, e.g. `appointment_reminder`. You'll use this exact name in the app's "Template Name" field.
5. Language: pick yours (default in this app: `en_US`).
6. Body: write your message. Use `{{1}}`, `{{2}}`, etc. for variables. Meta calls these "positional parameters".
7. Provide sample values for each placeholder so reviewers know what they look like in context.
8. Submit. Approval usually takes minutes for Utility, hours for Marketing.

In the app you'll select **Mode B — Meta Approved Template**, type the template name, and map each `{{1}}`, `{{2}}` to a column from your contact file (or a static value).

---

## 9. Configure the webhook (for delivery status)

Webhooks tell your app when messages are delivered, read, or fail. Without this, the app only knows whether Meta accepted the send — not whether it reached the phone.

1. **WhatsApp → Configuration** (left sidebar).
2. **Webhook** → **Edit**.
3. **Callback URL**: `https://YOUR_DOMAIN/api/webhook` (you can copy this URL from the in-app **Settings** page).
4. **Verify token**: paste the same string you put in `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `.env.local`. (Any random string. It only has to match between Meta and your env file.)
5. Click **Verify and save**. Meta will hit your endpoint with a verification request — your server must be reachable from the public internet.
6. Once verified, click **Manage** → subscribe to: `messages`, `message_status`.

**Local dev tip:** Meta can't reach `localhost`. Use `ngrok http 3000` to get a public URL, then put that in the Callback URL field while testing.

---

## 10. Going live (sending to real numbers)

Until you complete this, you're stuck with the 5 test recipients.

1. **App Dashboard → App Review → Permissions and Features**.
2. Request advanced access for `whatsapp_business_messaging` (and `whatsapp_business_management` if needed).
3. Complete **Business Verification** (Meta will ask for legal documents — incorporation certificate, utility bill, etc.).
4. Toggle the app from **Development** → **Live** in the App Dashboard header.

Once live, you can message any opted-in WhatsApp user.

---

## Where to put the values

`.env.local` (in the project root):

```
WHATSAPP_API_TOKEN=EAAG...                 # from step 5
WHATSAPP_PHONE_NUMBER_ID=1234567890        # from step 4
WHATSAPP_BUSINESS_ACCOUNT_ID=9876543210    # from step 4
WHATSAPP_API_VERSION=v25.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=any-random-string-you-pick
NEXT_PUBLIC_BASE_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"
```

Restart `npm run dev` after editing.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `131030` — "recipient phone number not in allowed list" | You're in development mode and the recipient isn't in the test recipient list (step 6). |
| `131047` — "re-engagement message" | The 24-hour customer service window expired. Use a template (Mode B) instead of free-form text. |
| `190` — "expired access token" | Your token expired. Generate a permanent one (step 5). |
| Webhook never fires | Either the URL isn't publicly reachable, or the verify token doesn't match. Re-check both. |
| Template stuck "pending" | Marketing templates are reviewed by humans. Utility usually clears in minutes. |

---

## Enabling Embedded Signup

Embedded Signup is the one-click connection flow at `/onboarding`. It replaces the manual 7-step wizard for users who don't want to copy-paste tokens. The manual wizard remains as a fallback at `/onboarding?mode=manual`.

**Embedded Signup requires Live mode + Meta Business verification + approved permissions. Until those are done, the button will show a Meta error and users should use Manual mode.**

### Step 1: Enable Embedded Signup on your Meta App

1. Go to https://developers.facebook.com → your app
2. Click **WhatsApp** in the left sidebar
3. Click **Embedded Signup**
4. Click **Get Started** and follow Meta's setup wizard

### Step 2: Create an Embedded Signup Configuration

1. In Embedded Signup, click **Create Configuration**
2. Name it: `SwiftReach Onboarding`
3. Set the redirect URL to: `https://www.swiftreach.app/onboarding`
4. Copy the **Configuration ID**
5. Add to Vercel env vars: `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`

### Step 3: Get your System User Token

This token is used to subscribe each connected WABA to our app's webhooks. It must have `whatsapp_business_management` permission. Never expires (set to "Never").

1. Go to https://business.facebook.com
2. **Settings → System Users**
3. Click your system user (or create one)
4. Generate token with permission: `whatsapp_business_management`
5. Set expiry to **Never**
6. Copy the token
7. Add to Vercel env vars: `META_SYSTEM_USER_TOKEN`

Also add to Vercel:
- `NEXT_PUBLIC_META_APP_ID` — public, from App Dashboard
- `META_APP_SECRET` — private, from App Dashboard → Settings → Basic

### Step 4: Switch App to Live Mode

Embedded Signup only works in Live mode.
1. App Dashboard top bar: toggle from **In Development** → **Live**
2. This requires completing App Review first.

### Step 5: Complete Meta App Review

Submit your app for review with these permissions:
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management`

App Review can take 5–10 business days.

### How tokens are stored

| Token | Lifetime | Stored where |
|---|---|---|
| User's WhatsApp access token | ~60 days (long-lived) | `User.whatsappApiToken`, encrypted (AES-256-CBC) |
| System User token | Never (recommended) | Vercel env var only — never per-user |
| Webhook verify token | Lifetime of the user | `User.webhookVerifyToken`, auto-generated |

When a user's token nears expiry, the **Reconnect WhatsApp** button on `/settings` walks them through Embedded Signup again. Same User row, refreshed token.

