# 📘 LinkedIn Auto Poster — Complete Setup Guide

Step-by-step setup for the **LinkedIn Auto Poster** Apps Script project.

Total time: **~15 minutes**. No coding required — everything is configuration.

---

## 📋 What You Need

| Requirement | Why |
|---|---|
| LinkedIn account | The profile that will be published to |
| LinkedIn Developer app | Generates the OAuth 2.0 Client ID & Secret |
| Google account | Runs the Apps Script project |
| Google Sheet | Holds the post queue (content + status) |
| Google Drive folder *(optional)* | Stores the post images |

---

## 1️⃣ Create The LinkedIn Developer App

1. Go to **https://www.linkedin.com/developers/apps** → **Create app**.
2. Fill in:
   - **App name** — e.g. `LinkedIn Auto Poster`
   - **LinkedIn Page** — a LinkedIn Page you manage (required by LinkedIn)
   - **App logo** — any square image
3. Accept the legal terms → **Create app**.
4. Open the **Settings** tab and add your **Privacy policy URL** (LinkedIn requires it; a simple page or your portfolio URL works).

### Request the required products

Open the **Products** tab and request/enable both:

| Product | Scopes granted | Purpose |
|---|---|---|
| **Share on LinkedIn** | `w_member_social` | Create posts on behalf of the member |
| **Sign In with LinkedIn using OpenID Connect** | `openid`, `profile` | Read the member ID used as the post author |

✅ Both products are **self-serve** — they are activated instantly, no manual review needed.

> ⚠️ Posting to a **company page** instead of a personal profile requires the **Community Management API** (`w_organization_social`) and LinkedIn's approval. This project posts to the authenticated member profile.

### Get the credentials

Open the **Auth** tab → copy:

- **Client ID** → goes into `LINKEDIN_CLIENT_ID`
- **Primary Client Secret** → goes into `LINKEDIN_CLIENT_SECRET`

### Add the redirect URL

Still on the **Auth** tab → **Authorized redirect URLs for your app** → **Add redirect URL**.

You will paste the URL printed by `logRedirectUri()` here (section 4). It looks like:

```text
https://script.google.com/macros/d/SCRIPT_ID/usercallback
```

⚠️ It must match **exactly** — no trailing slash, no `www`.

---

## 2️⃣ Create The Google Sheet Queue

1. Create a new Google Sheet.
2. Add these headers in **row 1** (exact names, any order — the script matches by name):

| Column | Header | Required |
|---|---|---|
| A | `Serial` | ❌ optional |
| B | `Repo` | ❌ optional |
| C | `Post Content` | ✅ required |
| D | `GitHub Link` | ❌ optional |
| E | `Image Link` | ❌ optional |
| F | `LinkedIn Status` | ✅ required (leave blank) |
| G | `Published At` | ❌ recommended |

3. Fill in your queued posts, one row per post.
4. Copy the **spreadsheet ID** from the URL:

```text
https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
```

### Optional: images

- Upload the image to Google Drive → **Share → Anyone with the link** → copy the link.
- Paste that link into the **Image Link** column, e.g.:
  `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`
- If the image fails to upload, the post still goes out as **text-only** — it never fails because of an image.

---

## 3️⃣ Create The Apps Script Project

1. Go to **https://script.google.com** → **New project** → rename it `LinkedIn Auto Poster`.
2. Replace the contents of `Code.gs` with the project's [`Code.gs`](Code.gs).
3. Open **Project Settings** (⚙️) → tick **Show "appsscript.json" manifest file in editor**.
4. Replace the contents of `appsscript.json` with the project's [`appsscript.json`](appsscript.json) — it already adds the **OAuth2 for Apps Script** library (`1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`, version 43) and the required Google scopes.
5. In **Project Settings → Script Properties** add:

```text
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_POSTS_SPREADSHEET_ID=your_google_spreadsheet_id
```

6. Set the project **timezone** (Project Settings → Time zone) to your local zone, e.g. `Asia/Karachi` — the daily trigger uses it.

---

## 4️⃣ Deploy The Web App (OAuth callback)

The OAuth flow needs a public callback URL, which is the deployed web app.

1. **Deploy → New deployment** → type **Web app**.
2. Set:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
3. Click **Deploy** → **Authorize access** → choose your Google account → *Advanced* → *Go to LinkedIn Auto Poster (unsafe)* → **Allow**.
4. Copy the **Web app URL**.

### Whitelist the redirect URI

1. In the Apps Script editor select the function `logRedirectUri` → **Run**.
2. Open **Execution log** → copy the printed URL:

```text
https://script.google.com/macros/d/SCRIPT_ID/usercallback
```

3. Paste it into the LinkedIn app → **Auth** tab → **Authorized redirect URLs for your app** → **Update**.

> 💡 If you ever change the deployment, re-run `logRedirectUri()` and update LinkedIn — a mismatched redirect URI causes `redirect_uri does not match` errors.

---

## 5️⃣ Authorize LinkedIn

