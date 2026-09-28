# 🚀 How To Publish `LinkedIn-Auto-Poster` As A New GitHub Repo

The complete project lives in this repository at **`LinkedIn-Auto-Poster/`** (on the branch
`arena/01a0e7c5-bluemoonways`). This file contains the one-time commands to turn that folder
into a **standalone repo** — `bluemoonways/LinkedIn-Auto-Poster` — exactly like
`bluemoonways/Facebook-page-auto-poster`.

> This helper file is only for the portfolio repo. You can delete it after pushing
> (the new repo does not include it, because only the folder is copied).

---

## Option A — GitHub CLI (fastest)

```bash
# 1. Download ONLY the LinkedIn-Auto-Poster folder
git clone --branch arena/01a0e7c5-bluemoonways --single-branch \
  https://github.com/bluemoonways/bluemoonways.git /tmp/bm-src

cd /tmp/bm-src/LinkedIn-Auto-Poster

# 2. Turn the folder into its own repo
git init -b main
git add .
git commit -m "Initial commit: LinkedIn Auto Poster"

# 3. Create the public repo on GitHub and push
gh repo create bluemoonways/LinkedIn-Auto-Poster \
  --public \
  --description "Automated LinkedIn posting system built with Google Apps Script, Google Sheets, Google Drive, OAuth 2.0 and the LinkedIn Posts API." \
  --source . --remote origin --push
```

✅ Done — https://github.com/bluemoonways/LinkedIn-Auto-Poster is live.

---

## Option B — GitHub Website + Git (no CLI)

### 1. Create the repo on GitHub

1. Go to **https://github.com/new**
2. **Repository name:** `LinkedIn-Auto-Poster`
3. **Description:**
   `Automated LinkedIn posting system built with Google Apps Script, Google Sheets, Google Drive, OAuth 2.0 and the LinkedIn Posts API.`
4. **Public** → **Create repository** (do **not** add a README or .gitignore)

### 2. Push the project folder

```bash
# Download only this folder
git clone --branch arena/01a0e7c5-bluemoonways --single-branch \
  https://github.com/bluemoonways/bluemoonways.git /tmp/bm-src

cd /tmp/bm-src/LinkedIn-Auto-Poster

git init -b main
git add .
git commit -m "Initial commit: LinkedIn Auto Poster"
git remote add origin https://github.com/bluemoonways/LinkedIn-Auto-Poster.git
git push -u origin main
```

---

## Optional — Repo polish (topics)

```bash
gh repo edit bluemoonways/LinkedIn-Auto-Poster \
  --add-topic google-apps-script \
  --add-topic linkedin-api \
  --add-topic automation \
  --add-topic google-sheets \
  --add-topic oauth2 \
  --add-topic n8n
```

---

## Files that get published

```text
LinkedIn-Auto-Poster/
├── Code.gs              → Apps Script source
├── appsscript.json      → Manifest (OAuth2 library v43, scopes, web app)
├── README.md            → Project overview (Facebook-page-auto-poster style)
├── SETUP.md             → Complete setup guide + troubleshooting
└── tests/
    └── local-test.js    → Offline test harness (Node.js) — 56 checks, no account needed
```

---

## Before pushing (safety check)

```bash
grep -riE "client_secret|access_token|spreadsheet_id" LinkedIn-Auto-Poster/Code.gs
```

The only matches should be **Script Property names** and placeholders — never real values.
Credentials stay inside Apps Script **Project Settings → Script Properties**.
