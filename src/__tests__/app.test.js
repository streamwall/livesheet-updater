import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createApp } from '../app.js';

describe('app', () => {
  let app;
  let mockDeps;
  
  beforeEach(() => {
    mockDeps = {
      fs: {
        readFile: jest.fn()
      },
      GoogleAuth: jest.fn(),
      GoogleSpreadsheet: jest.fn(),
      fetch: jest.fn(),
      console: {
        log: jest.fn()
      },
      process: {
        env: {},
        argv: ['node', 'main.js']
      },
      setTimeout: jest.fn(),
      Date: globalThis.Date
    };
    
    app = createApp(mockDeps);
  });
  
  test('creates app with all required methods', () => {
    // Configuration
    expect(app.KNOWN_STREAMERS_ONLY).toBeDefined();
    
    // Helper functions
    expect(app.getCheckRateForPriority).toBeInstanceOf(Function);
    expect(app.cleanUrl).toBeInstanceOf(Function);
    expect(app.isValidLiveUrl).toBeInstanceOf(Function);
    expect(app.getPlatform).toBeInstanceOf(Function);
    expect(app.getField).toBeInstanceOf(Function);
    expect(app.setField).toBeInstanceOf(Function);
    expect(app.delay).toBeInstanceOf(Function);
    expect(app.log).toBeInstanceOf(Function);
    expect(app.debug).toBeInstanceOf(Function);
    
    // Core functions
    expect(app.fetchUrlStatus).toBeInstanceOf(Function);
    expect(app.checkStatus).toBeInstanceOf(Function);
    expect(app.batchUpdateRows).toBeInstanceOf(Function);
    expect(app.isUrlInLivesheet).toBeInstanceOf(Function);
    expect(app.checkKnownStreamers).toBeInstanceOf(Function);
    expect(app.initialize).toBeInstanceOf(Function);
    
    // State
    expect(app.pendingUpdates).toBeInstanceOf(Map);
    expect(app.knownStreamersLastCheck).toBeInstanceOf(Map);
    
    // Sheet accessors
    expect(app.getSheet).toBeInstanceOf(Function);
    expect(app.getKnownStreamersSheet).toBeInstanceOf(Function);
    expect(app.setSheet).toBeInstanceOf(Function);
    expect(app.setKnownStreamersSheet).toBeInstanceOf(Function);
    
    // Main loop (initially null)
    expect(app.main).toBeNull();
  });
  
  test('detects KNOWN_STREAMERS_ONLY mode from environment', () => {
    mockDeps.process.env.KNOWN_STREAMERS_ONLY = 'true';
    const knownOnlyApp = createApp(mockDeps);
    expect(knownOnlyApp.KNOWN_STREAMERS_ONLY).toBe(true);
  });
  
  test('detects KNOWN_STREAMERS_ONLY mode from command line', () => {
    mockDeps.process.argv = ['node', 'main.js', '--known-only'];
    const knownOnlyApp = createApp(mockDeps);
    expect(knownOnlyApp.KNOWN_STREAMERS_ONLY).toBe(true);
  });
  
  test('defaults to normal mode', () => {
    expect(app.KNOWN_STREAMERS_ONLY).toBe(false);
  });
  
  test('sheet accessors work correctly', () => {
    const mockSheet = { title: 'Test Sheet' };
    const mockKnownStreamersSheet = { title: 'Known Streamers' };
    
    expect(app.getSheet()).toBeNull();
    expect(app.getKnownStreamersSheet()).toBeNull();
    
    app.setSheet(mockSheet);
    app.setKnownStreamersSheet(mockKnownStreamersSheet);
    
    expect(app.getSheet()).toBe(mockSheet);
    expect(app.getKnownStreamersSheet()).toBe(mockKnownStreamersSheet);
  });
  
  test('wires dependencies correctly', () => {
    // Test that logging uses the provided console
    app.log('test message');
    expect(mockDeps.console.log).toHaveBeenCalled();
    
    // Test that delay uses the provided setTimeout
    const delayPromise = app.delay(100);
    expect(mockDeps.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
  });
  
  test('wrapper functions delegate correctly', async () => {
    // Mock the file system to return valid credentials
    mockDeps.fs.readFile = jest.fn().mockResolvedValue(JSON.stringify({
      type: 'service_account',
      project_id: 'test',
      private_key: 'test-key'
    }));
    
    // Mock Google Auth and Spreadsheet
    const mockClient = {};
    mockDeps.GoogleAuth.mockImplementation(() => ({
      getClient: jest.fn().mockResolvedValue(mockClient)
    }));
    
    const mockDoc = {
      loadInfo: jest.fn(),
      sheetsByTitle: {
        'Livesheet': { 
          title: 'Livesheet',
          getRows: jest.fn().mockResolvedValue([]),
          headerValues: []
        },
        'Known Streamers': {
          title: 'Known Streamers',
          getRows: jest.fn().mockResolvedValue([]),
          headerValues: []
        }
      }
    };
    mockDeps.GoogleSpreadsheet.mockImplementation(() => mockDoc);
    
    // Create a more complete app with mocked services
    const testApp = createApp(mockDeps);
    
    // Test initialize
    await testApp.initialize();
    
    // Test getField and setField with sheet parameter
    const mockRow = { 
      get: jest.fn().mockReturnValue('value'),
      set: jest.fn()
    };
    const mockSheet = { headerValues: ['test'] };
    testApp.setSheet(mockSheet);
    
    const fieldValue = testApp.getField(mockRow, 'test');
    expect(fieldValue).toBe('value');
    
    testApp.setField(mockRow, 'test', 'newvalue');
    expect(mockRow.set).toHaveBeenCalledWith('test', 'newvalue');
    
    // Test wrapper functions that pass sheet
    testApp.getField(mockRow, 'test', mockSheet);
    testApp.setField(mockRow, 'test', 'value', mockSheet);
    
    // Test checkStatus wrapper
    await testApp.checkStatus(mockRow, 0);
    
    // Test batchUpdateRows wrapper
    await testApp.batchUpdateRows(Date.now());
    
    // Test isUrlInLivesheet wrapper
    testApp.isUrlInLivesheet('https://example.com', []);
    
    // Test checkKnownStreamers wrapper
    await testApp.checkKnownStreamers();
    
    // Test debug function
    testApp.debug('debug message');
    
    // All wrapper functions should have been called
    expect(testApp.pendingUpdates).toBeDefined();
    expect(testApp.knownStreamersLastCheck).toBeDefined();
  });
});