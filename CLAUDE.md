# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js application that monitors livestream status for TikTok, YouTube, and Twitch channels. It reads URLs from a Google Sheet, checks their live status via HTTP requests, and updates the sheet with current status and timestamps.

The app also monitors a "Known Streamers" tab to automatically add live streamers to the main Livesheet when they go live.

## Key Architecture Points

### Core Components
- **main.js**: Backward-compatible entry point that imports from src/
- **src/**: Modular source code organized by functionality
  - **app.js**: Application factory that wires together all dependencies
  - **index.js**: Main loop logic with attachMainLoop function
  - **config/constants.js**: All configuration constants in one place
  - **utils/**: Reusable utility functions (logger, url, priority, sheets, delay)
  - **services/**: Core business logic (streamChecker, batchUpdater, knownStreamers)
  - **lib/googleSheets.js**: Google Sheets initialization and setup
- **main.test.js**: Comprehensive unit tests with ~90% coverage (83 tests)
- **Dependency Injection**: Factory pattern allows all external dependencies to be mocked
- **HTTP-based Status Checking**: Direct HTTP requests to platform URLs (no browser automation)
- **Batch Updates**: Accumulates status updates and writes them in batches to minimize API calls

### Important Patterns
- **Case-insensitive column handling**: The app uses helper functions `getField()` and `setField()` to handle column names case-insensitively
- **Rate limiting**: Different check intervals for live (2 min) vs offline (7 min) streams
- **Known streamers rate limiting**: Priority-based checking with exponential decay (0-100 percentile)
- **Race condition protection**: Checks timestamps before updates to prevent concurrent modification conflicts
- **Priority-based checking**: Prioritizes newly added streams, currently live streams, and recently live streams
- **Duplicate prevention**: Checks if URLs already exist in Livesheet before adding from Known Streamers

### Platform-specific Detection
- **TikTok**: Looks for `"isLiveBroadcast":true` in response
- **YouTube**: Multiple indicators including `"isLiveBroadcast":"True"` without `endDate`
- **Twitch**: Checks for `"isLiveBroadcast":true` and other live indicators

## Common Development Commands

```bash
# Install dependencies
npm install

# Run the application locally
node main.js

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test by name
npm test -- --testNamePattern="handles offline streamers"

# Build Docker image
docker build -t tiktok-checker .

# Run with Docker Compose (recommended for production)
docker-compose up -d

# View Docker logs
docker-compose logs -f

# Stop Docker container
docker-compose down
```

## Configuration Requirements

1. **Google Service Account**: Must have a `creds.json` file with service account credentials
2. **Google Sheet Access**: Service account must have Editor access to the target sheet
3. **Livesheet Structure**: Must have columns: Source, Platform, Link, Status, Last Checked (PST), Last Live (PST), Added Date
4. **Known Streamers Structure** (optional): Must have columns: Source (optional), URL, City, State, Priority (percentile 0-100)
5. **Sheet Names**: 
   - Main sheet tab must be named "Livesheet" (case-sensitive)
   - Known streamers tab must be named "Known Streamers" (case-sensitive)

## Environment Variables

- `DEBUG`: Set to any value to enable debug logging
- `NODE_ENV`: Set to "production" in Docker deployment
- `TZ`: Timezone (defaults to America/Los_Angeles in Docker)
- `KNOWN_STREAMERS_ONLY`: Set to "true" to run in known streamers only mode (testing)

## Important Constants

- `SHEET_ID`: Hardcoded Google Sheet ID
- `SHEET_NAME`: "Livesheet"
- `KNOWN_STREAMERS_SHEET_NAME`: "Known Streamers"
- `RATE_LIVE`: 2 minutes between checks for live streams
- `RATE_OFF`: 7 minutes between checks for offline streams
- `RECENTLY_LIVE_THRESHOLD`: 20 minutes - streams checked more frequently if live within this time
- `BASE_CHECK_RATE`: 15 minutes - minimum check interval for priorities < 100
- `MIN_CHECK_RATE`: 0 - priority 100 has no rate limit
- `MAX_CHECK_RATE`: 90 minutes - maximum check interval for priority 0
- `PRIORITY_ALWAYS_CHECK`: 100 - priority value for always checking
- `MAX_KNOWN_STREAMERS_PER_CYCLE`: 10 - max streamers to check per cycle to avoid rate limits

## Testing Architecture

The code uses a factory function pattern for dependency injection:

```javascript
const app = createApp({ fs, GoogleAuth, GoogleSpreadsheet, fetch, console, process, setTimeout, Date });
```

This allows all external dependencies to be mocked in tests, achieving ~90% test coverage without any network calls or file system access.

### Key Testing Patterns

1. **Mock Dependencies**: All external services (Google Sheets, fetch, filesystem) are mocked
2. **Priority Testing**: Tests use priority 100 to avoid rate limiting in tests
3. **Log Message Format**: Console logs use template literals, so test expectations must match:
   ```javascript
   // Correct expectation format:
   expect(mockDeps.console.log).toHaveBeenCalledWith(
     expect.any(String), // timestamp
     `[Known 0] Already in Livesheet: ${url}`
   );
   ```
4. **Test Coverage**: 83 tests covering all major functionality including edge cases

## Recent Changes (January 2025)

- **Test Improvements**: Fixed all previously skipped tests in the checkKnownStreamers test suite
- **Unified Codebase**: Merged refactored code into main.js, removed duplicate files
- **Test Fixes Applied**:
  - Updated test expectations to match template literal log format
  - Added priority 100 to test streamers to avoid rate limiting issues
  - Fixed mock implementations for proper field access with getField()
  - All 83 tests now pass successfully
- **Priority System Update**: Changed from inverse formula to percentile-based exponential decay with base minimum
  - Priority is now a 0-100 percentile value
  - Priority 100: checked every cycle (no rate limit)
  - Priority 0-99: Formula: `interval = 15 minutes + (75 minutes × 2^(-4 × priority/100))`
  - Minimum 15-minute interval for all priorities < 100 (prevents excessive API calls)
  - High priorities (90+) get checked every ~20 minutes
  - Low priorities (0-30) get checked every 48-90 minutes
- **Code Refactoring**: Modularized the 600+ line main.js into organized src/ directory
  - Separated concerns into config/, utils/, services/, and lib/ modules
  - Maintained backward compatibility with thin wrapper in main.js
  - Each module has focused responsibility (single responsibility principle)
  - Improved maintainability and code organization
  - All tests continue to pass without modification

## Code Quality Commands

```bash
# Lint and typecheck commands (when available)
npm run lint
npm run typecheck
```

If these commands are not available but the user needs them, suggest adding them to package.json and creating appropriate configuration files.