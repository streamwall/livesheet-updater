import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createSheetHelpers } from '../../utils/sheets.js';

describe('utils/sheets', () => {
  let sheetHelpers;
  let mockLogger;
  let mockSheet;
  let mockRow;
  
  beforeEach(() => {
    mockLogger = {
      debug: jest.fn()
    };
    
    mockSheet = {
      headerValues: ['Source', 'Platform', 'Link', 'Status', 'Last Checked (PST)', 'Last Live (PST)', 'Added Date']
    };
    
    mockRow = {
      get: jest.fn(),
      set: jest.fn()
    };
    
    sheetHelpers = createSheetHelpers(mockLogger);
  });
  
  describe('getField', () => {
    test('exact match', () => {
      mockRow.get.mockImplementation(field => field === 'Link' ? 'https://example.com' : undefined);
      
      const result = sheetHelpers.getField(mockRow, 'Link', mockSheet);
      expect(result).toBe('https://example.com');
      expect(mockRow.get).toHaveBeenCalledWith('Link');
    });
    
    test('case-insensitive match', () => {
      mockRow.get.mockImplementation(field => field === 'Status' ? 'Live' : undefined);
      
      const result = sheetHelpers.getField(mockRow, 'status', mockSheet);
      expect(result).toBe('Live');
    });
    
    test('returns undefined for missing field', () => {
      mockRow.get.mockReturnValue(undefined);
      
      const result = sheetHelpers.getField(mockRow, 'NonExistent', mockSheet);
      expect(result).toBeUndefined();
    });
    
    test('debug logging for Date fields', () => {
      mockRow.get.mockReturnValue(undefined);
      
      sheetHelpers.getField(mockRow, 'Some Date Field', mockSheet);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "getField: Column 'Some Date Field' not found. Available columns: Source, Platform, Link, Status, Last Checked (PST), Last Live (PST), Added Date"
      );
    });
  });
  
  describe('setField', () => {
    test('exact match', () => {
      sheetHelpers.setField(mockRow, 'Status', 'Live', mockSheet);
      expect(mockRow.set).toHaveBeenCalledWith('Status', 'Live');
    });
    
    test('case-insensitive match', () => {
      mockRow.set.mockImplementation((field, value) => {
        if (field !== 'Status') throw new Error('Field not found');
      });
      
      sheetHelpers.setField(mockRow, 'status', 'Live', mockSheet);
      expect(mockRow.set).toHaveBeenCalledWith('Status', 'Live');
    });
    
    test('debug logging for missing field', () => {
      mockRow.set.mockImplementation(() => {
        throw new Error('Field not found');
      });
      
      sheetHelpers.setField(mockRow, 'NonExistent', 'value', mockSheet);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "setField: Failed to set 'NonExistent' = 'value'. Column not found. Available: Source, Platform, Link, Status, Last Checked (PST), Last Live (PST), Added Date"
      );
    });
  });
});