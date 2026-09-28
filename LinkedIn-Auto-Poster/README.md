# 💼 LinkedIn Auto Poster

🚀 Automated LinkedIn publishing system built with **Google Apps Script**, **Google Sheets**, **Google Drive**, **OAuth 2.0**, and the **LinkedIn Posts API**.

This system reads queued posts from Google Sheets, prepares and formats the content, optionally retrieves images from Google Drive, publishes the post to the authenticated LinkedIn profile, and updates the publishing status automatically — on a daily schedule, with zero manual work.

---

## ✨ Features

- 📤 Automated LinkedIn posting (text + image posts)
- ⏰ Daily scheduled publishing (time-based trigger)
- 📊 Google Sheets content queue
- 🖼️ Optional Google Drive images (uploaded through the LinkedIn Images API)
- 🔗 Automatic GitHub project link
- 🌐 Automatic portfolio link
- 🔐 LinkedIn OAuth 2.0 authorization (openid, profile, w_member_social)
- ♻️ Automatic access-token refresh handling
- 🕒 Published timestamp tracking
- 📌 Publishing status tracking (Publishing / Published / Failed)
- ⚠️ Failed-post handling with clear error logs
- 🔒 Script Lock protection (no double publishing)
- 🧪 Preview / dry-run before publishing
- 📝 LinkedIn "Little Text Format" escaping
- 🩺 Built-in OAuth diagnostic tool

---

## 🔄 Workflow

```text
📊 Google Sheet
      ↓
🔎 Find Next Unpublished Post
      ↓
📝 Prepare Post Content
      ├── 🧹 Escape LinkedIn Text Format
      ├── 🔗 GitHub Link
      ├── 🌐 Portfolio Link
      └── 🖼️ Optional Drive Image → LinkedIn Images API
      ↓
📡 LinkedIn Posts API ( /rest/posts )
      ↓
💼 LinkedIn Profile
      ↓
📊 Update Google Sheet
      ├── ✅ Published
      └── ❌ Failed
```

---

## 📊 Google Sheet Structure

The script automatically searches for the following header names (case-insensitive):

| Header | Purpose |
|---|---|
| 📝 Post Content | Main LinkedIn post content |
| 🔗 GitHub Link | Project/repository URL |
| 🖼️ Image Link | Google Drive image URL |
| 🔒 LinkedIn Status | Publishing status (script managed) |
| 🕒 Published At | Publication date and time (script managed) |
| 📁 Repo | Optional repository/reference |
| 🔢 Serial | Optional post serial number |

Only **Post Content** and **LinkedIn Status** are mandatory — the rest are optional.

---

## ⚙️ Configuration

The project uses Google Apps Script **Script Properties** for secure configuration.

Required properties:

```text
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_POSTS_SPREADSHEET_ID=your_google_spreadsheet_id
```

⚠️ **Never put real values inside `Code.gs`.**

---

## 🚀 Setup (Quick Version)

1. **LinkedIn Developer Portal** → create an app → request the products
   **“Share on LinkedIn”** (`w_member_social`) and
   **“Sign In with LinkedIn using OpenID Connect”** (`openid`, `profile`).
2. Add the **Authorized redirect URL** printed by `logRedirectUri()`.
3. In Apps Script: **Project Settings → Script Properties** → add the 3 properties above.
4. Apps Script: **Services / Libraries → add OAuth2** (handled automatically by `appsscript.json`).
5. **Deploy → New deployment → Web app** (Execute as: *Me*, Access: *Anyone*) and authorize it.
6. Run `authorizeLinkedIn()` → open the logged URL → approve.
7. Run `checkLinkedInAuthorization()` → run `publishNextLinkedInPost()`.
8. Run `setupDailyLinkedInTrigger()` once to enable daily auto-posting.

📘 Full step-by-step instructions: **[SETUP.md](SETUP.md)**

---

## ⏰ Scheduling

The project supports automated daily publishing through an Apps Script time-based trigger.

### Create Daily Trigger

```text
setupDailyLinkedInTrigger()          // default: 2 PM (script timezone)
setupDailyLinkedInTrigger(9)         // custom: 9 AM
```

### Remove Daily Trigger

```text
removeDailyLinkedInTrigger()
```

The default trigger runs around **2 PM** according to the Apps Script project's timezone.

---

## 🧪 Testing

### 🔍 Diagnostic

```text
diagnoseLinkedInAuth()
```

Logs token status, ID-token expiry, refresh-token availability, the OAuth2 library `hasAccess()` result and the last OAuth error.

### ✅ Check LinkedIn Authorization

```text
checkLinkedInAuthorization()
```

Checks whether the stored LinkedIn access token is still usable.

### 👀 Preview The Next Post

```text
previewNextLinkedInPost()
```

