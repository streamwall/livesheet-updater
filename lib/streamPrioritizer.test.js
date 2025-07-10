import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { prioritizeStreams, getStreamPriority } from './streamPrioritizer.js';

describe('streamPrioritizer module', () => {
  let mockNow;

  beforeEach(() => {
    // Mock Date.now() for consistent testing
    mockNow = new Date('2024-01-01T12:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(mockNow);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getStreamPriority', () => {
    test('should return priority 3 for never checked streams', () => {
      const stream = {
        id: 1,
        last_checked_at: null,
        status: 'offline',
        last_live_at: null
      };
      
      expect(getStreamPriority(stream)).toBe(3);
    });

    test('should return priority 2 for currently live streams', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 60000).toISOString(),
        status: 'live',
        last_live_at: new Date(mockNow - 60000).toISOString()
      };
      
      expect(getStreamPriority(stream)).toBe(2);
    });

    test('should return priority 2 for streams with uppercase LIVE status', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 60000).toISOString(),
        status: 'LIVE',
        last_live_at: new Date(mockNow - 60000).toISOString()
      };
      
      expect(getStreamPriority(stream)).toBe(2);
    });

    test('should return priority 1 for recently live streams (within 20 minutes)', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 300000).toISOString(), // 5 minutes ago
        status: 'offline',
        last_live_at: new Date(mockNow - 900000).toISOString() // 15 minutes ago
      };
      
      expect(getStreamPriority(stream)).toBe(1);
    });

    test('should return priority 1 for streams exactly at 20 minute threshold', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 300000).toISOString(),
        status: 'offline',
        last_live_at: new Date(mockNow - 20 * 60 * 1000).toISOString() // Exactly 20 minutes
      };
      
      expect(getStreamPriority(stream)).toBe(1);
    });

    test('should return priority 0 for old offline streams', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 3600000).toISOString(), // 1 hour ago
        status: 'offline',
        last_live_at: new Date(mockNow - 7200000).toISOString() // 2 hours ago
      };
      
      expect(getStreamPriority(stream)).toBe(0);
    });

    test('should return priority 0 for streams with no last_live_at', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 3600000).toISOString(),
        status: 'offline',
        last_live_at: null
      };
      
      expect(getStreamPriority(stream)).toBe(0);
    });

    test('should handle missing status field', () => {
      const stream = {
        id: 1,
        last_checked_at: new Date(mockNow - 60000).toISOString(),
        last_live_at: new Date(mockNow - 60000).toISOString()
      };
      
      expect(getStreamPriority(stream)).toBe(1); // Recently live
    });

    test('should use custom now parameter when provided', () => {
      const customNow = new Date('2024-01-02T12:00:00.000Z').getTime();
      const stream = {
        id: 1,
        last_checked_at: new Date('2024-01-02T11:50:00.000Z').toISOString(), // 10 minutes before customNow
        status: 'offline',
        last_live_at: new Date('2024-01-02T11:45:00.000Z').toISOString() // 15 minutes before customNow
      };
      
      expect(getStreamPriority(stream, customNow)).toBe(1); // Recently live
    });
  });

  describe('prioritizeStreams', () => {
    test('should sort streams by priority in descending order', () => {
      const streams = [
        {
          id: 1,
          status: 'offline',
          last_checked_at: new Date(mockNow - 3600000).toISOString(),
          last_live_at: new Date(mockNow - 7200000).toISOString()
        },
        {
          id: 2,
          status: 'offline',
          last_checked_at: null,
          last_live_at: null
        },
        {
          id: 3,
          status: 'live',
          last_checked_at: new Date(mockNow - 180000).toISOString(),
          last_live_at: new Date(mockNow - 180000).toISOString()
        },
        {
          id: 4,
          status: 'offline',
          last_checked_at: new Date(mockNow - 900000).toISOString(),
          last_live_at: new Date(mockNow - 900000).toISOString()
        }
      ];

      const prioritized = prioritizeStreams(streams);

      expect(prioritized[0].id).toBe(2); // Never checked (priority 3)
      expect(prioritized[1].id).toBe(3); // Currently live (priority 2)
      expect(prioritized[2].id).toBe(4); // Recently live (priority 1)
      expect(prioritized[3].id).toBe(1); // Old offline (priority 0)
    });

    test('should maintain order for streams with same priority', () => {
      const streams = [
        {
          id: 1,
          status: 'live',
          last_checked_at: new Date(mockNow - 60000).toISOString(),
          last_live_at: new Date(mockNow - 60000).toISOString()
        },
        {
          id: 2,
          status: 'live',
          last_checked_at: new Date(mockNow - 120000).toISOString(),
          last_live_at: new Date(mockNow - 120000).toISOString()
        },
        {
          id: 3,
          status: 'LIVE',
          last_checked_at: new Date(mockNow - 180000).toISOString(),
          last_live_at: new Date(mockNow - 180000).toISOString()
        }
      ];

      const prioritized = prioritizeStreams(streams);

      // All have priority 2 (live), should maintain original order
      expect(prioritized[0].id).toBe(1);
      expect(prioritized[1].id).toBe(2);
      expect(prioritized[2].id).toBe(3);
    });

    test('should handle empty array', () => {
      const streams = [];
      const prioritized = prioritizeStreams(streams);
      
      expect(prioritized).toEqual([]);
    });

    test('should handle single stream', () => {
      const streams = [{
        id: 1,
        status: 'offline',
        last_checked_at: new Date(mockNow - 3600000).toISOString(),
        last_live_at: null
      }];
      
      const prioritized = prioritizeStreams(streams);
      
      expect(prioritized).toHaveLength(1);
      expect(prioritized[0].id).toBe(1);
    });

    test('should not modify original array', () => {
      const streams = [
        { id: 1, last_checked_at: null },
        { id: 2, status: 'live', last_checked_at: new Date().toISOString() }
      ];
      
      const originalStreams = [...streams];
      prioritizeStreams(streams);
      
      expect(streams).toEqual(originalStreams);
    });
  });
});