1. Select the function `authorizeLinkedIn` → **Run**.
2. Copy the printed authorization URL into your browser.
3. Sign in to LinkedIn → **Allow** the requested permissions.
4. You should see **“LinkedIn authorization successful!”**
5. Back in Apps Script, run `checkLinkedInAuthorization()` → log should say
   `SUCCESS: LinkedIn access token is valid.`

**Token lifetime:** LinkedIn access tokens last ~**60 days**; refresh tokens ~**365 days**. The script automatically refreshes the access token when a refresh token is present, and clearly tells you when re-authorization is needed.

---

## 6️⃣ Test

| Step | Function | Expected result |
|---|---|---|
| 1 | `diagnoseLinkedInAuth()` | Token valid, `hasAccess()` status, no OAuth error |
| 2 | `testLinkedInPost()` | Test post appears on your LinkedIn profile |
| 3 | `previewNextLinkedInPost()` | Logs the full next post, publishes nothing |
| 4 | `publishNextLinkedInPost()` | Sheet status becomes **Published** + timestamp filled |

---

## 7️⃣ Enable Daily Auto-Posting

Run **once**:

```text
setupDailyLinkedInTrigger()      // 2 PM (script timezone)
setupDailyLinkedInTrigger(9)     // or a custom hour, 0–23
```

It removes any existing `publishNextLinkedInPost` trigger first, so it is always safe to re-run.

To stop auto-posting:

```text
removeDailyLinkedInTrigger()
```

---

## 🔁 Daily Operation

```text
Trigger fires (2 PM)
      ↓
Find next row: Post Content filled AND LinkedIn Status ≠ Published/Publishing
      ↓
Mark row as "Publishing"
      ↓
Get access token → get author URN → upload image (if any) → publish
      ↓
"Published" + timestamp   ✅   /   "Failed"   ❌
```

Each run publishes **exactly one** post — the next unpublished row in the sheet.

---

## 🩺 Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `Missing Script Property: ...` | A Script Property is missing or misspelled |
| `LinkedIn access token not found` | Run `authorizeLinkedIn()` |
| `LinkedIn access token has expired and could not be refreshed` | Run `resetLinkedInAuthorization()` then `authorizeLinkedIn()` |
| `invalid_scope` / `invalid_request` during authorization | The **Share on LinkedIn** or **Sign In with LinkedIn** product is not enabled on the LinkedIn app |
| `redirect_uri does not match` | Re-run `logRedirectUri()` and update the LinkedIn Auth tab (must match exactly) |
| `HTTP 403` / `version not supported` on posting | Bump `LINKEDIN_API_VERSION_` in `Code.gs` to a current `YYYYMM` version (LinkedIn supports each version ~12 months) |
| `HTTP 401` on posting | Token expired/revoked → re-authorize LinkedIn |
| `HTTP 429` | LinkedIn rate limit reached — try again later |
| `Post is too long for LinkedIn` | LinkedIn's `commentary` limit is 3000 characters — shorten the post |
| Image not attached | Drive file is not shared publicly, or not an image — the post goes out as text-only |
| Status stuck on `Publishing` | A run was killed mid-flight — change the status back to `Pending`/blank to retry |
| Nothing happens on schedule | Run `setupDailyLinkedInTrigger()` again and check **Triggers** (⏰) in Apps Script |

### Diagnostic function

```text
diagnoseLinkedInAuth()
```

Logs the token, its expiry, whether a refresh token exists, the ID-token expiry, the library's `hasAccess()` result and the last OAuth error — the first thing to run when something breaks.

---

## 🔐 Security Notes

- ✅ Client ID / Secret / Sheet ID live in **Script Properties** — never in the code.
- ✅ The Sheet stays private; the script reads it as you.
- ✅ Drive images only need to be readable by the script account (or public).
- ❌ Never commit real credentials to GitHub.
- 🔄 Rotate the LinkedIn client secret if it is ever exposed.

---

## 📁 Files In This Project

| File | Purpose |
|---|---|
| `Code.gs` | Complete Apps Script source |
| `appsscript.json` | Manifest: OAuth2 library, scopes, web app settings |
| `README.md` | Project overview & function reference |
| `SETUP.md` | This setup guide |
| `tests/local-test.js` | Optional offline tests (Node.js, mocked Google + LinkedIn APIs) |

---

## ✅ Sanity Check Before Going Live

```text
1. logRedirectUri()              → paste the URL into the LinkedIn Auth tab
2. authorizeLinkedIn()           → open the URL, approve
3. checkLinkedInAuthorization()  → "SUCCESS: LinkedIn access token is valid."
4. diagnoseLinkedInAuth()        → no OAuth error, refresh token present
5. previewNextLinkedInPost()     → review the exact post content
6. testLinkedInPost()            → test post appears on LinkedIn
7. publishNextLinkedInPost()     → status becomes Published in the sheet
8. setupDailyLinkedInTrigger()   → daily auto-posting enabled
```
