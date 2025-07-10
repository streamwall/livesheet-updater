import { jest, describe, test, expect, beforeEach } from '@jest/globals';

describe('config module', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear all environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('RATE_') || key.startsWith('STREAMSOURCE_') || key.startsWith('ARCHIVE_') || key === 'DEBUG') {
        delete process.env[key];
      }
    });
    // Clear module cache to re-import config
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('config defaults', () => {
    test('should use default values when env vars not set', async () => {
      const { config } = await import('./config.js');
      
      expect(config.RATE_LIVE).toBe(120000); // 2 minutes
      expect(config.RATE_OFF).toBe(420000); // 7 minutes
      expect(config.LOOP_DELAY_MIN).toBe(10000);
      expect(config.LOOP_DELAY_MAX).toBe(20000);
      expect(config.STREAMSOURCE_API_URL).toBe('https://api.streamsource.com');
      expect(config.ARCHIVE_ENABLED).toBe(false);
      expect(config.ARCHIVE_THRESHOLD_MINUTES).toBe(30);
      expect(config.ARCHIVE_CHECK_INTERVAL).toBe(300000); // 5 minutes
      expect(config.DEBUG).toBe(false);
    });
  });

  describe('config from environment', () => {
    test('should use environment variables when set', async () => {
      process.env.RATE_LIVE = '60000';
      process.env.RATE_OFF = '180000';
      process.env.STREAMSOURCE_API_URL = 'https://custom.api.com';
      process.env.STREAMSOURCE_EMAIL = 'test@example.com';
      process.env.STREAMSOURCE_PASSWORD = 'password123';
      process.env.ARCHIVE_ENABLED = 'true';
      process.env.ARCHIVE_THRESHOLD_MINUTES = '15';
      process.env.ARCHIVE_CHECK_INTERVAL = '600000';
      process.env.DEBUG = 'true';

      const { config } = await import('./config.js');
      
      expect(config.RATE_LIVE).toBe(60000);
      expect(config.RATE_OFF).toBe(180000);
      expect(config.STREAMSOURCE_API_URL).toBe('https://custom.api.com');
      expect(config.STREAMSOURCE_EMAIL).toBe('test@example.com');
      expect(config.STREAMSOURCE_PASSWORD).toBe('password123');
      expect(config.ARCHIVE_ENABLED).toBe(true);
      expect(config.ARCHIVE_THRESHOLD_MINUTES).toBe(15);
      expect(config.ARCHIVE_CHECK_INTERVAL).toBe(600000);
      expect(config.DEBUG).toBe(true);
    });

    test('should handle invalid numeric values gracefully', async () => {
      process.env.RATE_LIVE = 'not-a-number';
      process.env.RATE_OFF = 'invalid';
      process.env.ARCHIVE_THRESHOLD_MINUTES = 'abc';
      process.env.ARCHIVE_CHECK_INTERVAL = '';

      const { config } = await import('./config.js');
      
      expect(config.RATE_LIVE).toBe(NaN);
      expect(config.RATE_OFF).toBe(NaN);
      expect(config.ARCHIVE_THRESHOLD_MINUTES).toBe(NaN);
      expect(config.ARCHIVE_CHECK_INTERVAL).toBe(300000); // Empty string defaults to default value
    });

    test('should handle boolean values correctly', async () => {
      process.env.ARCHIVE_ENABLED = 'false';
      process.env.DEBUG = 'TRUE';

      const { config } = await import('./config.js');
      
      expect(config.ARCHIVE_ENABLED).toBe(false);
      expect(config.DEBUG).toBe(false); // Only lowercase 'true' should be true
    });
  });

  describe('validateConfig', () => {
    test('should throw error when credentials are missing', async () => {
      const { validateConfig } = await import('./config.js');
      
      expect(() => validateConfig()).toThrow('StreamSource credentials required: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD');
    });

    test('should throw error when only email is missing', async () => {
      process.env.STREAMSOURCE_PASSWORD = 'password123';
      
      const { validateConfig } = await import('./config.js');
      
      expect(() => validateConfig()).toThrow('StreamSource credentials required: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD');
    });

    test('should throw error when only password is missing', async () => {
      process.env.STREAMSOURCE_EMAIL = 'test@example.com';
      
      const { validateConfig } = await import('./config.js');
      
      expect(() => validateConfig()).toThrow('StreamSource credentials required: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD');
    });

    test('should not throw when both credentials are present', async () => {
      process.env.STREAMSOURCE_EMAIL = 'test@example.com';
      process.env.STREAMSOURCE_PASSWORD = 'password123';
      
      const { validateConfig } = await import('./config.js');
      
      expect(() => validateConfig()).not.toThrow();
    });
  });
});