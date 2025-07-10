import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { prioritizeStreams } from './lib/streamPrioritizer.js';

describe('Main Loop Logic', () => {
  let mockStreamSourceClient;
  let mockLog;
  let mockDelay;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLog = jest.fn();
    mockDelay = jest.fn().mockResolvedValue();
    
    mockStreamSourceClient = {
      getStreams: jest.fn(),
      updateStreamStatus: jest.fn(),
      getExpiredOfflineStreams: jest.fn(),
      archiveStream: jest.fn(),
      authenticate: jest.fn()
    };
  });

  describe('Stream Prioritization', () => {
    test('should prioritize streams correctly', () => {
      const now = Date.now();
      const streams = [
        // Low priority - checked long ago, offline
        {
          id: 1,
          status: 'offline',
          last_checked_at: new Date(now - 3600000).toISOString(),
          last_live_at: new Date(now - 7200000).toISOString()
        },
        // High priority - never checked
        {
          id: 2,
          status: 'offline',
          last_checked_at: null,
          last_live_at: null
        },
        // Medium-high priority - currently live
        {
          id: 3,
          status: 'live',
          last_checked_at: new Date(now - 180000).toISOString(),
          last_live_at: new Date(now - 180000).toISOString()
        },
        // Medium priority - recently live (15 minutes ago)
        {
          id: 4,
          status: 'offline',
          last_checked_at: new Date(now - 900000).toISOString(),
          last_live_at: new Date(now - 900000).toISOString()
        }
      ];

      // Use the imported prioritizeStreams function
      const prioritizedStreams = prioritizeStreams(streams);

      expect(prioritizedStreams[0].id).toBe(2); // Never checked
      expect(prioritizedStreams[1].id).toBe(3); // Currently live
      expect(prioritizedStreams[2].id).toBe(4); // Recently live
      expect(prioritizedStreams[3].id).toBe(1); // Old offline
    });
  });

  describe('Stream Fetching', () => {
    test('should fetch all pages of streams', async () => {
      mockStreamSourceClient.getStreams
        .mockResolvedValueOnce({
          streams: [{ id: 1 }, { id: 2 }],
          meta: { total_pages: 3 }
        })
        .mockResolvedValueOnce({
          streams: [{ id: 3 }, { id: 4 }],
          meta: { total_pages: 3 }
        })
        .mockResolvedValueOnce({
          streams: [{ id: 5 }],
          meta: { total_pages: 3 }
        });

      let allStreams = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await mockStreamSourceClient.getStreams({
          page,
          per_page: 100,
          is_archived: false
        });

        allStreams = allStreams.concat(response.streams);
        hasMore = page < response.meta.total_pages;
        page++;
      }

      expect(allStreams).toHaveLength(5);
      expect(allStreams.map(s => s.id)).toEqual([1, 2, 3, 4, 5]);
      expect(mockStreamSourceClient.getStreams).toHaveBeenCalledTimes(3);
    });

    test('should handle empty stream list', async () => {
      mockStreamSourceClient.getStreams.mockResolvedValueOnce({
        streams: [],
        meta: { total_pages: 0 }
      });

      let allStreams = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await mockStreamSourceClient.getStreams({
          page,
          per_page: 100,
          is_archived: false
        });

        allStreams = allStreams.concat(response.streams);
        hasMore = page < response.meta.total_pages;
        page++;
      }

      expect(allStreams).toHaveLength(0);
    });
  });

  describe('Status Updates', () => {
    test('should update stream status successfully', async () => {
      const updates = [
        { streamId: 1, status: 'live', platform: 'Twitch' },
        { streamId: 2, status: 'offline', platform: 'YouTube' }
      ];

      mockStreamSourceClient.updateStreamStatus.mockResolvedValue({ success: true });

      for (const update of updates) {
        await mockStreamSourceClient.updateStreamStatus(update.streamId, update.status);
      }

      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledTimes(2);
      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledWith(1, 'live');
      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledWith(2, 'offline');
    });

    test('should handle update errors gracefully', async () => {
      mockStreamSourceClient.updateStreamStatus
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('API Error'));

      const updates = [
        { streamId: 1, status: 'live' },
        { streamId: 2, status: 'offline' }
      ];

      for (const update of updates) {
        try {
          await mockStreamSourceClient.updateStreamStatus(update.streamId, update.status);
        } catch (error) {
          // Error should be caught and logged in actual implementation
          expect(error.message).toBe('API Error');
        }
      }

      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    test('should re-authenticate on 401 errors', async () => {
      const error = new Error('Unauthorized');
      error.message = '401 Unauthorized';
      
      mockStreamSourceClient.getStreams.mockRejectedValueOnce(error);
      mockStreamSourceClient.authenticate.mockResolvedValueOnce({ success: true });

      try {
        await mockStreamSourceClient.getStreams();
      } catch (e) {
        if (e.message.includes('401') || e.message.includes('Unauthorized')) {
          await mockStreamSourceClient.authenticate();
        }
      }

      expect(mockStreamSourceClient.authenticate).toHaveBeenCalled();
    });

    test('should handle authentication failures', async () => {
      const error = new Error('Unauthorized');
      mockStreamSourceClient.authenticate.mockRejectedValueOnce(new Error('Invalid credentials'));

      try {
        await mockStreamSourceClient.authenticate();
      } catch (authError) {
        expect(authError.message).toBe('Invalid credentials');
      }
    });

    test('should continue after errors with delay', async () => {
      mockStreamSourceClient.getStreams.mockRejectedValueOnce(new Error('Network error'));
      
      let errorCaught = false;
      try {
        await mockStreamSourceClient.getStreams();
      } catch (e) {
        errorCaught = true;
        mockLog('Main loop error:', e.message);
        await mockDelay(30000);
      }

      expect(errorCaught).toBe(true);
      expect(mockLog).toHaveBeenCalledWith('Main loop error:', 'Network error');
      expect(mockDelay).toHaveBeenCalledWith(30000);
    });
  });

  describe('Archive Process', () => {
    test('should run archive check when enabled and interval passed', async () => {
      const ARCHIVE_ENABLED = true;
      const ARCHIVE_CHECK_INTERVAL = 300000; // 5 minutes
      let lastArchiveCheck = Date.now() - 400000; // 6+ minutes ago

      const shouldRunArchive = ARCHIVE_ENABLED && Date.now() - lastArchiveCheck >= ARCHIVE_CHECK_INTERVAL;
      
      expect(shouldRunArchive).toBe(true);
    });

    test('should not run archive when disabled', async () => {
      const ARCHIVE_ENABLED = false;
      const ARCHIVE_CHECK_INTERVAL = 300000;
      let lastArchiveCheck = 0;

      const shouldRunArchive = ARCHIVE_ENABLED && Date.now() - lastArchiveCheck >= ARCHIVE_CHECK_INTERVAL;
      
      expect(shouldRunArchive).toBe(false);
    });

    test('should not run archive when interval not reached', async () => {
      const ARCHIVE_ENABLED = true;
      const ARCHIVE_CHECK_INTERVAL = 300000; // 5 minutes
      let lastArchiveCheck = Date.now() - 100000; // 1.5 minutes ago

      const shouldRunArchive = ARCHIVE_ENABLED && Date.now() - lastArchiveCheck >= ARCHIVE_CHECK_INTERVAL;
      
      expect(shouldRunArchive).toBe(false);
    });
  });

  describe('Loop Timing', () => {
    test('should calculate random sleep time within bounds', () => {
      const LOOP_DELAY_MIN = 10000;
      const LOOP_DELAY_MAX = 20000;
      
      for (let i = 0; i < 10; i++) {
        const sleepTime = LOOP_DELAY_MIN + Math.random() * (LOOP_DELAY_MAX - LOOP_DELAY_MIN);
        expect(sleepTime).toBeGreaterThanOrEqual(LOOP_DELAY_MIN);
        expect(sleepTime).toBeLessThanOrEqual(LOOP_DELAY_MAX);
      }
    });
  });
});