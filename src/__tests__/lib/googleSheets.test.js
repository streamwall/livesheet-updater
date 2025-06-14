import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createGoogleSheets } from '../../lib/googleSheets.js';
import { SHEET_ID, SHEET_NAME, KNOWN_STREAMERS_SHEET_NAME } from '../../config/constants.js';

describe('lib/googleSheets', () => {
  let googleSheets;
  let mockDeps;
  let mockLogger;
  let mockSheet;
  let mockKnownStreamersSheet;
  let mockDoc;
  
  beforeEach(() => {
    mockSheet = {
      title: 'Livesheet',
      headerValues: ['Link', 'Status'],
      getRows: jest.fn().mockResolvedValue([])
    };
    
    mockKnownStreamersSheet = {
      title: 'Known Streamers',
      headerValues: ['URL', 'Priority'],
      getRows: jest.fn().mockResolvedValue([])
    };
    
    mockDoc = {
      loadInfo: jest.fn(),
      sheetsByTitle: {
        'Livesheet': mockSheet,
        'Known Streamers': mockKnownStreamersSheet
      }
    };
    
    mockDeps = {
      fs: {
        readFile: jest.fn().mockResolvedValue(JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
          private_key: 'test-key'
        }))
      },
      GoogleAuth: jest.fn(),
      GoogleSpreadsheet: jest.fn().mockImplementation(() => mockDoc)
    };
    
    mockLogger = {
      log: jest.fn()
    };
    
    googleSheets = createGoogleSheets(mockDeps, mockLogger);
  });
  
  describe('initialize', () => {
    test('loads sheets successfully', async () => {
      const mockClient = {};
      mockDeps.GoogleAuth.mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue(mockClient)
      }));
      
      const result = await googleSheets.initialize();
      
      expect(mockDeps.fs.readFile).toHaveBeenCalledWith('./creds.json', 'utf8');
      expect(mockDeps.GoogleAuth).toHaveBeenCalledWith({
        credentials: {
          type: 'service_account',
          project_id: 'test-project',
          private_key: 'test-key'
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      expect(mockDeps.GoogleSpreadsheet).toHaveBeenCalledWith(SHEET_ID, mockClient);
      expect(mockDoc.loadInfo).toHaveBeenCalled();
      expect(mockSheet.getRows).toHaveBeenCalledWith({ limit: 1 });
      expect(mockKnownStreamersSheet.getRows).toHaveBeenCalledWith({ limit: 1 });
      
      expect(result).toEqual({
        sheet: mockSheet,
        knownStreamersSheet: mockKnownStreamersSheet
      });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Loaded sheet "Livesheet", headers:`,
        JSON.stringify(['Link', 'Status'])
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Loaded sheet "Known Streamers", headers:`,
        JSON.stringify(['URL', 'Priority'])
      );
    });
    
    test('throws error if credentials file is missing', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      mockDeps.fs.readFile.mockRejectedValue(error);
      
      await expect(googleSheets.initialize()).rejects.toThrow(
        'Missing creds.json file. Please create one from creds.example.json'
      );
    });
    
    test('throws error if credentials file has invalid JSON', async () => {
      mockDeps.fs.readFile.mockResolvedValue('invalid json');
      
      await expect(googleSheets.initialize()).rejects.toThrow(
        'Invalid creds.json file. Please ensure it contains valid JSON'
      );
    });
    
    test('throws error for other file read errors', async () => {
      mockDeps.fs.readFile.mockRejectedValue(new Error('Permission denied'));
      
      await expect(googleSheets.initialize()).rejects.toThrow(
        'Failed to load credentials: Permission denied'
      );
    });
    
    test('throws error if main sheet not found', async () => {
      mockDoc.sheetsByTitle = {};
      
      mockDeps.GoogleAuth.mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({})
      }));
      
      await expect(googleSheets.initialize()).rejects.toThrow(
        `Sheet "${SHEET_NAME}" not found`
      );
    });
    
    test('warns if known streamers sheet not found', async () => {
      mockDoc.sheetsByTitle = {
        'Livesheet': mockSheet
      };
      
      mockDeps.GoogleAuth.mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({})
      }));
      
      const result = await googleSheets.initialize();
      
      expect(result).toEqual({
        sheet: mockSheet,
        knownStreamersSheet: undefined
      });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Warning: Sheet "${KNOWN_STREAMERS_SHEET_NAME}" not found. Known streamers feature disabled.`
      );
    });
  });
});