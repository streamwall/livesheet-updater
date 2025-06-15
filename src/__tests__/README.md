# Test Structure

This directory contains the test suite for the livesheet-checker application, organized by module type.

## Test Organization

```
src/__tests__/
├── utils/          # Utility function tests
│   ├── delay.test.js
│   ├── logger.test.js
│   ├── priority.test.js
│   ├── sheets.test.js
│   └── url.test.js
├── services/       # Service layer tests
│   ├── batchUpdater.test.js
│   ├── knownStreamers.test.js
│   └── streamChecker.test.js
├── lib/            # External integration tests
│   └── googleSheets.test.js
├── app.test.js     # Application factory tests
└── index.test.js   # Main loop tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:utils      # Test utility functions
npm run test:services   # Test service layer
npm run test:lib        # Test external integrations
npm run test:integration # Test app.js and index.js

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Test Coverage

The test suite achieves >90% coverage across all modules:
- **Utils**: 100% coverage - Pure functions with no side effects
- **Services**: ~99% coverage - Core business logic with mocked dependencies
- **Lib**: 100% coverage - Google Sheets initialization with error cases
- **App/Index**: ~70% coverage - Integration and wiring code

## Testing Approach

- **Dependency Injection**: All modules use factory functions that accept dependencies
- **Mocking**: External dependencies (fetch, Google Sheets, filesystem) are mocked
- **Unit Focus**: Each test file focuses on testing a single module in isolation
- **No Network Calls**: All tests run without making actual HTTP requests or API calls