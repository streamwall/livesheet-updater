import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createKnownStreamersService } from '../../services/knownStreamers.js';
import { MAX_KNOWN_STREAMERS_PER_CYCLE, PRIORITY_GROUP_HIGH, PRIORITY_GROUP_MID, PRIORITY_GROUP_LOW } from '../../config/constants.js';

describe('services/knownStreamers', () => {
  let knownStreamersService;
  let mockDeps;
  let mockLogger;
  let mockSheetHelpers;
  let mockStreamChecker;
  let mockSheet;
  let mockKnownStreamersSheet;
  
  beforeEach(() => {
    mockDeps = {
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
        toISOString() {
          return '2023-01-01T00:00:00.000Z';
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
    
    mockStreamChecker = {
      fetchUrlStatus: jest.fn()
    };
    
    mockSheet = {
      headerValues: ['Link', 'Status'],
      getRows: jest.fn().mockResolvedValue([]),
      addRow: jest.fn().mockResolvedValue({})
    };
    
    mockKnownStreamersSheet = {
      headerValues: ['URL', 'Priority', 'City', 'State', 'Source'],
      getRows: jest.fn().mockResolvedValue([])
    };
    
    knownStreamersService = createKnownStreamersService(mockDeps, mockLogger, mockSheetHelpers, mockStreamChecker);
  });
  
  describe('isUrlInLivesheet', () => {
    test('finds matching URL', () => {
      const rows = [{}];
      mockSheetHelpers.getField.mockReturnValue('https://example.com');
      
      expect(knownStreamersService.isUrlInLivesheet('https://example.com', rows, mockSheet)).toBe(true);
    });
    
    test('returns false when not found', () => {
      const rows = [{}];
      mockSheetHelpers.getField.mockReturnValue('https://other.com');
      
      expect(knownStreamersService.isUrlInLivesheet('https://example.com', rows, mockSheet)).toBe(false);
    });
    
    test('handles cleaned URLs', () => {
      const rows = [{}];
      mockSheetHelpers.getField.mockReturnValue('  https://example.com  ');
      
      expect(knownStreamersService.isUrlInLivesheet('https://example.com', rows, mockSheet)).toBe(true);
    });
    
    test('handles null URLs in rows', () => {
      const rows = [{}];
      mockSheetHelpers.getField.mockReturnValue(null);
      
      expect(knownStreamersService.isUrlInLivesheet('https://example.com', rows, mockSheet)).toBe(false);
    });
  });
  
  describe('checkKnownStreamers', () => {
    test('returns early if no known streamers sheet', async () => {
      await knownStreamersService.checkKnownStreamers(mockSheet, null);
      expect(mockLogger.log).not.toHaveBeenCalled();
    });
    
    test('handles empty known streamers', async () => {
      mockKnownStreamersSheet.getRows.mockResolvedValue([]);
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith('No known streamers found in sheet');
    });
    
    test('sorts streamers by priority', async () => {
      const streamers = [{}, {}, {}];
      
      mockSheetHelpers.getField.mockImplementation((row, field, sheet) => {
        const idx = streamers.indexOf(row);
        if (field === 'Priority') return [1, 99, 5][idx];
        if (field === 'URL') return `https://www.tiktok.com/@user${idx}/live`;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue({ status: 'Offline', platform: 'TikTok' });
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Priority distribution: {"10-99":1,"1-9":2}`
      );
    });
    
    test('skips streamers without URL', async () => {
      const streamers = [{}];
      mockSheetHelpers.getField.mockReturnValue(null);
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith('[Known 0] Skipping - no URL');
    });
    
    test('validates URLs', async () => {
      const streamers = [{}];
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'URL') return 'not-a-url';
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith('[Known 0] Skip invalid URL: not-a-url');
    });
    
    test('respects rate limits', async () => {
      const url = 'https://www.tiktok.com/@user/live';
      
      // Set last check time
      knownStreamersService.knownStreamersLastCheck.set(url, 999000);
      
      const streamers = [{}];
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'URL') return url;
        if (field === 'Priority') return 5;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skip')
      );
    });
    
    test('respects MAX_KNOWN_STREAMERS_PER_CYCLE', async () => {
      // Clear any existing rate limits
      knownStreamersService.knownStreamersLastCheck.clear();
      
      // Create more streamers than the limit - use priority 100 to avoid rate limiting
      const streamers = Array(15).fill(null).map(() => ({}));
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        const idx = streamers.indexOf(row);
        if (field === 'URL') return `https://www.tiktok.com/@user${idx}/live`;
        if (field === 'Priority') return 100; // Priority 100+ has no rate limit
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue({ status: 'Offline', platform: 'TikTok' });
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      // Should have checked MAX_KNOWN_STREAMERS_PER_CYCLE streamers
      expect(mockStreamChecker.fetchUrlStatus).toHaveBeenCalledTimes(MAX_KNOWN_STREAMERS_PER_CYCLE);
      
      // Should have logged that we hit the limit
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Note: Reached max checks per cycle')
      );
    });
    
    test('skips streamers already in livesheet', async () => {
      const url = 'https://www.tiktok.com/@user/live';
      
      const streamers = [{}];
      const livesheetRows = [{}];
      
      mockSheetHelpers.getField.mockImplementation((row, field, sheet) => {
        if (sheet === mockKnownStreamersSheet && field === 'URL') return url;
        if (sheet === mockKnownStreamersSheet && field === 'Priority') return 100;
        if (sheet === mockSheet && field === 'Link') return url;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockSheet.getRows.mockResolvedValue(livesheetRows);
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        `[Known 0] Already in Livesheet: ${url}`
      );
    });
    
    test('adds live streamers to livesheet', async () => {
      const streamers = [{}];
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'URL') return 'https://www.tiktok.com/@user/live';
        if (field === 'Source') return 'Test Source';
        if (field === 'City') return 'Los Angeles';
        if (field === 'State') return 'CA';
        if (field === 'Priority') return 100;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue({ status: 'Live', platform: 'TikTok' });
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockSheet.addRow).toHaveBeenCalledWith({
        'Link': 'https://www.tiktok.com/@user/live',
        'Platform': 'TikTok',
        'City': 'Los Angeles',
        'State': 'CA',
        'Status': 'Live',
        'Last Checked (PST)': '2023-01-01T00:00:00.000Z',
        'Last Live (PST)': '2023-01-01T00:00:00.000Z',
        'Added Date': '2023-01-01T00:00:00.000Z',
        'Source': 'Test Source'
      });
    });
    
    test('handles offline streamers', async () => {
      const streamers = [{}];
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'URL') return 'https://www.tiktok.com/@user/live';
        if (field === 'Priority') return 100;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue({ status: 'Offline', platform: 'TikTok' });
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Known 0] Offline: https://www.tiktok.com/@user/live'
      );
    });
    
    test('handles fetchUrlStatus errors', async () => {
      const streamers = [{}];
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'URL') return 'https://www.tiktok.com/@user/live';
        if (field === 'Priority') return 100;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue(null);
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[Known 0] Failed to fetch status for https://www.tiktok.com/@user/live'
      );
    });
    
    test('logs summary', async () => {
      const streamers = [{}, {}];
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        const idx = streamers.indexOf(row);
        if (field === 'URL') return idx === 0 ? 'https://www.tiktok.com/@user1/live' : 'not-a-url';
        if (field === 'Priority') return 100;
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue({ status: 'Live', platform: 'TikTok' });
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith('Known streamers check complete:');
      expect(mockLogger.log).toHaveBeenCalledWith('  - Total streamers: 2');
      expect(mockLogger.log).toHaveBeenCalledWith('  - Checked this cycle: 1 (max 10)');
      expect(mockLogger.log).toHaveBeenCalledWith('  - Added to Livesheet: 1');
    });
    
    test('handles errors', async () => {
      mockKnownStreamersSheet.getRows.mockRejectedValue(new Error('Sheet error'));
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith('Known streamers check error:', 'Sheet error');
    });
    
    test('priority grouping', async () => {
      const streamers = [{}, {}, {}, {}];
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        const idx = streamers.indexOf(row);
        if (field === 'URL') return `https://www.tiktok.com/@user${idx}/live`;
        if (field === 'Priority') return [110, 50, 5, 0][idx];
        return null;
      });
      
      mockKnownStreamersSheet.getRows.mockResolvedValue(streamers);
      mockStreamChecker.fetchUrlStatus.mockResolvedValue({ status: 'Offline', platform: 'TikTok' });
      
      await knownStreamersService.checkKnownStreamers(mockSheet, mockKnownStreamersSheet);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Priority distribution: {"100+":1,"10-99":1,"1-9":1,"0 or unset":1}`
      );
    });
  });
});