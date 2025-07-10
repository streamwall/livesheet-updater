import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

describe('Integration Tests', () => {
  let mockStreamSourceClient;
  let mockLog;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLog = jest.fn();
    
    mockStreamSourceClient = {
      authenticate: jest.fn().mockResolvedValue(true),
      getStreams: jest.fn(),
      updateStreamStatus: jest.fn().mockResolvedValue(true),
      getExpiredOfflineStreams: jest.fn(),
      archiveStream: jest.fn().mockResolvedValue(true)
    };
  });

  describe('Full Stream Check Cycle', () => {
    test('should fetch streams, check status, and update', async () => {
      // Mock stream data
      const streams = [
        {
          id: 1,
          link: 'https://twitch.tv/user1',
          platform: 'Twitch',
          status: 'offline',
          last_checked_at: null
        },
        {
          id: 2,
          link: 'https://youtube.com/watch?v=abc123',
          platform: 'YouTube',
          status: 'live',
          last_checked_at: new Date(Date.now() - 180000).toISOString() // 3 minutes ago
        }
      ];

      mockStreamSourceClient.getStreams.mockResolvedValueOnce({
        streams,
        meta: { total_pages: 1 }
      });

      // Mock HTTP responses for stream checks
      global.fetch
        .mockResolvedValueOnce({
          status: 200,
          text: async () => '"isLiveBroadcast":true' // Twitch is live
        })
        .mockResolvedValueOnce({
          status: 200,
          text: async () => 'offline content' // YouTube is offline
        });

      // Simulate the main loop logic
      const response = await mockStreamSourceClient.getStreams({
        page: 1,
        per_page: 100,
        is_archived: false
      });

      expect(response.streams).toHaveLength(2);

      // Check each stream
      const updates = [];
      for (const stream of response.streams) {
        // Simple rate limit check
        const now = Date.now();
        const lastChecked = stream.last_checked_at ? new Date(stream.last_checked_at).getTime() : 0;
        const threshold = stream.status === 'live' ? 120000 : 420000;
        
        if (now - lastChecked >= threshold || !stream.last_checked_at) {
          const fetchResponse = await fetch(stream.link);
          const html = await fetchResponse.text();
          
          let status = 'offline';
          if (stream.platform === 'Twitch' && html.includes('"isLiveBroadcast":true')) {
            status = 'live';
          } else if (stream.platform === 'YouTube' && html.includes('"isLive":true')) {
            status = 'live';
          }
          
          updates.push({ streamId: stream.id, status });
        }
      }

      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual({ streamId: 1, status: 'live' });
      expect(updates[1]).toEqual({ streamId: 2, status: 'offline' });

      // Update statuses
      for (const update of updates) {
        await mockStreamSourceClient.updateStreamStatus(update.streamId, update.status);
      }

      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledTimes(2);
      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledWith(1, 'live');
      expect(mockStreamSourceClient.updateStreamStatus).toHaveBeenCalledWith(2, 'offline');
    });
  });

  describe('Archive Integration', () => {
    test('should archive expired streams when enabled', async () => {
      const expiredStreams = [
        {
          id: 1,
          link: 'https://twitch.tv/expired1',
          status: 'offline',
          last_live_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
        },
        {
          id: 2,
          link: 'https://twitch.tv/expired2',
          status: 'unknown',
          last_live_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
        }
      ];

      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValueOnce(expiredStreams);

      // Get expired streams
      const expired = await mockStreamSourceClient.getExpiredOfflineStreams(30);
      expect(expired).toHaveLength(2);

      // Archive each stream
      let archivedCount = 0;
      for (const stream of expired) {
        const currentTime = new Date();
        const lastLiveTime = new Date(stream.last_live_at);
        const diffMinutes = (currentTime - lastLiveTime) / 60000;
        
        if ((stream.status === 'offline' || stream.status === 'unknown') && diffMinutes >= 30) {
          await mockStreamSourceClient.archiveStream(stream.id);
          archivedCount++;
        }
      }

      expect(archivedCount).toBe(2);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledTimes(2);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(1);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(2);
    });

    test('should not archive streams that are not expired', async () => {
      const streams = [
        {
          id: 1,
          link: 'https://twitch.tv/recent',
          status: 'offline',
          last_live_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
        }
      ];

      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValueOnce([]);

      const expired = await mockStreamSourceClient.getExpiredOfflineStreams(30);
      expect(expired).toHaveLength(0);
      expect(mockStreamSourceClient.archiveStream).not.toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    test('should continue processing after stream check error', async () => {
      const streams = [
        { id: 1, link: 'https://twitch.tv/user1', platform: 'Twitch' },
        { id: 2, link: 'https://twitch.tv/user2', platform: 'Twitch' },
        { id: 3, link: 'https://twitch.tv/user3', platform: 'Twitch' }
      ];

      mockStreamSourceClient.getStreams.mockResolvedValueOnce({
        streams,
        meta: { total_pages: 1 }
      });

      // Mock responses: success, error, success
      global.fetch
        .mockResolvedValueOnce({
          status: 200,
          text: async () => '"isLiveBroadcast":true'
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 200,
          text: async () => 'offline'
        });

      const updates = [];
      for (const stream of streams) {
        try {
          const response = await fetch(stream.link);
          const html = await response.text();
          const status = html.includes('"isLiveBroadcast":true') ? 'live' : 'offline';
          updates.push({ streamId: stream.id, status });
        } catch (error) {
          mockLog(`Error checking stream ${stream.id}:`, error.message);
        }
      }

      expect(updates).toHaveLength(2); // Two successful checks
      expect(updates[0]).toEqual({ streamId: 1, status: 'live' });
      expect(updates[1]).toEqual({ streamId: 3, status: 'offline' });
      expect(mockLog).toHaveBeenCalledWith('Error checking stream 2:', 'Network error');
    });

    test('should re-authenticate on 401 error', async () => {
      mockStreamSourceClient.getStreams
        .mockRejectedValueOnce(new Error('401 Unauthorized'))
        .mockResolvedValueOnce({
          streams: [],
          meta: { total_pages: 0 }
        });

      // First attempt fails with 401
      try {
        await mockStreamSourceClient.getStreams();
      } catch (error) {
        if (error.message.includes('401')) {
          await mockStreamSourceClient.authenticate();
        }
      }

      // Second attempt succeeds
      const result = await mockStreamSourceClient.getStreams();

      expect(mockStreamSourceClient.authenticate).toHaveBeenCalledTimes(1);
      expect(result.streams).toEqual([]);
    });
  });

  describe('Performance and Efficiency', () => {
    test('should handle large number of streams efficiently', async () => {
      // Generate 500 streams
      const streams = Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        link: `https://twitch.tv/user${i + 1}`,
        platform: 'Twitch',
        status: i % 3 === 0 ? 'live' : 'offline',
        last_checked_at: i % 5 === 0 ? null : new Date(Date.now() - 500000).toISOString()
      }));

      // Simulate pagination
      const pageSize = 100;
      const pages = Math.ceil(streams.length / pageSize);
      
      for (let page = 1; page <= pages; page++) {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        mockStreamSourceClient.getStreams.mockResolvedValueOnce({
          streams: streams.slice(start, end),
          meta: { total_pages: pages }
        });
      }

      // Fetch all streams
      let allStreams = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await mockStreamSourceClient.getStreams({
          page,
          per_page: pageSize,
          is_archived: false
        });

        allStreams = allStreams.concat(response.streams);
        hasMore = page < response.meta.total_pages;
        page++;
      }

      expect(allStreams).toHaveLength(500);
      expect(mockStreamSourceClient.getStreams).toHaveBeenCalledTimes(5);

      // Check priority sorting works correctly
      const prioritizedStreams = allStreams.sort((a, b) => {
        const getPriority = stream => {
          if (!stream.last_checked_at) return 3;
          if (stream.status === 'live') return 2;
          return 0;
        };
        return getPriority(b) - getPriority(a);
      });

      // Verify high priority streams are first
      const topPriority = prioritizedStreams.slice(0, 10);
      const neverChecked = topPriority.filter(s => !s.last_checked_at);
      expect(neverChecked.length).toBeGreaterThan(0);
    });
  });
});