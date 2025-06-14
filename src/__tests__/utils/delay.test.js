import { describe, test, expect, jest } from '@jest/globals';
import { createDelay } from '../../utils/delay.js';

describe('utils/delay', () => {
  test('returns a promise', () => {
    const mockSetTimeout = jest.fn((fn, ms) => fn());
    const delay = createDelay(mockSetTimeout);
    
    const result = delay(1000);
    expect(result).toBeInstanceOf(Promise);
  });
  
  test('calls setTimeout with correct arguments', async () => {
    let resolveCallback;
    const mockSetTimeout = jest.fn((fn, ms) => {
      resolveCallback = fn;
      return 123; // mock timer ID
    });
    
    const delay = createDelay(mockSetTimeout);
    const promise = delay(1500);
    
    expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 1500);
    
    // Resolve the promise
    resolveCallback();
    await promise; // Should resolve without error
  });
});