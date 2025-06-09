# Livestream Checker

A Dockerized Playwright app that checks TikTok livestream URLs from a Google Sheet and updates their status.

This tool:
- Checks whether each TikTok stream is currently **Live** or **Offline**
- Updates a Google Sheet with the status and timestamps
- Remembers the most recent "Live" timestamp in the `"Last Live (PST)"` column
- Authenticates using your real TikTok session via manual cookie injection

---

## 🔧 Requirements

- Node.js (for development, optional)
- Docker
- A Google Cloud service account with access to a Google Sheet
- A logged-in TikTok session (manually exported cookies)

---

## 🗂 Project Files

| File                 | Purpose                                   |
|----------------------|-------------------------------------------|
| `main.js`            | Main app logic (runs the Playwright loop) |
| `Dockerfile`         | Builds the Docker container               |
| `cookies.example.json` | Template for TikTok session cookies     |
| `creds.example.json`   | Template for Google service account key |
| `package.json`       | Node dependencies for Playwright + Sheets |

---

## 📄 Google Sheets Setup

Your Google Sheet must include at least these columns:

- `Source`
- `Platform`
- `Link`
- `Status`
- `Last Checked (PST)`
- `Last Live (PST)`

All other columns will be preserved and ignored by the script.

Make sure:
- Your service account has **Editor** access to the sheet
- The sheet you're using is named `"Livesheet"` (case-sensitive)

---

## 🔐 Google API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a **service account**
3. Create and download a **JSON key**
4. Rename it `creds.json`
5. Share your Google Sheet with the service account’s email

Example `creds.json`:
```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  ...
}
```

## 🍪 TikTok Cookie Auth

TikTok actively blocks automation logins. Instead, you must:

1.	Log in to TikTok using Chrome
2.	Open DevTools → Application → Storage → Cookies
3.	Copy the relevant values for:
    -	sessionid
    -	sid_tt
    -	uid_tt
    -	ttwid
    -	s_v_web_id
    -	csrfToken
    -	odin_tt
4.	Format them like the provided cookies.example.json
5. Save as cookies.json in your project root.

## 🐳 Docker: Build the Container

```shell
docker build -t tiktok-checker .
```

## 🚀 Run the App

Make sure that the Chrome profile directory is correct, authed, and mapped in the volume mount below.

```shell
docker run -it --rm \
  --ipc=host \
  --privileged \
  -e HOME=/root \
  -e DISPLAY=host.docker.internal:0 \
  -v "~/Library/Application Support/Google/Chrome/Profile 1:/tiktok-profile" \
  -v $(pwd)/main.js:/app/main.js \
  -v $(pwd)/creds.json:/app/creds.json \
  -v $(pwd)/cookies.json:/app/cookies.json \
  tiktok-checker node main.js
```

### ✅ Notes:
- The DISPLAY environment assumes XQuartz is running on macOS
- You do not need to mount the Chrome profile if you’re using cookies.json for auth
- The app runs in a loop and respects rate limits:
- Live feeds checked every ~2 minutes
- Offline feeds checked every ~7 minutes