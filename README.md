# StreamSource Live Checker

A lightweight Node.js service that monitors live stream URLs from StreamSource API and updates their status in real-time.

This service:
- Fetches active streams from StreamSource API
- Checks whether streams are currently **Live** or **Offline** via HTTP requests
- Updates stream status and timestamps in StreamSource
- Prioritizes checking based on current status and last live time
- Optionally archives streams that have been offline for extended periods
- No browser automation required - uses direct HTTP requests

---

## 🔧 Requirements

- Node.js 18+ (for native fetch support)
- Docker (optional)
- StreamSource API credentials (email/password)

---

## 🗂 Project Files

| File/Directory          | Purpose                                        |
|-------------------------|------------------------------------------------|
| `main.js`               | Main controller (coordinates all modules)       |
| `main.test.js`          | Tests for main controller                      |
| `integration.test.js`   | Integration tests for full workflows           |
| **`lib/`**              | **Core modules directory**                     |
| `lib/streamSourceClient.js` | StreamSource API client                    |
| `lib/streamChecker.js`  | Stream status checking logic                   |
| `lib/streamArchiver.js` | Stream archiving functionality                 |
| `lib/streamPrioritizer.js` | Stream prioritization algorithm             |
| `lib/config.js`         | Configuration management                       |
| `lib/utils.js`          | Shared utilities                               |
| `lib/*.test.js`         | Unit tests for each module                     |
| **`scripts/`**          | **Utility scripts**                            |
| `scripts/test-archive.js` | Manual testing script for archiving          |
| **Docker & Config**     |                                                |
| `Dockerfile`            | Builds the Docker container                    |
| `docker-compose.yml`    | Docker Compose configuration                   |
| `package.json`          | Node.js project configuration                  |
| `.env.example`          | Environment variable template                  |
| `jest.config.js`        | Jest testing framework configuration           |

---

## 📋 How It Works

1. **Fetches Streams**: Retrieves all active (non-archived) streams from StreamSource API
2. **Prioritizes Checks**: 
   - Never checked streams get highest priority
   - Currently live streams checked every 2 minutes
   - Recently live streams (within 20 minutes) get medium priority
   - Other offline streams checked every 7 minutes
3. **Checks Status**: Makes HTTP requests to stream URLs to detect live status
4. **Updates StreamSource**: Updates stream status and timestamps via API
5. **Archives Old Streams**: Optionally archives streams offline for 30+ minutes

---

## 🚀 Quick Start

### 1. Clone and Configure

```shell
# Clone the repository
git clone <repository-url>
cd livesheet-updater

# Copy environment template
cp .env.example .env

# Edit .env with your StreamSource credentials
nano .env
```

### 2. Set Required Environment Variables

```env
STREAMSOURCE_EMAIL=your-email@example.com
STREAMSOURCE_PASSWORD=your-password
```

### 3. Run with Docker (Recommended)

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

### 4. Run without Docker

```shell
# Install dependencies (none required for production)
npm install

# Run the service
npm start
```

---

## ⚙️ Configuration

All configuration is done via environment variables:

### Required
- `STREAMSOURCE_EMAIL`: Your StreamSource login email
- `STREAMSOURCE_PASSWORD`: Your StreamSource password

### Optional
- `STREAMSOURCE_API_URL`: API endpoint (default: https://api.streamsource.com)
- `RATE_LIVE`: How often to check live streams in ms (default: 120000 = 2 minutes)
- `RATE_OFF`: How often to check offline streams in ms (default: 420000 = 7 minutes)
- `DEBUG`: Enable debug logging (default: false)

### Archiving (Optional)
- `ARCHIVE_ENABLED`: Enable auto-archiving (default: false)
- `ARCHIVE_THRESHOLD_MINUTES`: Minutes offline before archiving (default: 30)
- `ARCHIVE_CHECK_INTERVAL`: How often to check for expired streams in ms (default: 300000 = 5 minutes)

---

## 🔍 Platform Support

The service detects live status for:
- **TikTok**: Checks for `"isLiveBroadcast":true`
- **YouTube**: Multiple indicators including `isLive`, `isLiveBroadcast`
- **Twitch**: Checks for `"isLiveBroadcast":true` and other indicators

---

## 🗄️ Stream Archiving

The service can automatically archive streams that have been offline for extended periods:

1. Enable with `ARCHIVE_ENABLED=true`
2. Streams offline/unknown for 30+ minutes are archived
3. Archived streams are marked with `is_archived: true`
4. Archived streams are excluded from future checks

This keeps the active stream list manageable and improves performance.

---

## 🧪 Testing

The project includes comprehensive unit tests:

```shell
# Install dev dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Files

- `streamSourceClient.test.js` - Tests for StreamSource API client
- `checkStreamStatus.test.js` - Tests for stream status checking logic
- `main.test.js` - Tests for main loop and prioritization logic
- `integration.test.js` - Integration tests for full workflows
- `archiveExpiredStreams.test.js` - Tests for archiving logic
- `config.test.js` - Tests for configuration parsing

### Manual Integration Testing

```shell
# Test StreamSource connection and archiving
STREAMSOURCE_EMAIL=your-email@example.com \
STREAMSOURCE_PASSWORD=your-password \
node test-archive.js
```

---

## 📊 Monitoring

The service logs all operations with timestamps:
- Stream fetch results
- Individual stream checks
- Status updates
- Archive operations
- Errors and retries

Monitor logs with:
```shell
# Docker
docker-compose logs -f

# Direct
npm start
```

---

## 🔄 Rate Limiting

The service respects rate limits:
- Waits 100ms between API requests (configurable)
- Exponential backoff on rate limit errors
- Separate check intervals for live vs offline streams
- Re-authenticates automatically on 401 errors

---

## 🏗️ Architecture

```
StreamSource API
      ↓
Fetch Active Streams
      ↓
Prioritize by Status
      ↓
Check Each Stream (HTTP)
      ↓
Update Status in API
      ↓
Archive Old Streams (Optional)
      ↓
Sleep & Repeat
```

---

## 🐛 Troubleshooting

### Authentication Errors
- Verify email/password are correct
- Check API URL is accessible
- Token expires after 24 hours (auto-refreshed)

### No Streams Found
- Ensure streams exist in StreamSource
- Check that streams aren't all archived
- Verify API permissions

### Status Not Updating
- Enable DEBUG mode for detailed logs
- Check for WAF/challenge pages in responses
- Verify stream URLs are valid

### High Memory Usage
- Reduce check rates if needed
- Enable archiving to reduce active streams
- Check for memory leaks in long-running instances

---

## 🚧 Development

### Adding Platform Support
1. Add URL pattern to validation in `checkStreamStatus()`
2. Add platform detection logic
3. Add status detection for the platform's HTML

### Modifying Check Logic
1. Update patterns in `checkStreamStatus()`
2. Adjust priority logic in `main()`
3. Update rate limiting as needed

---

## 📝 License

[Your License Here]

---

## 🤝 Contributing

[Your Contributing Guidelines Here]