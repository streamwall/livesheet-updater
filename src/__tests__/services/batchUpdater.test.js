import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createBatchUpdater } from '../../services/batchUpdater.js';

describe('services/batchUpdater', () => {
  let batchUpdater;
  let mockDeps;
  let mockLogger;
  let mockSheetHelpers;
  let mockSheet;
  let pendingUpdates;
  
  beforeEach(() => {
    mockDeps = {
      Date: class extends Date {
        constructor(...args) {
          if (args.length === 0) {
            super(1000000);
          } else {
            super(...args);
          }
        }
        toISOString() {
          return '2023-01-01T00:00:00.000Z';
        }
      }
    };
    
    mockLogger = {
      log: jest.fn(),
      debug: jest.fn()
    };
    
    mockSheetHelpers = {
      getField: jest.fn(),
      setField: jest.fn()
    };
    
    mockSheet = {
      headerValues: ['Source', 'Platform', 'Link', 'Status', 'Last Checked (PST)', 'Last Live (PST)', 'Added Date'],
      getRows: jest.fn().mockResolvedValue([])
    };
    
    pendingUpdates = new Map();
    
    batchUpdater = createBatchUpdater(mockDeps, mockLogger, mockSheetHelpers);
  });
  
  describe('batchUpdateRows', () => {
    test('returns early with no pending updates', async () => {
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.log).toHaveBeenCalledWith('No updates to process');
      expect(mockSheet.getRows).not.toHaveBeenCalled();
    });
    
    test('processes pending updates', async () => {
      const freshRow = {
        assign: jest.fn(),
        save: jest.fn()
      };
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://example.com';
        return null;
      });
      
      mockSheet.getRows.mockResolvedValue([freshRow]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(freshRow.assign).toHaveBeenCalledWith({
        'Status': 'Live',
        'Last Checked (PST)': '2023-01-01T00:00:00.000Z',
        'Last Live (PST)': '2023-01-01T00:00:00.000Z',
        'Added Date': '2023-01-01T00:00:00.000Z'
      });
      expect(freshRow.save).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Batch update complete: 1 rows updated')
      );
    });
    
    test('handles deleted rows', async () => {
      mockSheet.getRows.mockResolvedValue([]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Row deleted by user, skipping: https://example.com'
      );
    });
    
    test('handles race conditions', async () => {
      const cycleStart = 1000;
      const freshRow = {};
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://example.com';
        if (field === 'Last Checked (PST)') return new Date(2000).toISOString();
        return null;
      });
      
      mockSheet.getRows.mockResolvedValue([freshRow]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, cycleStart);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Row updated by another process, skipping: https://example.com'
      );
    });
    
    test('handles save errors', async () => {
      const freshRow = {
        assign: jest.fn(),
        save: jest.fn().mockRejectedValue(new Error('Save failed'))
      };
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://example.com';
        return null;
      });
      
      mockSheet.getRows.mockResolvedValue([freshRow]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        'ERROR saving row for https://example.com: Save failed'
      );
    });
    
    test('skips Added Date if already present', async () => {
      const freshRow = {
        assign: jest.fn(),
        save: jest.fn()
      };
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://example.com';
        if (field === 'Added Date') return '2023-01-01';
        return null;
      });
      
      mockSheet.getRows.mockResolvedValue([freshRow]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Offline', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(freshRow.assign).toHaveBeenCalledWith({
        'Status': 'Offline',
        'Last Checked (PST)': '2023-01-01T00:00:00.000Z'
      });
      expect(freshRow.assign).not.toHaveBeenCalledWith(
        expect.objectContaining({ 'Added Date': expect.any(String) })
      );
    });
    
    test('handles errors during batch update', async () => {
      mockSheet.getRows.mockRejectedValue(new Error('Sheet error'));
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Batch update error:',
        'Sheet error'
      );
      expect(pendingUpdates.size).toBe(0);
    });
    
    test('logs summary with no updates', async () => {
      const freshRow = {};
      
      mockSheetHelpers.getField.mockImplementation((row, field) => {
        if (field === 'Link') return 'https://example.com';
        if (field === 'Last Checked (PST)') return new Date(2000).toISOString();
        return null;
      });
      
      mockSheet.getRows.mockResolvedValue([freshRow]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Batch update complete: 0 rows updated, 1 skipped'
      );
    });
    
    test('logs no rows to update when all skipped', async () => {
      mockSheet.getRows.mockResolvedValue([]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      pendingUpdates.set('https://example2.com', { 
        row: {}, 
        status: 'Live', 
        index: 1 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Batch update complete: 0 rows updated, 2 skipped'
      );
    });
    
    test('debug logging', async () => {
      mockSheet.getRows.mockResolvedValue([]);
      pendingUpdates.set('https://example.com', { 
        row: {}, 
        status: 'Live', 
        index: 0 
      });
      
      await batchUpdater.batchUpdateRows(mockSheet, pendingUpdates, 1000);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Sheet column headers: ${JSON.stringify(mockSheet.headerValues)}`
      );
    });
  });
});