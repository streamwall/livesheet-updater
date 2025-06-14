/**
 * @fileoverview URL validation, cleaning, and platform detection utilities
 * @module utils/url
 */

// URL validation and cleaning utilities
import { NON_ASCII_PATTERN, ZERO_WIDTH_PATTERN, URL_PATTERNS } from '../config/constants.js';

// Helper to clean URLs consistently
export const cleanUrl = (url) => {
  return url.trim()
    .replace(NON_ASCII_PATTERN, '')
    .replace(ZERO_WIDTH_PATTERN, '');
};

export const isValidLiveUrl = (url) => {
  return !!(url && Object.values(URL_PATTERNS).some(p => p.test(url)));
};

export const getPlatform = (url) => {
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('twitch.tv')) return 'Twitch';
  return 'Unknown';
};