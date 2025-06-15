import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createStreamChecker } from '../../services/streamChecker.js';
import { DEFAULT_HEADERS, RATE_LIVE, RATE_OFF, RECENTLY_LIVE_THRESHOLD } from '../../config/constants.js';

describe('services/streamChecker', () => {
  let streamChecker;
  let mockDeps;
  let mockLogger;
  let mockSheetHelpers;
  let mockSheet;
  
  beforeEach(() => {
    mockDeps = {
      fetch: jest.fn(),
      Date: class extends Date {
        constructor(...args) {
          if (args.length === 0) {
            super(1000000);
          } else {
            super(...args);
          }
        }
        static now() {
          return 1000000;
        }
      }
    };
    
    mockLogger = {
      log: jest.fn(),
      debug: jest.fn()
    };
    
    mockSheetHelpers = {
      getField: jest.fn()
    };
    
    mockSheet = {
      headerValues: ['Link', 'Status', 'Last Checked (PST)', 'Last Live (PST)']
    };
    
    streamChecker = createStreamChecker(mockDeps, mockLogger, mockSheetHelpers);
  });
  
  describe('fetchUrlStatus', () => {
    test('detects TikTok live', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('"isLiveBroadcast":true')
      });
      
      const result = await streamChecker.fetchUrlStatus('https://www.tiktok.com/@user/live');
      expect(result).toEqual({ status: 'Live', platform: 'TikTok' });
    });
    
    test('detects TikTok offline', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('not live')
      });
      
      const result = await streamChecker.fetchUrlStatus('https://www.tiktok.com/@user/live');
      expect(result).toEqual({ status: 'Offline', platform: 'TikTok' });
    });
    
    test('detects YouTube live without endDate', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('"isLiveBroadcast":"True"')
      });
      
      const result = await streamChecker.fetchUrlStatus('https://www.youtube.com/watch?v=123');
      expect(result).toEqual({ status: 'Live', platform: 'YouTube' });
    });
    
    test('detects YouTube offline with endDate', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('"isLiveBroadcast":"True","endDate":"2023"')
      });
      
      const result = await streamChecker.fetchUrlStatus('https://www.youtube.com/watch?v=123');
      expect(result).toEqual({ status: 'Offline', platform: 'YouTube' });
    });
    
    test('detects YouTube live with various indicators', async () => {
      const indicators = [
        '"isLiveBroadcast" content="True"',
        '"liveBroadcastDetails":{"isLiveNow":true}',
        '"isLive":true',
        '\\\"isLive\\\":true',
        '"videoDetails":{"isLiveContent":true,"isLive":true}'
      ];
      
      for (const indicator of indicators) {
        mockDeps.fetch.mockResolvedValue({
          status: 200,
          text: jest.fn().mockResolvedValue(indicator)
        });
        
        const result = await streamChecker.fetchUrlStatus('https://www.youtube.com/watch?v=123');
        expect(result.status).toBe('Live');
      }
    });
    
    test('detects Twitch live with various indicators', async () => {
      const indicators = [
        '"isLiveBroadcast":true',
        'tw-channel-status-text-indicator',
        '"stream":{',
        'viewers</p>',
        'data-a-target="tw-indicator"'
      ];
      
      for (const indicator of indicators) {
        mockDeps.fetch.mockResolvedValue({
          status: 200,
          text: jest.fn().mockResolvedValue(indicator)
        });
        
        const result = await streamChecker.fetchUrlStatus('https://www.twitch.tv/user');
        expect(result.status).toBe('Live');
      }
    });
    
    test('uses full URL for YouTube', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('')
      });
      
      await streamChecker.fetchUrlStatus('https://www.youtube.com/watch?v=123&feature=share');
      expect(mockDeps.fetch).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=123&feature=share',
        expect.objectContaining({
          headers: expect.objectContaining(DEFAULT_HEADERS)
        })
      );
    });
    
    test('uses base URL for TikTok', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('')
      });
      
      await streamChecker.fetchUrlStatus('https://www.tiktok.com/@user/live?query=1');
      expect(mockDeps.fetch).toHaveBeenCalledWith(
        'https://www.tiktok.com/@user/live',
        expect.any(Object)
      );
    });
    
    test('handles non-200 status', async () => {
      mockDeps.fetch.mockResolvedValue({ status: 404 });
      const result = await streamChecker.fetchUrlStatus('https://example.com');
      expect(result).toBeNull();
    });
    
    test('handles WAF/challenge pages', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('_wafchallengeid')
      });
      
      const result = await streamChecker.fetchUrlStatus('https://example.com');
      expect(result).toBeNull();
    });
    
    test('handles fetch errors', async () => {
      mockDeps.fetch.mockRejectedValue(new Error('Network error'));
      const result = await streamChecker.fetchUrlStatus('https://example.com');
      expect(result).toBeNull();
    });
    
    test('handles timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockDeps.fetch.mockRejectedValue(timeoutError);
      
      const result = await streamChecker.fetchUrlStatus('https://example.com');
      expect(result).toBeNull();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Timeout fetching')
      );
    });
    
    test('debug logging', async () => {
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('')
      });
      
      await streamChecker.fetchUrlStatus('https://www.tiktok.com/@user/live');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Fetching status for TikTok')
      );
    });
  });
  
  describe('checkStatus', () => {
    let mockRow;
    
    beforeEach(() => {
      mockRow = {
        get: jest.fn(),
        set: jest.fn()
      };
    });
    
    test('skips rows without URL', async () => {
      mockSheetHelpers.getField.mockReturnValue(null);
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockDeps.fetch).not.toHaveBeenCalled();
    });
    
    test('cleans URLs', async () => {
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return '  https://www.tiktok.com/@user/live  ';
        return null;
      });
      
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('')
      });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[0] Cleaned URL: "  https://www.tiktok.com/@user/live  " -> "https://www.tiktok.com/@user/live"'
      );
    });
    
    test('validates URLs', async () => {
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'not-a-url';
        return null;
      });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[0] Skip invalid URL: not-a-url'
      );
    });
    
    test('respects rate limit for live streams', async () => {
      const now = 1000000;
      const recentTime = new Date(now - 60000).toISOString(); // 1 minute ago
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://www.tiktok.com/@user/live';
        if (field === 'Last Checked (PST)') return recentTime;
        if (field === 'Status') return 'Live';
        return null;
      });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[0] Skip (rate limit, 60s ago): https://www.tiktok.com/@user/live'
      );
    });
    
    test('respects rate limit for offline streams', async () => {
      const now = 1000000;
      const recentTime = new Date(now - 5 * 60000).toISOString(); // 5 minutes ago
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://www.tiktok.com/@user/live';
        if (field === 'Last Checked (PST)') return recentTime;
        if (field === 'Status') return 'Offline';
        return null;
      });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Skip (rate limit')
      );
    });
    
    test('checks valid URLs past rate limit', async () => {
      const oldTime = new Date(1000000 - 10 * 60000).toISOString(); // 10 minutes ago
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://www.tiktok.com/@user/live';
        if (field === 'Last Checked (PST)') return oldTime;
        return null;
      });
      
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('"isLiveBroadcast":true')
      });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockLogger.log).toHaveBeenCalledWith('[0] Checking: https://www.tiktok.com/@user/live');
      expect(mockLogger.log).toHaveBeenCalledWith('[0] Status: Live');
    });
    
    test('handles fetchUrlStatus returning null', async () => {
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://www.tiktok.com/@user/live';
        return null;
      });
      
      mockDeps.fetch.mockResolvedValue({ status: 404 });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[0] Failed to fetch status for https://www.tiktok.com/@user/live'
      );
    });
    
    test('stores pending updates', async () => {
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://www.tiktok.com/@user/live';
        return null;
      });
      
      mockDeps.fetch.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('"isLiveBroadcast":true')
      });
      
      await streamChecker.checkStatus(mockRow, 0, mockSheet);
      
      expect(streamChecker.pendingUpdates.has('https://www.tiktok.com/@user/live')).toBe(true);
      expect(streamChecker.pendingUpdates.get('https://www.tiktok.com/@user/live')).toEqual({
        row: mockRow,
        status: 'Live',
        index: 0
      });
    });
  });
});