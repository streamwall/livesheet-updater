import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock the utils module before importing anything that uses it
const mockLog = jest.fn();
const mockDebug = jest.fn();

jest.unstable_mockModule('./lib/utils.js', () => ({
  log: mockLog,
  debug: mockDebug,
  FETCH_HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
}));

// Import after mocking
const { checkStreamStatus, cleanUrl, isValidLiveUrl, shouldCheckStream, detectLiveStatus } = await import('./lib/streamChecker.js');

describe('streamChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cleanUrl', () => {
    test('should clean URLs with special characters', () => {
      expect(cleanUrl(' https://twitch.tv/test\u200B ')).toBe('https://twitch.tv/test');
      expect(cleanUrl('https://twitch.tv/test\u200F')).toBe('https://twitch.tv/test');
      expect(cleanUrl(null)).toBeNull();
      expect(cleanUrl('')).toBeNull();
    });
  });

  describe('isValidLiveUrl', () => {
    test('should validate live stream URLs', () => {
      expect(isValidLiveUrl('https://twitch.tv/user')).toBe(true);
      expect(isValidLiveUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
      expect(isValidLiveUrl('https://www.tiktok.com/@user/live')).toBe(true);
      expect(isValidLiveUrl('https://invalid.com/stream')).toBe(false);
      expect(isValidLiveUrl('not-a-url')).toBe(false);
    });
  });

  describe('shouldCheckStream', () => {
    test('should respect rate limits', () => {
      const now = Date.now();
      const stream = {
        id: 1,
        status: 'live',
        last_checked_at: new Date(now - 60000).toISOString() // 1 minute ago
      };
      
      expect(shouldCheckStream(stream, 120000, 420000)).toBe(false); // 2 min rate limit
      
      stream.last_checked_at = new Date(now - 180000).toISOString(); // 3 minutes ago
      expect(shouldCheckStream(stream, 120000, 420000)).toBe(true);
    });
    
    test('should always check streams never checked before', () => {
      const stream = { id: 1, status: 'offline', last_checked_at: null };
      expect(shouldCheckStream(stream, 120000, 420000)).toBe(true);
    });
  });

  describe('detectLiveStatus', () => {
    test('should detect TikTok live status', () => {
      expect(detectLiveStatus('"isLiveBroadcast":true', 'TikTok')).toBe('live');
      expect(detectLiveStatus('some other content', 'TikTok')).toBe('offline');
    });

    test('should detect Twitch live status', () => {
      expect(detectLiveStatus('"isLiveBroadcast":true', 'Twitch')).toBe('live');
      expect(detectLiveStatus('tw-channel-status-text-indicator', 'Twitch')).toBe('live');
      expect(detectLiveStatus('"stream":{', 'Twitch')).toBe('live');
      expect(detectLiveStatus('offline content', 'Twitch')).toBe('offline');
    });

    test('should detect YouTube live status', () => {
      expect(detectLiveStatus('"isLiveBroadcast":"True"', 'YouTube')).toBe('live');
      expect(detectLiveStatus('"isLiveBroadcast":"True" ... "endDate":"2024"', 'YouTube')).toBe('offline');
      expect(detectLiveStatus('"isLive":true', 'YouTube')).toBe('live');
      expect(detectLiveStatus('offline content', 'YouTube')).toBe('offline');
    });
  });

  describe('checkStreamStatus', () => {
    test('should skip streams without URL', async () => {
      const stream = { id: 1 };
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith('Stream 1 has no URL, skipping');
    });

    test('should reject invalid URLs', async () => {
      const stream = { id: 1, link: 'not-a-url' };
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('invalid URL'));
    });

    test('should respect rate limiting', async () => {
      const now = Date.now();
      const stream = {
        id: 1,
        link: 'https://twitch.tv/test',
        platform: 'Twitch',
        status: 'live',
        last_checked_at: new Date(now - 60000).toISOString() // 1 minute ago
      };
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toBeNull();
      expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('checked recently'));
      expect(fetch).not.toHaveBeenCalled();
    });

    test('should check streams that exceed rate limit', async () => {
      const now = Date.now();
      const stream = {
        id: 1,
        link: 'https://twitch.tv/test',
        platform: 'Twitch',
        status: 'offline',
        last_checked_at: new Date(now - 500000).toISOString() // 8+ minutes ago
      };
      
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => 'offline content'
      });
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(fetch).toHaveBeenCalled();
      expect(result).toEqual({
        streamId: 1,
        status: 'offline',
        platform: 'Twitch'
      });
    });

    test('should detect live streams', async () => {
      const stream = {
        id: 1,
        link: 'https://www.tiktok.com/@user/live',
        platform: 'TikTok',
        last_checked_at: null
      };
      
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '{"isLiveBroadcast":true}'
      });
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toEqual({
        streamId: 1,
        status: 'live',
        platform: 'TikTok'
      });
    });

    test('should use full URL for YouTube', async () => {
      const stream = {
        id: 1,
        link: 'https://youtube.com/watch?v=abc123&feature=share',
        platform: 'YouTube',
        last_checked_at: null
      };
      
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => 'offline'
      });
      
      await checkStreamStatus(stream, 120000, 420000);
      
      expect(fetch).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=abc123&feature=share',
        expect.any(Object)
      );
    });

    test('should use base URL for other platforms', async () => {
      const stream = {
        id: 1,
        link: 'https://twitch.tv/user?referrer=homepage',
        platform: 'Twitch',
        last_checked_at: null
      };
      
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => 'offline'
      });
      
      await checkStreamStatus(stream, 120000, 420000);
      
      expect(fetch).toHaveBeenCalledWith(
        'https://twitch.tv/user',
        expect.any(Object)
      );
    });

    test('should handle HTTP errors', async () => {
      const stream = {
        id: 1,
        link: 'https://twitch.tv/user',
        platform: 'Twitch',
        last_checked_at: null
      };
      
      global.fetch.mockResolvedValueOnce({
        status: 404,
        text: async () => 'Not found'
      });
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith('[1] HTTP 404 for https://twitch.tv/user');
    });

    test('should skip WAF/challenge pages', async () => {
      const stream = {
        id: 1,
        link: 'https://twitch.tv/user',
        platform: 'Twitch',
        last_checked_at: null
      };
      
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '<html>_wafchallengeid</html>'
      });
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith('[1] WARNING: Received challenge/WAF page, skipping');
    });

    test('should handle fetch errors', async () => {
      const stream = {
        id: 1,
        link: 'https://twitch.tv/user',
        platform: 'Twitch',
        last_checked_at: null
      };
      
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await checkStreamStatus(stream, 120000, 420000);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith('[1] Request error:', 'Network error');
    });
  });
});