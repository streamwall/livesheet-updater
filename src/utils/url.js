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

import { 
  PLATFORM_TIKTOK,
  PLATFORM_YOUTUBE,
  PLATFORM_TWITCH,
  PLATFORM_UNKNOWN,
  DOMAIN_TIKTOK,
  DOMAIN_YOUTUBE,
  DOMAIN_YOUTUBE_SHORT,
  DOMAIN_TWITCH
} from '../config/constants.js';

export const getPlatform = (url) => {
  if (url.includes(DOMAIN_TIKTOK)) return PLATFORM_TIKTOK;
  if (url.includes(DOMAIN_YOUTUBE) || url.includes(DOMAIN_YOUTUBE_SHORT)) return PLATFORM_YOUTUBE;
  if (url.includes(DOMAIN_TWITCH)) return PLATFORM_TWITCH;
  return PLATFORM_UNKNOWN;
};