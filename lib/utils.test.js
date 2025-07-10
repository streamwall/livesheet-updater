import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { log, debug, delay, rand, FETCH_HEADERS, USER_AGENT } from './utils.js';

describe('utils module', () => {
  let originalLog;
  let originalDebug;
  let originalEnv;

  beforeEach(() => {
    // Save original console methods
    originalLog = console.log;
    originalDebug = console.debug;
    originalEnv = process.env.DEBUG;
    
    // Mock console methods
    console.log = jest.fn();
    console.debug = jest.fn();
    
    // Mock Date
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalLog;
    console.debug = originalDebug;
    process.env.DEBUG = originalEnv;
    
    // Restore timers
    jest.useRealTimers();
  });

  describe('log function', () => {
    test('should log with timestamp', () => {
      log('Test message');
      
      expect(console.log).toHaveBeenCalledWith('2024-01-01T12:00:00.000Z', 'Test message');
    });

    test('should log multiple arguments', () => {
      log('Error:', 'Something went wrong', 123);
      
      expect(console.log).toHaveBeenCalledWith('2024-01-01T12:00:00.000Z', 'Error:', 'Something went wrong', 123);
    });

    test('should handle empty arguments', () => {
      log();
      
      expect(console.log).toHaveBeenCalledWith('2024-01-01T12:00:00.000Z');
    });

    test('should handle objects and arrays', () => {
      const obj = { key: 'value' };
      const arr = [1, 2, 3];
      
      log('Data:', obj, arr);
      
      expect(console.log).toHaveBeenCalledWith('2024-01-01T12:00:00.000Z', 'Data:', obj, arr);
    });
  });

  describe('debug function', () => {
    test('should not log when DEBUG is not set', () => {
      delete process.env.DEBUG;
      
      debug('Debug message');
      
      expect(console.log).not.toHaveBeenCalled();
    });

    test('should not log when DEBUG is false', () => {
      process.env.DEBUG = '';
      
      debug('Debug message');
      
      expect(console.log).not.toHaveBeenCalled();
    });

    test('should log when DEBUG is set', () => {
      process.env.DEBUG = 'true';
      
      debug('Debug message');
      
      expect(console.log).toHaveBeenCalledWith('2024-01-01T12:00:00.000Z', '[DEBUG]', 'Debug message');
    });

    test('should log multiple arguments when DEBUG is set', () => {
      process.env.DEBUG = 'true';
      
      debug('Error details:', { code: 500 }, 'at line 42');
      
      expect(console.log).toHaveBeenCalledWith('2024-01-01T12:00:00.000Z', '[DEBUG]', 'Error details:', { code: 500 }, 'at line 42');
    });
  });

  describe('delay function', () => {
    test('should resolve after specified milliseconds', async () => {
      const delayPromise = delay(1000);
      
      // Should not be resolved immediately
      expect(jest.getTimerCount()).toBe(1);
      
      // Fast-forward time
      jest.advanceTimersByTime(999);
      
      // Still not resolved
      expect(jest.getTimerCount()).toBe(1);
      
      // Fast-forward the remaining time
      jest.advanceTimersByTime(1);
      
      // Now it should resolve
      await expect(delayPromise).resolves.toBeUndefined();
    });

    test('should handle zero delay', async () => {
      const delayPromise = delay(0);
      
      jest.advanceTimersByTime(0);
      
      await expect(delayPromise).resolves.toBeUndefined();
    });

    test('should handle negative delay as zero', async () => {
      const delayPromise = delay(-100);
      
      jest.advanceTimersByTime(0);
      
      await expect(delayPromise).resolves.toBeUndefined();
    });
  });

  describe('rand function', () => {
    test('should return a promise that resolves after random delay between min and max', async () => {
      const min = 100;
      const max = 200;
      
      const randPromise = rand(min, max);
      
      // Should have a timer set
      expect(jest.getTimerCount()).toBe(1);
      
      // Fast forward to just before min time
      jest.advanceTimersByTime(99);
      expect(jest.getTimerCount()).toBe(1);
      
      // Fast forward to max time
      jest.advanceTimersByTime(101);
      
      // Should resolve
      await expect(randPromise).resolves.toBeUndefined();
    });
    
    test('should work with equal min and max', async () => {
      const randPromise = rand(100, 100);
      
      jest.advanceTimersByTime(100);
      
      await expect(randPromise).resolves.toBeUndefined();
    });
  });

  describe('USER_AGENT constant', () => {
    test('should be a valid user agent string', () => {
      expect(USER_AGENT).toContain('Mozilla/5.0');
      expect(USER_AGENT).toContain('Chrome');
      expect(USER_AGENT).toContain('Macintosh');
    });
  });

  describe('FETCH_HEADERS constant', () => {
    test('should have all required headers', () => {
      expect(FETCH_HEADERS).toHaveProperty('User-Agent');
      expect(FETCH_HEADERS).toHaveProperty('Accept');
      expect(FETCH_HEADERS).toHaveProperty('Accept-Language');
      expect(FETCH_HEADERS).toHaveProperty('Accept-Encoding');
      expect(FETCH_HEADERS).toHaveProperty('Cache-Control');
      expect(FETCH_HEADERS).toHaveProperty('Pragma');
    });

    test('should have correct User-Agent', () => {
      expect(FETCH_HEADERS['User-Agent']).toContain('Mozilla/5.0');
      expect(FETCH_HEADERS['User-Agent']).toContain('Chrome');
    });

    test('should have correct Accept header', () => {
      expect(FETCH_HEADERS['Accept']).toContain('text/html');
      expect(FETCH_HEADERS['Accept']).toContain('application/xml');
    });

    test('should have cache control headers', () => {
      expect(FETCH_HEADERS['Cache-Control']).toBe('no-cache');
      expect(FETCH_HEADERS['Pragma']).toBe('no-cache');
    });
  });
});