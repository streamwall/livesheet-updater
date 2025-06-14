# Livestream Checker

A lightweight Node.js app that checks TikTok, YouTube, and Twitch livestream URLs from a Google Sheet and updates their status.

This tool:
- Checks whether TikTok, YouTube, or Twitch streams are currently **Live** or **Offline** via HTTP requests
- Updates a Google Sheet with the status and timestamps
- Remembers the most recent "Live" timestamp in the `"Last Live (PST)"` column
- Monitors a "Known Streamers" sheet to automatically add live streamers to the main Livesheet
- No browser automation required - uses direct HTTP requests

---

## 🔧 Requirements

- Node.js 18+ (for native fetch support)
- Docker (optional)
- A Google Cloud service account with access to a Google Sheet

---

## 🗂 Project Structure

| File/Directory       | Purpose                                          |
|----------------------|--------------------------------------------------|
| `main.js`            | Backward-compatible entry point                  |
| `main.test.js`       | Comprehensive unit tests (83 tests)              |
| `src/`               | Modular source code                              |
| ├── `index.js`       | Main loop logic                                  |
| ├── `app.js`         | Application factory and dependency wiring        |
| ├── `config/`        | Configuration and constants                      |
| │   └── `constants.js` | All app constants (rates, limits, etc)         |
| ├── `utils/`         | Utility functions                                |
| │   ├── `logger.js`  | Logging utilities                                |
| │   ├── `url.js`     | URL validation and cleaning                      |
| │   ├── `priority.js`| Priority-based rate calculation                  |
| │   ├── `sheets.js`  | Google Sheets field helpers                      |
| │   └── `delay.js`   | Promise-based delay utility                      |
| ├── `services/`      | Core business logic                              |
| │   ├── `streamChecker.js` | Stream status checking                     |
| │   ├── `batchUpdater.js`  | Batch sheet updates                        |
| │   └── `knownStreamers.js`| Known streamers monitoring                 |
| └── `lib/`           | External integrations                            |
|     └── `googleSheets.js` | Google Sheets initialization               |
| `Dockerfile`         | Builds the Docker container                      |
| `docker-compose.yml` | Docker Compose configuration                     |
| `creds.example.json` | Template for Google service account key          |
| `package.json`       | Node dependencies and test configuration         |
| `CLAUDE.md`          | Development guidelines for Claude Code           |

---

## 📄 Google Sheets Setup

### Main "Livesheet" tab
Must include at least these columns:
- `Source`
- `Platform`
- `Link`
- `Status`
- `Last Checked (PST)`
- `Last Live (PST)`

### Optional "Known Streamers" tab
For automatic monitoring of known streamers:
- `Source` (optional - will be copied to Livesheet when streamer goes live)
- `URL` (required)
- `City` (optional)
- `State` (optional)
- `Priority` (optional - percentile 0-100, higher numbers = more frequent checks)

All other columns will be preserved and ignored by the script.

Make sure:
- Your service account has **Editor** access to the sheet
- The main sheet tab must be named `"Livesheet"` (case-sensitive)
- The known streamers tab must be named `"Known Streamers"` (case-sensitive)

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

### Known Streamers Only Mode (for testing)
```shell
# Using command line argument
node main.js --known-only

# Or using environment variable
KNOWN_STREAMERS_ONLY=true node main.js
```

This mode will ONLY check the Known Streamers sheet and add live streamers to the Livesheet. It skips checking existing Livesheet entries.

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

To run in Known Streamers Only mode:
```shell
# Edit docker-compose.yml and add under environment:
# - KNOWN_STREAMERS_ONLY=true
# Or run with:
KNOWN_STREAMERS_ONLY=true docker-compose up -d
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
  - Known streamers checked based on priority percentile (0-100, higher = more frequent)
  - Priority 100 checked every cycle, priority 0 checked every 90 minutes
- No browser or cookies needed - uses direct HTTP requests
- Lighter and faster than browser automation

---

## 🧪 Testing

The project includes comprehensive unit tests using Jest with ES modules support:

### Run Tests
```shell
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test by name pattern
npm test -- --testNamePattern="handles offline streamers"

# Watch mode for development
npm run test:watch
```

### Test Coverage
The code has >90% test coverage with 95 unit tests organized by module:
- URL validation and cleaning
- Platform detection (TikTok, YouTube, Twitch)
- Live/offline status detection for all platforms
- Priority-based scheduling and rate limiting
- Known streamers functionality (monitoring, adding to Livesheet)
- Batch updates with race condition protection
- Error handling and edge cases
- Configuration and initialization

All tests use dependency injection to avoid external dependencies, making them fast and reliable.

### Priority System for Known Streamers

The priority value is a percentile (0-100) that determines how frequently a known streamer is checked, using a base minimum interval plus exponential decay:

- **Priority 100**: Checked every cycle (no rate limit)
- **Priority 0-99**: Formula: `interval = 15 minutes + (75 minutes × 2^(-4 × priority/100))`
  - Priority 99: ~20 minutes
  - Priority 95: ~20 minutes  
  - Priority 90: ~21 minutes
  - Priority 80: ~23 minutes
  - Priority 70: ~26 minutes
  - Priority 50: ~34 minutes
  - Priority 30: ~48 minutes
  - Priority 10: ~72 minutes
  - Priority 0: 90 minutes
- **Values outside 0-100**: Automatically clamped to the valid range

This system ensures a minimum 15-minute interval for all streamers (except priority 100) to avoid excessive API calls, while still prioritizing high-value streams with exponentially shorter intervals.

### Code Organization

The codebase is now modularly organized for better maintainability:

```
src/
├── index.js              # Main loop logic
├── app.js                # Application factory and dependency injection
├── config/constants.js   # All configuration constants
├── utils/                # Utility functions (url, logger, priority, etc.)
├── services/             # Core business logic (stream checking, batch updates, known streamers)
├── lib/                  # External integrations (Google Sheets)
└── __tests__/            # Comprehensive test suite organized by module
```

The main.js file serves as a backward-compatible entry point that imports from the modular structure.