# Quick Start Guide - StreamSource Live Checker

Get up and running in 5 minutes!

## 1. Prerequisites

- Node.js 18 or higher
- StreamSource account credentials

## 2. Installation

```bash
# Clone the repository
git clone https://github.com/streamwall/streamwall-suite.git
cd streamwall-suite/livesheet-updater

# Install dependencies
npm install
```

## 3. Configuration

```bash
# Copy the example configuration
cp .env.example .env

# Edit with your credentials
nano .env
```

**Required settings in .env:**
```env
STREAMSOURCE_EMAIL=your@email.com
STREAMSOURCE_PASSWORD=your-password
```

## 4. Run the Service

```bash
# Start checking streams
npm start
```

You should see:
```
2024-01-01T12:00:00.000Z StreamSource Live Checker started
2024-01-01T12:00:00.000Z Check rates - Live: 120s, Offline: 420s
2024-01-01T12:00:01.000Z Connected to StreamSource API
2024-01-01T12:00:02.000Z Fetching streams from StreamSource...
```

## 5. Enable Archiving (Optional)

To automatically archive streams offline for 30+ minutes:

```bash
# Edit .env
ARCHIVE_ENABLED=true
ARCHIVE_THRESHOLD_MINUTES=30

# Restart the service
npm start
```

## 6. Using Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop
docker-compose down
```

## Common Commands

```bash
# Run tests
npm test

# Test archiving functionality
npm run test:archive

# Check test coverage
npm run test:coverage

# Debug mode
DEBUG=true npm start
```

## Troubleshooting

### "StreamSource credentials required"
→ Make sure STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD are set in .env

### "401 Unauthorized"
→ Check your credentials are correct

### Service seems slow
→ Adjust rate limits in .env:
```env
RATE_LIVE=60000   # 1 minute for live streams
RATE_OFF=300000   # 5 minutes for offline streams
```

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check [CLAUDE.md](CLAUDE.md) for technical details
- Join the Streamwall community for support

---

Need help? Open an issue on [GitHub](https://github.com/streamwall/streamwall-suite/issues)