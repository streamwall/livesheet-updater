/**
 * @fileoverview Priority-based rate limiting calculations for known streamers
 * @module utils/priority
 */

// Priority calculation utilities
import { 
  BASE_CHECK_RATE, 
  MAX_CHECK_RATE, 
  PRIORITY_ALWAYS_CHECK,
  PRIORITY_MIN,
  PRIORITY_MAX,
  PRIORITY_STEEPNESS_FACTOR
} from '../config/constants.js';

// Calculate check rate based on priority percentile (0-100)
export const getCheckRateForPriority = (priority) => {
  const p = parseInt(priority) || 0;
  
  // Clamp priority between PRIORITY_MIN and PRIORITY_MAX
  const clampedPriority = Math.max(PRIORITY_MIN, Math.min(PRIORITY_MAX, p));
  
  if (clampedPriority >= PRIORITY_ALWAYS_CHECK) return 0;  // Priority 100 = no rate limit
  
  // Base rate + exponential decay for additional time
  // For priority < 100: rate = BASE_CHECK_RATE + (MAX_CHECK_RATE - BASE_CHECK_RATE) * 2^(-k * priority/100)
  // This ensures minimum 15 min for all priorities < 100
  const normalizedPriority = clampedPriority / PRIORITY_MAX;
  const additionalTime = (MAX_CHECK_RATE - BASE_CHECK_RATE) * Math.pow(2, -PRIORITY_STEEPNESS_FACTOR * normalizedPriority);
  const rate = Math.round(BASE_CHECK_RATE + additionalTime);
  return rate;
};