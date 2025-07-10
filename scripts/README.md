# Utility Scripts

This directory contains utility scripts for testing and development.

## test-archive.js

A manual testing script for the StreamSource archiving functionality. This script allows you to test the API integration with real credentials.

### Features
- Tests authentication with StreamSource API
- Fetches and displays streams
- Finds expired offline streams
- Optionally archives streams (with TEST_ARCHIVE=true)

### Usage

```bash
# Basic usage - test authentication and fetch streams
STREAMSOURCE_EMAIL=your@email.com STREAMSOURCE_PASSWORD=yourpass node scripts/test-archive.js

# Test with custom API URL
STREAMSOURCE_API_URL=https://custom.api.com STREAMSOURCE_EMAIL=your@email.com STREAMSOURCE_PASSWORD=yourpass node scripts/test-archive.js

# Test with custom threshold for expired streams (default: 15 minutes)
TEST_THRESHOLD_MINUTES=30 STREAMSOURCE_EMAIL=your@email.com STREAMSOURCE_PASSWORD=yourpass node scripts/test-archive.js

# Actually archive a stream (dry run by default)
TEST_ARCHIVE=true STREAMSOURCE_EMAIL=your@email.com STREAMSOURCE_PASSWORD=yourpass node scripts/test-archive.js
```

### Environment Variables

- `STREAMSOURCE_API_URL` - API endpoint (default: https://api.streamsource.com)
- `STREAMSOURCE_EMAIL` - Your StreamSource email (required)
- `STREAMSOURCE_PASSWORD` - Your StreamSource password (required)
- `TEST_THRESHOLD_MINUTES` - Minutes offline before considering a stream expired (default: 15)
- `TEST_ARCHIVE` - Set to "true" to actually archive a stream (default: false)