Dry run — logs exactly what the next post will contain and whether the image uploaded successfully. **Nothing is published.**

### 📤 Test LinkedIn Post

```text
testLinkedInPost()
```

Publishes a test post to the authenticated LinkedIn profile.

### 💻 Offline Tests (optional)

```bash
node tests/local-test.js
```

Run the whole publishing flow against mocked Apps Script + LinkedIn APIs —
no LinkedIn or Google account required. Useful before changing the code.

---

## 🛠️ Main Functions

| Function | Purpose |
|---|---|
| 📖 `getProps_()` | Shortcut to the Script Properties store |
| 🔑 `getRequiredProperty_(key)` | Reads a required Script Property |
| 🆔 `getSpreadsheetId_()` | Reads the post-queue spreadsheet ID |
| 🔐 `getLinkedInService_()` | Builds the LinkedIn OAuth2 service |
| 🎫 `getValidLinkedInAccessToken_()` | Returns a valid access token (refreshes when possible) |
| ✅ `hasValidLinkedInAccessToken_()` | Validates the actual LinkedIn access token |
| 🚀 `authorizeLinkedIn()` | Starts the LinkedIn authorization flow |
| 🔁 `authCallback(request)` | OAuth 2.0 redirect callback |
| 🔍 `checkLinkedInAuthorization()` | Manually checks authorization |
| 🔗 `logRedirectUri()` | Logs the OAuth redirect URI to whitelist on LinkedIn |
| 🩺 `diagnoseLinkedInAuth()` | Full OAuth/token diagnostic |
| ♻️ `resetLinkedInAuthorization()` | Deletes the stored token |
| 🆔 `getLinkedInPersonUrn_(token)` | Cached `urn:li:person:{id}` lookup |
| 🧹 `escapeLinkedInText_(text)` | Escapes LinkedIn Little Text Format characters |
| 📝 `buildLinkedInCommentary_(text, link)` | Builds the final post body + links |
| 🆔 `getDriveFileIdFromUrl_(url)` | Extracts a Google Drive file ID |
| 🖼️ `getImageBlobFromDrive_(fileId)` | Retrieves an image from Google Drive |
| 📤 `uploadImageToLinkedIn_(...)` | Uploads an image and returns its image URN |
| 📡 `publishLinkedInPost_(...)` | Calls the LinkedIn Posts API |
| 🧪 `testLinkedInPost()` | Publishes a test post |
| 👀 `previewNextLinkedInPost()` | Dry run for the next queued post |
| ⏰ `setupDailyLinkedInTrigger(hour)` | Creates the daily publishing trigger |
| 🗑️ `removeDailyLinkedInTrigger()` | Removes the publishing trigger |
| 🚀 `publishNextLinkedInPost()` | Publishes the next queued post |

---

## 📁 Repository Structure

```text
LinkedIn-Auto-Poster/
├── Code.gs              → Apps Script source (paste into the editor)
├── appsscript.json      → Manifest (OAuth2 library, scopes, web app config)
├── README.md            → Project overview (this file)
├── SETUP.md             → Complete step-by-step setup guide
└── tests/
    └── local-test.js    → Offline test harness (Node.js, no account needed)
```

---

## 💻 Tech Stack

- 🟨 Google Apps Script (V8)
- 💛 JavaScript
- 📊 Google Sheets
- 📁 Google Drive
- 💼 LinkedIn Posts API (`/rest/posts`, `/rest/images`)
- 🔐 OAuth 2.0 — `openid`, `profile`, `w_member_social`
- 🔑 Apps Script Script Properties
- ⏰ Apps Script Time-based Triggers
- 📚 OAuth2 for Apps Script library

---

## 🚀 Project Implementation

Built to automate LinkedIn publishing using **Google Apps Script, Google Sheets, Google Drive, OAuth 2.0 and the LinkedIn Posts API**.

The system provides a spreadsheet-based content queue, automated publishing, image handling, status tracking, daily scheduling and built-in diagnostics.

👉 [View / Download Apps Script Code](Code.gs) · 📘 [Setup Guide](SETUP.md)

---

## 👨‍💻 Author

**Faheem Abbas**

🤖 AI Automation Specialist | ⚙️ n8n Expert | 🧠 AI Agents | 🚀 AI-Powered Business Automation | 🎯 Lead Generation | 🔗 API Integrations | 📞 Calling Agents

### 📩 Contact

For custom implementation or commercial use, please contact me:
<br>

<a href="https://wa.me/923002120566">
  <img src="https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp">
</a>

<a href="https://www.linkedin.com/in/faheem-abbas-ai-automation-specialist/">
  <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn">
</a>

<a href="mailto:info.bluemoonways@gmail.com">
  <img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail">
</a>

---

## 🌐 Portfolio Link:
https://bluemoonways.vercel.app/
<br>
