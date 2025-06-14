import { describe, test, expect } from '@jest/globals';
import { cleanUrl, isValidLiveUrl, getPlatform } from '../../utils/url.js';

describe('utils/url', () => {
  describe('cleanUrl', () => {
    test('trims whitespace', () => {
      expect(cleanUrl('  https://example.com  ')).toBe('https://example.com');
      expect(cleanUrl('\nhttps://example.com\t')).toBe('https://example.com');
    });
    
    test('removes non-ASCII characters', () => {
      expect(cleanUrl('https://example.com™')).toBe('https://example.com');
      expect(cleanUrl('https://example.com😀')).toBe('https://example.com');
    });
    
    test('removes zero-width characters', () => {
      expect(cleanUrl('https://example.com\u200B')).toBe('https://example.com');
      expect(cleanUrl('https://example.com\uFEFF')).toBe('https://example.com');
    });
  });
  
  describe('isValidLiveUrl', () => {
    test('validates TikTok URLs', () => {
      expect(isValidLiveUrl('https://www.tiktok.com/@user/live')).toBe(true);
      expect(isValidLiveUrl('https://www.tiktok.com/@user/live?foo=bar')).toBe(true);
      expect(isValidLiveUrl('https://www.tiktok.com/@user')).toBe(false);
      expect(isValidLiveUrl('https://www.tiktok.com/trending')).toBe(false);
    });
    
    test('validates YouTube URLs', () => {
      expect(isValidLiveUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
      expect(isValidLiveUrl('https://youtube.com/watch?v=abc123&t=10s')).toBe(true);
      expect(isValidLiveUrl('https://www.youtube.com/live/abc123')).toBe(true);
      expect(isValidLiveUrl('https://youtu.be/abc123')).toBe(true);
      expect(isValidLiveUrl('https://www.youtube.com/channel/abc')).toBe(false);
    });
    
    test('validates Twitch URLs', () => {
      expect(isValidLiveUrl('https://www.twitch.tv/username')).toBe(true);
      expect(isValidLiveUrl('https://twitch.tv/username')).toBe(true);
      expect(isValidLiveUrl('https://www.twitch.tv/')).toBe(false);
    });
    
    test('rejects invalid input', () => {
      expect(isValidLiveUrl('')).toBe(false);
      expect(isValidLiveUrl(null)).toBe(false);
      expect(isValidLiveUrl(undefined)).toBe(false);
      expect(isValidLiveUrl('not-a-url')).toBe(false);
      expect(isValidLiveUrl('https://example.com')).toBe(false);
    });
  });
  
  describe('getPlatform', () => {
    test('identifies platforms correctly', () => {
      expect(getPlatform('https://www.tiktok.com/@user/live')).toBe('TikTok');
      expect(getPlatform('https://www.youtube.com/watch?v=abc')).toBe('YouTube');
      expect(getPlatform('https://youtu.be/abc')).toBe('YouTube');
      expect(getPlatform('https://www.twitch.tv/user')).toBe('Twitch');
      expect(getPlatform('https://example.com')).toBe('Unknown');
    });
  });
});