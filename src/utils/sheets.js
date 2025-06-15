/**
 * @fileoverview Google Sheets field access helpers with case-insensitive column matching
 * @module utils/sheets
 */

// Sheet field helper utilities

// Helper functions to work with case-insensitive column names
export const createSheetHelpers = (logger) => {
  const { debug } = logger;
  
  const getField = (row, name, sheetObj) => {
    // Try exact match first
    if (row.get(name) !== undefined) {
      return row.get(name);
    }
    
    // Try case-insensitive match
    const actualColumnName = sheetObj.headerValues.find(h => h.toLowerCase() === name.toLowerCase());
    if (actualColumnName) {
      return row.get(actualColumnName);
    }
    
    // Debug if not found
    if (name.includes('Date')) {
      debug(`getField: Column '${name}' not found. Available columns: ${sheetObj.headerValues.join(', ')}`);
    }
    return undefined;
  };

  const setField = (row, name, val, sheetObj) => {
    // Try exact match first
    try {
      row.set(name, val);
      return;
    } catch (e) {
      // Continue to case-insensitive match
    }
    
    // Try case-insensitive match
    const actualColumnName = sheetObj.headerValues.find(h => h.toLowerCase() === name.toLowerCase());
    if (actualColumnName) {
      row.set(actualColumnName, val);
    } else {
      debug(`setField: Failed to set '${name}' = '${val}'. Column not found. Available: ${sheetObj.headerValues.join(', ')}`);
    }
  };
  
  return { getField, setField };
};