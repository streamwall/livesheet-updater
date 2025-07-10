import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Since main.js is not easily testable as is (immediately executes), 
// we'll test the archiving logic conceptually

describe('archiveExpiredStreams logic', () => {
  let mockStreamSourceClient;
  let mockLog;
  let mockDelay;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLog = jest.fn();
    mockDelay = jest.fn().mockResolvedValue();
    
    mockStreamSourceClient = {
      getExpiredOfflineStreams: jest.fn(),
      archiveStream: jest.fn()
    };
  });

  async function archiveExpiredStreams(streamSourceClient, thresholdMinutes, log, delay) {
    if (!streamSourceClient) return;
    
    try {
      log(`Checking for expired streams to archive (threshold: ${thresholdMinutes} minutes)`);
      
      // Get expired offline streams from StreamSource
      const expiredStreams = await streamSourceClient.getExpiredOfflineStreams(thresholdMinutes);
      
      if (expiredStreams.length === 0) {
        log('No expired streams found to archive');
        return;
      }
      
      log(`Found ${expiredStreams.length} expired streams to archive`);
      
      // Archive each stream
      let archivedCount = 0;
      let errorCount = 0;
      
      for (const stream of expiredStreams) {
        try {
          // Re-verify the stream is still offline before archiving
          // This helps prevent race conditions
          const currentTime = new Date();
          const lastLiveTime = stream.last_live_at ? new Date(stream.last_live_at) : new Date(stream.updated_at);
          const diffMinutes = (currentTime - lastLiveTime) / 60000;
          
          if ((stream.status !== 'offline' && stream.status !== 'unknown') || diffMinutes < thresholdMinutes) {
            log(`Stream ${stream.id} state changed, skipping archive`);
            continue;
          }
          
          await streamSourceClient.archiveStream(stream.id);
          archivedCount++;
          log(`Archived stream ${stream.id}: ${stream.link} (offline for ${diffMinutes.toFixed(1)} min)`);
          
          // Small delay between archives to avoid hammering the API
          await delay(100);
        } catch (error) {
          errorCount++;
          log(`Failed to archive stream ${stream.id}: ${error.message}`);
        }
      }
      
      log(`Archive complete: ${archivedCount} archived, ${errorCount} errors`);
      return { archivedCount, errorCount };
    } catch (error) {
      log('Error during archive process:', error.message);
      throw error;
    }
  }

  test('should not run if streamSourceClient is null', async () => {
    await archiveExpiredStreams(null, 30, mockLog, mockDelay);
    
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockStreamSourceClient.getExpiredOfflineStreams).not.toHaveBeenCalled();
  });

  test('should handle no expired streams', async () => {
    mockStreamSourceClient.getExpiredOfflineStreams.mockResolvedValue([]);
    
    await archiveExpiredStreams(mockStreamSourceClient, 30, mockLog, mockDelay);
    
    expect(mockLog).toHaveBeenCalledWith('Checking for expired streams to archive (threshold: 30 minutes)');
    expect(mockLog).toHaveBeenCalledWith('No expired streams found to archive');
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

    const result = await archiveExpiredStreams(mockStreamSourceClient, 30, mockLog, mockDelay);

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

    const result = await archiveExpiredStreams(mockStreamSourceClient, 30, mockLog, mockDelay);

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

    const result = await archiveExpiredStreams(mockStreamSourceClient, 30, mockLog, mockDelay);

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

    await archiveExpiredStreams(mockStreamSourceClient, 30, mockLog, mockDelay);

    expect(mockStreamSourceClient.archiveStream).toHaveBeenCalledWith(1);
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Archived stream 1'));
  });

  test('should handle API errors when fetching expired streams', async () => {
    mockStreamSourceClient.getExpiredOfflineStreams.mockRejectedValue(new Error('API Error'));

    await expect(
      archiveExpiredStreams(mockStreamSourceClient, 30, mockLog, mockDelay)
    ).rejects.toThrow('API Error');

    expect(mockLog).toHaveBeenCalledWith('Error during archive process:', 'API Error');
    expect(mockStreamSourceClient.archiveStream).not.toHaveBeenCalled();
  });
});