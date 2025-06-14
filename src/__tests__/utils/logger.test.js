import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createLogger } from '../../utils/logger.js';

describe('utils/logger', () => {
  let mockDeps;
  let logger;
  
  beforeEach(() => {
    mockDeps = {
      console: {
        log: jest.fn()
      },
      process: {
        env: {}
      },
      Date: class extends Date {
        constructor() {
          super('2023-01-01T00:00:00.000Z');
        }
        toISOString() {
          return '2023-01-01T00:00:00.000Z';
        }
      }
    };
    
    logger = createLogger(mockDeps);
  });
  
  describe('log', () => {
    test('adds timestamp', () => {
      logger.log('test message');
      expect(mockDeps.console.log).toHaveBeenCalledWith(
        '2023-01-01T00:00:00.000Z',
        'test message'
      );
    });
    
    test('handles multiple arguments', () => {
      logger.log('message', 'arg2', { key: 'value' });
      expect(mockDeps.console.log).toHaveBeenCalledWith(
        '2023-01-01T00:00:00.000Z',
        'message',
        'arg2',
        { key: 'value' }
      );
    });
  });
  
  describe('debug', () => {
    test('only logs when DEBUG env is set', () => {
      // Without DEBUG env
      logger.debug('debug message');
      expect(mockDeps.console.log).not.toHaveBeenCalled();
      
      // With DEBUG env
      mockDeps.process.env.DEBUG = 'true';
      logger = createLogger(mockDeps);
      logger.debug('debug message');
      expect(mockDeps.console.log).toHaveBeenCalledWith(
        '2023-01-01T00:00:00.000Z',
        '[DEBUG]',
        'debug message'
      );
    });
  });
});