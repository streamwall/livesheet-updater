import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import StreamSourceClient from './streamSourceClient.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('StreamSourceClient', () => {
  let client;
  let mockLogger;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn()
    };

    // Create client instance
    client = new StreamSourceClient({
      apiUrl: 'https://api.test.com',
      email: 'test@example.com',
      password: 'testpass'
    }, mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('authentication', () => {
    test('should authenticate successfully', async () => {
      const mockToken = 'test-jwt-token';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ token: mockToken })
      });

      await client.authenticate();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/users/login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'testpass'
          })
        })
      );

      expect(client.token).toBe(mockToken);
      expect(client.tokenExpiry).toBeGreaterThan(Date.now());
      expect(mockLogger.log).toHaveBeenCalledWith('Successfully authenticated with StreamSource');
    });

    test('should throw error on authentication failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'Invalid credentials' })
      });

      await expect(client.authenticate()).rejects.toThrow('Invalid credentials');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should re-authenticate when token expires', async () => {
      // Set expired token
      client.token = 'expired-token';
      client.tokenExpiry = Date.now() - 1000;

      const newToken = 'new-jwt-token';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ token: newToken })
      });

      await client.ensureAuthenticated();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/users/login',
        expect.any(Object)
      );
      expect(client.token).toBe(newToken);
    });
  });

  describe('getStreams', () => {
    beforeEach(() => {
      // Mock successful authentication
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should fetch streams with query parameters', async () => {
      const mockResponse = {
        streams: [
          { id: 1, link: 'https://twitch.tv/test1', status: 'live' },
          { id: 2, link: 'https://twitch.tv/test2', status: 'offline' }
        ],
        meta: { total_count: 2, total_pages: 1 }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      const result = await client.getStreams({ page: 1, per_page: 10, is_archived: false });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/streams?page=1&per_page=10&is_archived=false',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('archiveStream', () => {
    beforeEach(() => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should archive a stream by setting is_archived to true', async () => {
      const streamId = 123;
      const mockResponse = { id: streamId, is_archived: true };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      const result = await client.archiveStream(streamId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v1/streams/${streamId}`,
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          }),
          body: JSON.stringify({ is_archived: true })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should handle archive errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: 'Stream not found' })
      });

      await expect(client.archiveStream(999)).rejects.toThrow('Stream not found');
    });
  });

  describe('getExpiredOfflineStreams', () => {
    beforeEach(() => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should return offline streams older than threshold', async () => {
      const now = new Date();
      const oldDate = new Date(now - 45 * 60 * 1000); // 45 minutes ago
      const recentDate = new Date(now - 15 * 60 * 1000); // 15 minutes ago

      const mockStreams = [
        { id: 1, status: 'offline', last_live_at: oldDate.toISOString() },
        { id: 2, status: 'offline', last_live_at: recentDate.toISOString() },
        { id: 3, status: 'live', last_live_at: oldDate.toISOString() },
        { id: 4, status: 'unknown', last_live_at: oldDate.toISOString() },
        { id: 5, status: 'offline', last_live_at: null, updated_at: oldDate.toISOString() }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: mockStreams,
          meta: { total_pages: 1 }
        })
      });

      const expired = await client.getExpiredOfflineStreams(30);

      // Should return streams 1, 4, and 5 (offline/unknown and older than 30 min)
      expect(expired).toHaveLength(3);
      expect(expired.map(s => s.id)).toEqual([1, 4, 5]);
    });

    test('should handle pagination', async () => {
      const oldDate = new Date(Date.now() - 45 * 60 * 1000).toISOString();

      // Mock first page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: [
            { id: 1, status: 'offline', last_live_at: oldDate }
          ],
          meta: { total_pages: 2 }
        })
      });

      // Mock second page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: [
            { id: 2, status: 'offline', last_live_at: oldDate }
          ],
          meta: { total_pages: 2 }
        })
      });

      const expired = await client.getExpiredOfflineStreams(30);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(expired).toHaveLength(2);
      expect(expired.map(s => s.id)).toEqual([1, 2]);
    });

    test('should use updated_at when last_live_at is null', async () => {
      const oldDate = new Date(Date.now() - 45 * 60 * 1000).toISOString();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: [
            { id: 1, status: 'offline', last_live_at: null, updated_at: oldDate }
          ],
          meta: { total_pages: 1 }
        })
      });

      const expired = await client.getExpiredOfflineStreams(30);

      expect(expired).toHaveLength(1);
      expect(expired[0].id).toBe(1);
    });
  });

  describe('updateStream', () => {
    beforeEach(() => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should update stream properties', async () => {
      const streamId = 123;
      const updates = { status: 'offline', notes: 'Updated' };
      const mockResponse = { id: streamId, ...updates };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      const result = await client.updateStream(streamId, updates);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v1/streams/${streamId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updates)
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateStreamStatus', () => {
    beforeEach(() => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should update stream status with current timestamp', async () => {
      const streamId = 123;
      const mockResponse = { id: streamId, status: 'offline' };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      await client.updateStreamStatus(streamId, 'offline');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v1/streams/${streamId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"offline"')
        })
      );
      
      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('last_checked_at');
      expect(new Date(callBody.last_checked_at)).toBeInstanceOf(Date);
    });

    test('should update last_live_at when stream goes live', async () => {
      const streamId = 123;
      const mockResponse = { id: streamId, status: 'live' };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      await client.updateStreamStatus(streamId, 'live');

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('status', 'live');
      expect(callBody).toHaveProperty('last_checked_at');
      expect(callBody).toHaveProperty('last_live_at');
      expect(callBody.last_live_at).toBe(callBody.last_checked_at);
    });

    test('should not update last_live_at when stream goes offline', async () => {
      const streamId = 123;
      const mockResponse = { id: streamId, status: 'offline' };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      await client.updateStreamStatus(streamId, 'offline');

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('status', 'offline');
      expect(callBody).toHaveProperty('last_checked_at');
      expect(callBody).not.toHaveProperty('last_live_at');
    });
  });

  describe('findStreamByUrl', () => {
    beforeEach(() => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should find stream by URL', async () => {
      const url = 'https://twitch.tv/test';
      const mockStream = { id: 1, link: url };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: [mockStream],
          meta: { total_count: 1 }
        })
      });

      const result = await client.findStreamByUrl(url);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`link=${encodeURIComponent(url)}`),
        expect.any(Object)
      );
      expect(result).toEqual(mockStream);
    });

    test('should cache found streams', async () => {
      const url = 'https://twitch.tv/test';
      const mockStream = { id: 1, link: url };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: [mockStream],
          meta: { total_count: 1 }
        })
      });

      // First call - should fetch from API
      const result1 = await client.findStreamByUrl(url);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await client.findStreamByUrl(url);
      expect(global.fetch).toHaveBeenCalledTimes(1); // No additional call
      expect(result2).toEqual(result1);
    });

    test('should refresh cache after expiry', async () => {
      const url = 'https://twitch.tv/test';
      const mockStream = { id: 1, link: url };

      global.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          streams: [mockStream],
          meta: { total_count: 1 }
        })
      });

      // First call
      await client.findStreamByUrl(url);

      // Expire the cache
      client.cacheExpiryTime = 0;

      // Second call - should fetch again
      await client.findStreamByUrl(url);
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('should return null when stream not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          streams: [],
          meta: { total_count: 0 }
        })
      });

      const result = await client.findStreamByUrl('https://twitch.tv/notfound');
      
      expect(result).toBeNull();
    });

    test('should handle errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.findStreamByUrl('https://twitch.tv/test');
      
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find stream by URL'),
        'Network error'
      );
    });
  });

  describe('createStream', () => {
    beforeEach(() => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
    });

    test('should create a new stream', async () => {
      const streamData = {
        link: 'https://twitch.tv/newstream',
        platform: 'Twitch',
        status: 'offline'
      };
      const mockResponse = { id: 123, ...streamData };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      const result = await client.createStream(streamData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/streams',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(streamData)
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('rate limiting', () => {
    test('should delay requests based on rate limit', async () => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;
      
      const mockResponse = { streams: [], meta: { total_pages: 1 } };
      global.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockResponse)
      });

      // Mock delay function
      client.delay = jest.fn().mockResolvedValue();

      // Make two rapid requests
      const start = Date.now();
      await client.getStreams();
      await client.getStreams();

      // Should have called delay for the second request
      expect(client.delay).toHaveBeenCalled();
    });

    test('should increase delay on rate limit error', async () => {
      client.token = 'test-token';
      client.tokenExpiry = Date.now() + 3600000;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'Rate limited' })
      });

      const initialDelay = client.rateLimitDelay;

      try {
        await client.getStreams();
      } catch (error) {
        // Expected to throw
      }

      expect(client.rateLimitDelay).toBe(initialDelay * 2);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Rate limited')
      );
    });
  });
});