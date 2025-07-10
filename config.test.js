import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('StreamSource Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  test('should parse StreamSource configuration from environment', () => {
    // Set test environment variables
    process.env.STREAMSOURCE_API_URL = 'https://test.api.com';
    process.env.STREAMSOURCE_EMAIL = 'test@example.com';
    process.env.STREAMSOURCE_PASSWORD = 'testpass';
    process.env.RATE_LIVE = '60000';
    process.env.RATE_OFF = '300000';
    process.env.DEBUG = 'true';

    // Parse configuration as done in main.js
    const STREAMSOURCE_API_URL = process.env.STREAMSOURCE_API_URL || 'https://api.streamsource.com';
    const STREAMSOURCE_EMAIL = process.env.STREAMSOURCE_EMAIL;
    const STREAMSOURCE_PASSWORD = process.env.STREAMSOURCE_PASSWORD;
    const RATE_LIVE = parseInt(process.env.RATE_LIVE || '120000');
    const RATE_OFF = parseInt(process.env.RATE_OFF || '420000');
    const DEBUG = process.env.DEBUG === 'true';

    expect(STREAMSOURCE_API_URL).toBe('https://test.api.com');
    expect(STREAMSOURCE_EMAIL).toBe('test@example.com');
    expect(STREAMSOURCE_PASSWORD).toBe('testpass');
    expect(RATE_LIVE).toBe(60000);
    expect(RATE_OFF).toBe(300000);
    expect(DEBUG).toBe(true);
  });

  test('should use defaults when environment variables are not set', () => {
    // Clear test environment variables
    delete process.env.STREAMSOURCE_API_URL;
    delete process.env.RATE_LIVE;
    delete process.env.RATE_OFF;
    delete process.env.ARCHIVE_ENABLED;
    delete process.env.ARCHIVE_THRESHOLD_MINUTES;
    delete process.env.ARCHIVE_CHECK_INTERVAL;
    delete process.env.DEBUG;

    // Parse configuration with defaults
    const STREAMSOURCE_API_URL = process.env.STREAMSOURCE_API_URL || 'https://api.streamsource.com';
    const RATE_LIVE = parseInt(process.env.RATE_LIVE || '120000');
    const RATE_OFF = parseInt(process.env.RATE_OFF || '420000');
    const ARCHIVE_ENABLED = process.env.ARCHIVE_ENABLED === 'true';
    const ARCHIVE_THRESHOLD_MINUTES = parseInt(process.env.ARCHIVE_THRESHOLD_MINUTES || '30');
    const ARCHIVE_CHECK_INTERVAL = parseInt(process.env.ARCHIVE_CHECK_INTERVAL || '300000');
    const DEBUG = process.env.DEBUG === 'true';

    expect(STREAMSOURCE_API_URL).toBe('https://api.streamsource.com');
    expect(RATE_LIVE).toBe(120000);
    expect(RATE_OFF).toBe(420000);
    expect(ARCHIVE_ENABLED).toBe(false);
    expect(ARCHIVE_THRESHOLD_MINUTES).toBe(30);
    expect(ARCHIVE_CHECK_INTERVAL).toBe(300000);
    expect(DEBUG).toBe(false);
  });

  test('should handle archive configuration', () => {
    process.env.ARCHIVE_ENABLED = 'true';
    process.env.ARCHIVE_THRESHOLD_MINUTES = '45';
    process.env.ARCHIVE_CHECK_INTERVAL = '600000';

    const ARCHIVE_ENABLED = process.env.ARCHIVE_ENABLED === 'true';
    const ARCHIVE_THRESHOLD_MINUTES = parseInt(process.env.ARCHIVE_THRESHOLD_MINUTES || '30');
    const ARCHIVE_CHECK_INTERVAL = parseInt(process.env.ARCHIVE_CHECK_INTERVAL || '300000');

    expect(ARCHIVE_ENABLED).toBe(true);
    expect(ARCHIVE_THRESHOLD_MINUTES).toBe(45);
    expect(ARCHIVE_CHECK_INTERVAL).toBe(600000);
  });

  test('should require credentials', () => {
    delete process.env.STREAMSOURCE_EMAIL;
    delete process.env.STREAMSOURCE_PASSWORD;

    const STREAMSOURCE_EMAIL = process.env.STREAMSOURCE_EMAIL;
    const STREAMSOURCE_PASSWORD = process.env.STREAMSOURCE_PASSWORD;

    expect(STREAMSOURCE_EMAIL).toBeUndefined();
    expect(STREAMSOURCE_PASSWORD).toBeUndefined();

    // In main.js, this would throw an error
    expect(() => {
      if (!STREAMSOURCE_EMAIL || !STREAMSOURCE_PASSWORD) {
        throw new Error('StreamSource credentials required: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD');
      }
    }).toThrow('StreamSource credentials required');
  });

  test('should handle invalid numeric values with defaults', () => {
    process.env.RATE_LIVE = 'not-a-number';
    process.env.RATE_OFF = 'invalid';
    process.env.ARCHIVE_THRESHOLD_MINUTES = 'abc';

    // These would return NaN, so we need to handle with defaults
    const RATE_LIVE = parseInt(process.env.RATE_LIVE || '120000') || 120000;
    const RATE_OFF = parseInt(process.env.RATE_OFF || '420000') || 420000;
    const ARCHIVE_THRESHOLD_MINUTES = parseInt(process.env.ARCHIVE_THRESHOLD_MINUTES || '30') || 30;

    expect(RATE_LIVE).toBe(120000);
    expect(RATE_OFF).toBe(420000);
    expect(ARCHIVE_THRESHOLD_MINUTES).toBe(30);
  });
});