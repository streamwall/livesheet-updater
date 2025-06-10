# Livestream Checker

A lightweight Node.js app that checks TikTok and YouTube livestream URLs from a Google Sheet and updates their status.

This tool:
- Checks whether TikTok or YouTube streams are currently **Live** or **Offline** via HTTP requests
- Updates a Google Sheet with the status and timestamps
- Remembers the most recent "Live" timestamp in the `"Last Live (PST)"` column
- No browser automation required - uses direct HTTP requests

---

## 🔧 Requirements

- Node.js 18+ (for native fetch support)
- Docker (optional)
- A Google Cloud service account with access to a Google Sheet

---

## 🗂 Project Files

| File                 | Purpose                                   |
|----------------------|-------------------------------------------|
| `main.js`            | Main app logic (checks streams via HTTP) |
| `Dockerfile`         | Builds the Docker container               |
| `creds.example.json`   | Template for Google service account key |
| `package.json`       | Node dependencies for Google Sheets API   |

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
5. Share your Google Sheet with the service account's email

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

## 🐳 Docker: Build the Container

```shell
docker build -t tiktok-checker .
```

## 🚀 Run the App

### Local Node.js
```shell
npm install
node main.js
```

### Docker
```shell
docker run -it --rm \
  -v $(pwd)/creds.json:/app/creds.json \
  tiktok-checker
```

### Docker Compose (Recommended)
```shell
docker-compose up -d
```

To view logs:
```shell
docker-compose logs -f
```

To stop:
```shell
docker-compose down
```

### ✅ Notes:
- The app runs in a loop and respects rate limits:
  - Live feeds checked every ~2 minutes
  - Offline feeds checked every ~7 minutes
- No browser or cookies needed - uses direct HTTP requests
- Lighter and faster than browser automation