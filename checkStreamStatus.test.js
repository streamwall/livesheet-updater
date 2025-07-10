import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

describe('checkStreamStatus', () => {
  let mockLog;
  let mockDebug;
  let checkStreamStatus;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLog = jest.fn();
    mockDebug = jest.fn();
    
    // Since main.js runs immediately, we need to test the logic separately
    // This is the checkStreamStatus function extracted for testing
    checkStreamStatus = async (stream) => {
      const url = stream.link;
      if (!url) {
        mockLog(`Stream ${stream.id} has no URL, skipping`);
        return null;
      }

      // Clean and validate URL
      let cleanUrl = url.trim();
      cleanUrl = cleanUrl.replace(/[^\x20-\x7E]/g, '');
      cleanUrl = cleanUrl.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');

      // Validate URL patterns
      const patterns = {
        tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
        youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
        youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
        youtubeShort: /^https:\/\/youtu\.be\/.+/,
        twitch: /^https:\/\/(www\.)?twitch\.tv\/.+/
      };

      const isValidLiveUrl = cleanUrl && Object.values(patterns).some(p => p.test(cleanUrl));
      
      if (!isValidLiveUrl) {
        mockLog(`Stream ${stream.id} has invalid URL: ${cleanUrl}`);
        return null;
      }

      // Check rate limiting
      const now = Date.now();
      const lastChecked = stream.last_checked_at ? new Date(stream.last_checked_at).getTime() : 0;
      const currentStatus = stream.status?.toLowerCase() || 'offline';
      const RATE_LIVE = 120000; // 2 minutes
      const RATE_OFF = 420000; // 7 minutes
      const threshold = currentStatus === 'live' ? RATE_LIVE : RATE_OFF;

      if (now - lastChecked < threshold) {
        mockDebug(`Stream ${stream.id} checked recently (${Math.round((now - lastChecked) / 1000)}s ago), skipping`);
        return null;
      }

      const baseUrl = cleanUrl.split('?')[0];
      const platform = stream.platform || 'Unknown';
      
      mockLog(`[${stream.id}] Checking ${platform}: ${cleanUrl}`);
      
      try {
        // For YouTube, always use the full URL with parameters
        const fetchUrl = platform === 'YouTube' ? cleanUrl : baseUrl;
        mockDebug(`[${stream.id}] Fetching: "${fetchUrl}"`);
        
        const response = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          redirect: 'follow'
        });

        if (response.status !== 200) {
          mockLog(`[${stream.id}] HTTP ${response.status} for ${cleanUrl}`);
          return null;
        }

        const html = await response.text();
        
        // Check for WAF/challenge pages
        if (html.includes('_wafchallengeid') || html.includes('Please wait...') || html.includes('/waf-aiso/')) {
          mockLog(`[${stream.id}] WARNING: Received challenge/WAF page, skipping`);
          return null;
        }
        
        let status = 'offline';
        
        if (platform === 'TikTok') {
          if (html.includes('"isLiveBroadcast":true')) {
            mockDebug(`[${stream.id}] Found TikTok isLiveBroadcast:true`);
            status = 'live';
          }
        } else if (platform === 'Twitch') {
          if (html.includes('"isLiveBroadcast":true')) {
            mockDebug(`[${stream.id}] Found Twitch isLiveBroadcast:true`);
            status = 'live';
          } else if (html.includes('tw-channel-status-text-indicator') || 
                     html.includes('"stream":{') ||
                     html.includes('viewers</p>') ||
                     html.includes('data-a-target="tw-indicator"')) {
            mockDebug(`[${stream.id}] Found other Twitch live indicators`);
            status = 'live';
          }
        } else if (platform === 'YouTube') {
          if (html.includes('"isLiveBroadcast":"True"') && !html.includes('"endDate":"')) {
            mockDebug(`[${stream.id}] Detected LIVE - isLiveBroadcast:True without endDate`);
            status = 'live';
          } else if (html.includes('"isLiveBroadcast" content="True"') && !html.includes('"endDate"')) {
            mockDebug(`[${stream.id}] Detected LIVE - isLiveBroadcast content="True" without endDate`);
            status = 'live';
          } else if (html.includes('"liveBroadcastDetails"') && html.includes('"isLiveNow":true')) {
            mockDebug(`[${stream.id}] Detected LIVE - liveBroadcastDetails with isLiveNow`);
            status = 'live';
          } else if (html.includes('\\\"isLive\\\":true') || html.includes('"isLive":true')) {
            mockDebug(`[${stream.id}] Detected LIVE - isLive:true`);
            status = 'live';
          } else if (html.includes('"videoDetails":') && html.includes('"isLiveContent":true') && html.includes('"isLive":true')) {
            mockDebug(`[${stream.id}] Detected LIVE - videoDetails with isLiveContent and isLive`);
            status = 'live';
          }
        }
        
        mockLog(`[${stream.id}] Status: ${status.toUpperCase()} for ${platform} ${cleanUrl}`);
        
        return { streamId: stream.id, status, platform };
        
      } catch (e) {
        mockLog(`[${stream.id}] Request error:`, e.message);
        return null;
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should skip streams without URL', async () => {
    const stream = { id: 1 };
    
    const result = await checkStreamStatus(stream);
    
    expect(result).toBeNull();
    expect(mockLog).toHaveBeenCalledWith('Stream 1 has no URL, skipping');
  });

  test('should clean and validate URLs', async () => {
    const stream = {
      id: 1,
      link: ' https://www.twitch.tv/test\u200B ',
      platform: 'Twitch'
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: async () => 'offline stream'
    });
    
    await checkStreamStatus(stream);
    
    expect(fetch).toHaveBeenCalledWith(
      'https://www.twitch.tv/test',
      expect.any(Object)
    );
  });

  test('should reject invalid URLs', async () => {
    const invalidUrls = [
      'not-a-url',
      'http://invalid-platform.com/stream',
      'https://twitch.tv/', // No username
      'ftp://twitch.tv/user'
    ];
    
    for (const link of invalidUrls) {
      const stream = { id: 1, link };
      const result = await checkStreamStatus(stream);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('invalid URL'));
    }
  });

  test('should respect rate limiting for live streams', async () => {
    const now = Date.now();
    const stream = {
      id: 1,
      link: 'https://twitch.tv/test',
      platform: 'Twitch',
      status: 'live',
      last_checked_at: new Date(now - 60000).toISOString() // 1 minute ago
    };
    
    const result = await checkStreamStatus(stream);
    
    expect(result).toBeNull();
    expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('checked recently'));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should respect rate limiting for offline streams', async () => {
    const now = Date.now();
    const stream = {
      id: 1,
      link: 'https://twitch.tv/test',
      platform: 'Twitch',
      status: 'offline',
      last_checked_at: new Date(now - 300000).toISOString() // 5 minutes ago
    };
    
    const result = await checkStreamStatus(stream);
    
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
    
    const result = await checkStreamStatus(stream);
    
    expect(fetch).toHaveBeenCalled();
    expect(result).toEqual({
      streamId: 1,
      status: 'offline',
      platform: 'Twitch'
    });
  });

  test('should detect TikTok live streams', async () => {
    const stream = {
      id: 1,
      link: 'https://www.tiktok.com/@user/live',
      platform: 'TikTok'
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: async () => '{"isLiveBroadcast":true}'
    });
    
    const result = await checkStreamStatus(stream);
    
    expect(result).toEqual({
      streamId: 1,
      status: 'live',
      platform: 'TikTok'
    });
  });

  test('should detect Twitch live streams', async () => {
    const stream = {
      id: 1,
      link: 'https://twitch.tv/user',
      platform: 'Twitch'
    };
    
    const testCases = [
      '"isLiveBroadcast":true',
      'tw-channel-status-text-indicator',
      '"stream":{',
      'viewers</p>',
      'data-a-target="tw-indicator"'
    ];
    
    for (const indicator of testCases) {
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => `some content ${indicator} more content`
      });
      
      const result = await checkStreamStatus(stream);
      
      expect(result.status).toBe('live');
    }
  });

  test('should detect YouTube live streams', async () => {
    const stream = {
      id: 1,
      link: 'https://youtube.com/watch?v=abc123',
      platform: 'YouTube'
    };
    
    const testCases = [
      '"isLiveBroadcast":"True"',
      '"isLiveBroadcast" content="True"',
      '"liveBroadcastDetails" ... "isLiveNow":true',
      '"isLive":true',
      '"videoDetails": ... "isLiveContent":true ... "isLive":true'
    ];
    
    for (const indicator of testCases) {
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => indicator
      });
      
      const result = await checkStreamStatus(stream);
      
      expect(result.status).toBe('live');
    }
  });

  test('should not detect YouTube live if endDate is present', async () => {
    const stream = {
      id: 1,
      link: 'https://youtube.com/watch?v=abc123',
      platform: 'YouTube'
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: async () => '"isLiveBroadcast":"True" ... "endDate":"2024-01-01"'
    });
    
    const result = await checkStreamStatus(stream);
    
    expect(result.status).toBe('offline');
  });

  test('should use full URL for YouTube', async () => {
    const stream = {
      id: 1,
      link: 'https://youtube.com/watch?v=abc123&feature=share',
      platform: 'YouTube'
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: async () => 'offline'
    });
    
    await checkStreamStatus(stream);
    
    expect(fetch).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc123&feature=share',
      expect.any(Object)
    );
  });

  test('should use base URL for other platforms', async () => {
    const stream = {
      id: 1,
      link: 'https://twitch.tv/user?referrer=homepage',
      platform: 'Twitch'
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: async () => 'offline'
    });
    
    await checkStreamStatus(stream);
    
    expect(fetch).toHaveBeenCalledWith(
      'https://twitch.tv/user',
      expect.any(Object)
    );
  });

  test('should handle HTTP errors', async () => {
    const stream = {
      id: 1,
      link: 'https://twitch.tv/user',
      platform: 'Twitch'
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 404,
      text: async () => 'Not found'
    });
    
    const result = await checkStreamStatus(stream);
    
    expect(result).toBeNull();
    expect(mockLog).toHaveBeenCalledWith('[1] HTTP 404 for https://twitch.tv/user');
  });

  test('should skip WAF/challenge pages', async () => {
    const stream = {
      id: 1,
      link: 'https://twitch.tv/user',
      platform: 'Twitch'
    };
    
    const wafResponses = [
      '_wafchallengeid',
      'Please wait...',
      '/waf-aiso/'
    ];
    
    for (const wafIndicator of wafResponses) {
      global.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => `<html>${wafIndicator}</html>`
      });
      
      const result = await checkStreamStatus(stream);
      
      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith('[1] WARNING: Received challenge/WAF page, skipping');
    }
  });

  test('should handle fetch errors', async () => {
    const stream = {
      id: 1,
      link: 'https://twitch.tv/user',
      platform: 'Twitch'
    };
    
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    
    const result = await checkStreamStatus(stream);
    
    expect(result).toBeNull();
    expect(mockLog).toHaveBeenCalledWith('[1] Request error:', 'Network error');
  });

  test('should handle streams never checked before', async () => {
    const stream = {
      id: 1,
      link: 'https://twitch.tv/user',
      platform: 'Twitch',
      last_checked_at: null
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      text: async () => 'offline'
    });
    
    const result = await checkStreamStatus(stream);
    
    expect(fetch).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});