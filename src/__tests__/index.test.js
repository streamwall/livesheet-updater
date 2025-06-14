import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { attachMainLoop } from '../index.js';
import { ERROR_RETRY_DELAY, LOOP_DELAY_MIN, LOOP_DELAY_MAX } from '../config/constants.js';

describe('index', () => {
  let mockApp;
  let mockDeps;
  let appWithMainLoop;
  
  beforeEach(() => {
    mockApp = {
      KNOWN_STREAMERS_ONLY: false,
      log: jest.fn(),
      debug: jest.fn(),
      delay: jest.fn().mockResolvedValue(undefined),
      getField: jest.fn(),
      checkStatus: jest.fn(),
      batchUpdateRows: jest.fn(),
      checkKnownStreamers: jest.fn(),
      getSheet: jest.fn(),
      getKnownStreamersSheet: jest.fn(),
      main: null
    };
    
    mockDeps = {
      Date: {
        now: jest.fn().mockReturnValue(1000000)
      },
      process: {
        exit: jest.fn()
      }
    };
    
    appWithMainLoop = attachMainLoop(mockApp, mockDeps);
  });
  
  test('attaches main function to app', () => {
    expect(appWithMainLoop.main).toBeInstanceOf(Function);
    expect(appWithMainLoop).toBe(mockApp); // Returns the same app instance
  });
  
  describe('main loop', () => {
    let mockSheet;
    let iterationCount;
    
    beforeEach(() => {
      mockSheet = {
        getRows: jest.fn().mockResolvedValue([])
      };
      
      mockApp.getSheet.mockReturnValue(mockSheet);
      mockApp.getKnownStreamersSheet.mockReturnValue(null);
      
      // Mock to only run one iteration
      iterationCount = 0;
      mockApp.delay.mockImplementation(() => {
        if (++iterationCount > 1) {
          throw new Error('Stop iteration');
        }
        return Promise.resolve();
      });
    });
    
    test('runs in normal mode', async () => {
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to stop iteration
      }
      
      expect(mockApp.log).toHaveBeenCalledWith('Live Checker started in Normal mode');
      expect(mockSheet.getRows).toHaveBeenCalled();
      expect(mockApp.checkKnownStreamers).toHaveBeenCalled();
    });
    
    test('runs in known streamers only mode', async () => {
      mockApp.KNOWN_STREAMERS_ONLY = true;
      mockApp.getKnownStreamersSheet.mockReturnValue({});
      
      // Re-attach main loop after changing KNOWN_STREAMERS_ONLY
      appWithMainLoop = attachMainLoop(mockApp, mockDeps);
      
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to stop iteration
      }
      
      expect(mockApp.log).toHaveBeenCalledWith('Live Checker started in Known Streamers Only mode');
      expect(mockSheet.getRows).not.toHaveBeenCalled();
      expect(mockApp.checkKnownStreamers).toHaveBeenCalled();
    });
    
    test('exits if known streamers sheet missing in known-only mode', async () => {
      mockApp.KNOWN_STREAMERS_ONLY = true;
      mockApp.getKnownStreamersSheet.mockReturnValue(null);
      
      // Re-attach main loop after changing KNOWN_STREAMERS_ONLY
      appWithMainLoop = attachMainLoop(mockApp, mockDeps);
      
      // Mock process.exit to throw instead of actually exiting
      mockDeps.process.exit.mockImplementation(() => {
        throw new Error('Process exit');
      });
      
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to exit
      }
      
      expect(mockApp.log).toHaveBeenCalledWith(
        'ERROR: Known Streamers Only mode requested but Known Streamers sheet not found!'
      );
      expect(mockDeps.process.exit).toHaveBeenCalledWith(1);
    });
    
    test('handles empty rows', async () => {
      mockSheet.getRows.mockResolvedValue([]);
      
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to stop iteration
      }
      
      // Should complete without errors
      expect(mockApp.log).toHaveBeenCalledWith('Cycle start —', 0, 'rows fetched');
      expect(mockApp.checkStatus).not.toHaveBeenCalled();
    });
    
    test('handles main loop errors', async () => {
      mockSheet.getRows.mockRejectedValue(new Error('Sheet error'));
      
      // Allow two iterations to test error recovery
      iterationCount = 0;
      mockApp.delay.mockImplementation((ms) => {
        if (++iterationCount > 2) {
          throw new Error('Stop iteration');
        }
        expect(ms).toBe(ERROR_RETRY_DELAY);
        return Promise.resolve();
      });
      
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to stop iteration
      }
      
      expect(mockApp.log).toHaveBeenCalledWith('Main loop error:', 'Sheet error');
      expect(mockApp.delay).toHaveBeenCalledWith(ERROR_RETRY_DELAY);
    });
    
    test('sleeps between cycles', async () => {
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to stop iteration
      }
      
      expect(mockApp.delay).toHaveBeenCalled();
      const sleepTime = mockApp.delay.mock.calls[0][0];
      expect(sleepTime).toBeGreaterThanOrEqual(LOOP_DELAY_MIN);
      expect(sleepTime).toBeLessThanOrEqual(LOOP_DELAY_MAX);
      
      expect(mockApp.log).toHaveBeenCalledWith(
        expect.stringMatching(/Cycle complete — sleeping \d+s/)
      );
    });
    
    test('passes cycle start time to batch updates', async () => {
      const startTime = 1000000;
      mockDeps.Date.now.mockReturnValue(startTime);
      
      try {
        await appWithMainLoop.main();
      } catch (e) {
        // Expected to stop iteration
      }
      
      expect(mockApp.batchUpdateRows).toHaveBeenCalledWith(startTime);
    });
  });
});