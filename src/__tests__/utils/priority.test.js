import { describe, test, expect } from '@jest/globals';
import { getCheckRateForPriority } from '../../utils/priority.js';
import { 
  BASE_CHECK_RATE,
  MAX_CHECK_RATE,
  PRIORITY_ALWAYS_CHECK
} from '../../config/constants.js';

describe('utils/priority', () => {
  describe('getCheckRateForPriority', () => {
    test('returns 0 for priority >= 100', () => {
      expect(getCheckRateForPriority(100)).toBe(0);
      expect(getCheckRateForPriority(999)).toBe(0);
    });
    
    test('returns MAX_CHECK_RATE for priority <= 0', () => {
      expect(getCheckRateForPriority(0)).toBe(MAX_CHECK_RATE);
      expect(getCheckRateForPriority(-1)).toBe(MAX_CHECK_RATE);
    });
    
    test('calculates correct rates for positive priorities', () => {
      // Base rate + exponential decay: rate = BASE_CHECK_RATE + (MAX_CHECK_RATE - BASE_CHECK_RATE) * 2^(-4 * priority/100)
      // Additional time range: 90 - 15 = 75 minutes
      
      // Priority 10: 15 + 75 * 2^(-0.4) ≈ 15 + 58.2 ≈ 73.2 minutes
      const expected10 = Math.round(BASE_CHECK_RATE + (MAX_CHECK_RATE - BASE_CHECK_RATE) * Math.pow(2, -0.4));
      expect(getCheckRateForPriority(10)).toBe(expected10);
      
      // Priority 50: 15 + 75 * 2^(-2) = 15 + 18.75 ≈ 34 minutes
      const expected50 = Math.round(BASE_CHECK_RATE + (MAX_CHECK_RATE - BASE_CHECK_RATE) * Math.pow(2, -2));
      expect(getCheckRateForPriority(50)).toBe(expected50);
      
      // Priority 90: 15 + 75 * 2^(-3.6) ≈ 15 + 6.0 ≈ 21 minutes
      const expected90 = Math.round(BASE_CHECK_RATE + (MAX_CHECK_RATE - BASE_CHECK_RATE) * Math.pow(2, -3.6));
      expect(getCheckRateForPriority(90)).toBe(expected90);
    });
    
    test('priority values are clamped between 0-100', () => {
      // Values > 100 should still return 0 (always check)
      expect(getCheckRateForPriority(101)).toBe(0);
      expect(getCheckRateForPriority(1000)).toBe(0);
      
      // Values < 0 should be treated as 0
      expect(getCheckRateForPriority(-10)).toBe(MAX_CHECK_RATE);
      expect(getCheckRateForPriority(-100)).toBe(MAX_CHECK_RATE);
    });
    
    test('handles non-numeric input', () => {
      expect(getCheckRateForPriority(null)).toBe(MAX_CHECK_RATE);
      expect(getCheckRateForPriority(undefined)).toBe(MAX_CHECK_RATE);
      expect(getCheckRateForPriority('abc')).toBe(MAX_CHECK_RATE);
      expect(getCheckRateForPriority('')).toBe(MAX_CHECK_RATE);
    });
  });
});