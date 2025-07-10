import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock the utils module before importing anything that uses it
const mockLog = jest.fn();
const mockDelay = jest.fn().mockResolvedValue();

jest.unstable_mockModule('./utils.js', () => ({
  log: mockLog,
  delay: mockDelay
}));

// Import after mocking
const { archiveExpiredStreams, shouldRunArchive } = await import('./streamArchiver.js');

describe('streamArchiver', () => {
  let mockStreamSourceClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockStreamSourceClient = {
      getExpiredOfflineStreams: jest.fn(),
      archiveStream: jest.fn()
    };
  });

  describe('shouldRunArchive', () => {
    test('should return true when enabled and interval passed', () => {
      const lastCheck = Date.now() - 400000; // 6+ minutes ago
      expect(shouldRunArchive(true, lastCheck, 300000)).toBe(true);
    });

    test('should return false when disabled', () => {
      const lastCheck = 0;
      expect(shouldRunArchive(false, lastCheck, 300000)).toBe(false);
    });

    test('should return false when interval not reached', () => {
      const lastCheck = Date.now() - 100000; // 1.5 minutes ago
      expect(shouldRunArchive(true, lastCheck, 300000)).toBe(false);
    });
  });

  describe('archiveExpiredStreams', () => {
    test('should throw if streamSourceClient is null', async () => {
      await expect(archiveExpiredStreams(null, 30)).rejects.toThrow('StreamSource client is required');
    });

    test('should handle no expired streams', async () => {
      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValue([]);
      
      const result = await archiveExpiredStreams(mockStreamSourceClient, 30);
      
      expect(mockLog).toHaveBeenCalledWith('Checking for expired streams to archive (threshold: 30 minutes)');
      expect(mockLog).toHaveBeenCalledWith('No expired streams found to archive');
      expect(result).toEqual({ archivedCount: 0, errorCount: 0 });
      expect(mockStreamSourceClient.archiveStream).not.toHaveBeenCalled();
    });

    test('should archive expired offline streams', async () => {
      const now = new Date();
      const expiredStreams = [
        {
          id: 1,
          link: 'https://twitch.tv/test1',
          status: 'offline',
          last_live_at: new Date(now - 45 * 60 * 1000).toISOString()
        },
        {
          id: 2,
          link: 'https://twitch.tv/test2',
          status: 'unknown',
          last_live_at: new Date(now - 60 * 60 * 1000).toISOString()
        }
      ];

      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValue(expiredStreams);
      mockStreamSourceClient.archiveStream.mockResolvedValue({ success: true });

      const result = await archiveExpiredStreams(mockStreamSourceClient, 30);

      expect(mockStreamSourceClient.getExpiredOfflineStreams).toHaveBeenCalledWith(30);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledTimes(2);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(1);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(2);
      expect(mockDelay).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(100);
      expect(result).toEqual({ archivedCount: 2, errorCount: 0 });
    });

    test('should skip streams that changed state', async () => {
      const now = new Date();
      const expiredStreams = [
        {
          id: 1,
          link: 'https://twitch.tv/test1',
          status: 'live', // Changed to live
          last_live_at: new Date(now - 45 * 60 * 1000).toISOString()
        },
        {
          id: 2,
          link: 'https://twitch.tv/test2',
          status: 'offline',
          last_live_at: new Date(now - 10 * 60 * 1000).toISOString() // Too recent
        },
        {
          id: 3,
          link: 'https://twitch.tv/test3',
          status: 'offline',
          last_live_at: new Date(now - 45 * 60 * 1000).toISOString() // Should archive
        }
      ];

      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValue(expiredStreams);
      mockStreamSourceClient.archiveStream.mockResolvedValue({ success: true });

      const result = await archiveExpiredStreams(mockStreamSourceClient, 30);

      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledTimes(1);
      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(3);
      expect(mockLog).toHaveBeenCalledWith('Stream 1 state changed, skipping archive');
      expect(mockLog).toHaveBeenCalledWith('Stream 2 state changed, skipping archive');
      expect(result).toEqual({ archivedCount: 1, errorCount: 0 });
    });

    test('should handle archive errors gracefully', async () => {
      const expiredStreams = [
        {
          id: 1,
          link: 'https://twitch.tv/test1',
          status: 'offline',
          last_live_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
        },
        {
          id: 2,
          link: 'https://twitch.tv/test2',
          status: 'offline',
          last_live_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
        }
      ];

      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValue(expiredStreams);
      mockStreamSourceClient.archiveStream
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await archiveExpiredStreams(mockStreamSourceClient, 30);

      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledTimes(2);
      expect(mockLog).toHaveBeenCalledWith('Failed to archive stream 2: Network error');
      expect(result).toEqual({ archivedCount: 1, errorCount: 1 });
    });

    test('should use updated_at when last_live_at is null', async () => {
      const now = new Date();
      const expiredStreams = [
        {
          id: 1,
          link: 'https://twitch.tv/test1',
          status: 'offline',
          last_live_at: null,
          updated_at: new Date(now - 45 * 60 * 1000).toISOString()
        }
      ];

      mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValue(expiredStreams);
      mockStreamSourceClient.archiveStream.mockResolvedValue({ success: true });

      await archiveExpiredStreams(mockStreamSourceClient, 30);

      expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(1);
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Archived stream 1'));
    });

    test('should handle API errors when fetching expired streams', async () => {
      mockStreamSourceClient.getExpiredOfflineStreams.mockRejectedValue(new Error('API Error'));

      await expect(
        archiveExpiredStreams(mockStreamSourceClient, 30)
      ).rejects.toThrow('API Error');

      expect(mockLog).toHaveBeenCalledWith('Error during archive process:', 'API Error');
      expect(mockStreamSourceClient.archiveStream).not.toHaveBeenCalled();
    });
  });
});