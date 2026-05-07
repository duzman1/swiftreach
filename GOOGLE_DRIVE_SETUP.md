# Google Drive Integration Setup

This is **optional**. Skip it and SwiftReach still works — users will only see
the manual file upload option. Configure this when you want recipients of the
"New Campaign" wizard to pick a contact list directly from their Google Drive.

Allow ~15 minutes the first time.

---

## Step 1 — Create a Google Cloud project

1. Go to <https://console.cloud.google.com>.
2. Top bar → project dropdown → **New Project**.
3. Name it `swiftreach`. Click **Create**.
4. After it provisions, switch to it via the project dropdown.

---

## Step 2 — Enable APIs

1. **APIs & Services** → **Library** (left sidebar).
2. Search for and **Enable** each of these:
   - **Google Drive API**
   - **Google Picker API**
   - **Google Sheets API**

---

## Step 3 — OAuth consent screen

You have to do this **before** creating credentials, otherwise Step 4 fails.

1. **APIs & Services** → **OAuth consent screen**.
2. **User Type:** External → **Create**.
3. App information:
   - **App name:** `SwiftReach`
   - **User support email:** your email
   - **Developer contact email:** your email
4. **Save and continue**.
5. **Scopes** → **Add or Remove Scopes** → search `drive.readonly` →
   check **`.../auth/drive.readonly`** → **Update** → **Save and continue**.
6. **Test users** → **Add Users** → add your own Gmail (and any teammates who
   need to test) → **Save and continue**.

The app is now in **Testing** mode. Up to 100 test users can use it without
formal Google review. To go beyond that, click **Publish App** later.

---

## Step 4 — OAuth 2.0 Client ID

1. **APIs & Services** → **Credentials**.
2. **Create Credentials** → **OAuth 2.0 Client ID**.
3. **Application type:** Web application.
4. **Name:** `SwiftReach Web`.
5. **Authorized JavaScript origins** — add **both**:
   - `http://localhost:3000`
   - `https://swiftreach.app` *(or your production URL)*
6. **Authorized redirect URIs** — add the same two URLs:
   - `http://localhost:3000`
   - `https://swiftreach.app`
7. Click **Create**.
8. Copy the **Client ID** and **Client Secret** — you'll paste them into
   `.env.local` in step 6.

---

## Step 5 — API Key (for Picker)

The Picker API uses an API key (separate from the OAuth client).

1. Still in **Credentials** → **Create Credentials** → **API Key**.
2. Click **Restrict Key** on the new key.
3. **Application restrictions** → **HTTP referrers** → add:
   - `http://localhost:3000/*`
   - `https://swiftreach.app/*`
4. **API restrictions** → **Restrict key** → select:
   - **Google Drive API**
   - **Google Picker API**
5. **Save**.
6. Copy the API key.

---

## Step 6 — Add to `.env.local`

Open `.env.local` in the project root and fill these in:

```
GOOGLE_CLIENT_ID=<paste Client ID from step 4>
GOOGLE_CLIENT_SECRET=<paste Client Secret from step 4>
GOOGLE_API_KEY=<paste API Key from step 5>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same Client ID — needs to be public for the browser>
NEXT_PUBLIC_GOOGLE_API_KEY=<same API Key — needs to be public for the browser>
```

Yes, you set the same values twice. The `NEXT_PUBLIC_` versions ship to the
browser (the Picker runs entirely client-side); the unprefixed versions stay
server-only.

**Restart `npm run dev`** so Next.js picks up the new env vars. The
`+ Pick from Drive` card will appear next to the Upload File card.

---

## Step 7 — Production (Vercel or self-hosted)

1. In Vercel project settings → **Environment Variables**, add the same five
   variables for **Production** and **Preview**.
2. Update **Authorized JavaScript origins** and **Authorized redirect URIs**
   in your OAuth client (step 4) to include your production domain — Google
   will reject any origin that's not on the list.
3. Update HTTP referrers on the API key (step 5) to match.
4. Redeploy.

---

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| Drive button never appears in the wizard | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` empty or server not restarted after editing `.env.local`. |
| `Error 400: redirect_uri_mismatch` | Origin not in **Authorized JavaScript origins** (step 4). Add `http://localhost:3000` (no trailing slash). |
| `Error 403: access_denied` | Your Gmail isn't on the **Test users** list (step 3). Add it. |
| `[401] Google access token expired` | Just pick the file again; tokens are short-lived and re-issued silently. |
| `[403] Permission denied` on a specific file | The file isn't owned by or shared with the signed-in Google account. |
| Picker shows "Choose a file" but no Sheets are listed | The Picker only shows Sheets / Excel / CSV. If a file looks like one of those but doesn't appear, its actual MIME type may differ — open it in Sheets and re-pick. |

## Privacy

The app uses the **`drive.readonly`** scope, which gives it read-only access
**only to the file the user explicitly picks** in the Google Picker. It cannot
list, browse, or download other files in the user's Drive. The OAuth access
token is short-lived, used once per import, and never stored in SwiftReach's
database.
