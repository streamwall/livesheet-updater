/**
 * @fileoverview Batch update service for efficiently writing multiple row changes to Google Sheets
 * @module services/batchUpdater
 */

import { COLUMN_NAMES, STATUS_LIVE } from '../config/constants.js';

export const createBatchUpdater = (deps, logger, sheetHelpers) => {
  const { Date } = deps;
  const { log, debug } = logger;
  const { getField, setField } = sheetHelpers;
  
  // Batch update all pending row changes
  async function batchUpdateRows(sheet, pendingUpdates, cycleStartTime) {
    if (pendingUpdates.size === 0) {
      log('No updates to process');
      return;
    }
    
    log(`Starting batch update for ${pendingUpdates.size} rows...`);
    
    try {
      // Get fresh rows to avoid overwriting concurrent changes
      const freshRows = await sheet.getRows();
      const rowsByUrl = new Map();
      
      for (const row of freshRows) {
        const url = getField(row, COLUMN_NAMES.LINK, sheet);
        if (url) {
          rowsByUrl.set(url, row);
        }
      }
      
      debug(`Sheet column headers: ${JSON.stringify(sheet.headerValues)}`);
      
      let updateCount = 0;
      let skipCount = 0;
      
      for (const [url, update] of pendingUpdates) {
        const freshRow = rowsByUrl.get(url);
        
        if (!freshRow) {
          log(`Row deleted by user, skipping: ${url}`);
          skipCount++;
          continue;
        }
        
        // Check if row was modified by another process after our check started
        const lastChecked = getField(freshRow, COLUMN_NAMES.LAST_CHECKED, sheet);
        if (lastChecked && new Date(lastChecked).getTime() > cycleStartTime) {
          log(`Row updated by another process, skipping: ${url}`);
          skipCount++;
          continue;
        }
        
        try {
          const now = new Date().toISOString();
          const updates = {
            [COLUMN_NAMES.STATUS]: update.status,
            [COLUMN_NAMES.LAST_CHECKED]: now
          };
          
          // Update Last Live timestamp if status is Live
          if (update.status === STATUS_LIVE) {
            updates[COLUMN_NAMES.LAST_LIVE] = now;
          }
          
          // Set Added Date if not present
          if (!getField(freshRow, COLUMN_NAMES.ADDED_DATE, sheet)) {
            updates[COLUMN_NAMES.ADDED_DATE] = now;
          }
          
          freshRow.assign(updates);
          await freshRow.save();
          updateCount++;
          
        } catch (e) {
          log(`ERROR saving row for ${url}: ${e.message}`);
        }
      }
      
      log(`Batch update complete: ${updateCount} rows updated, ${skipCount} skipped`);
      
    } catch (e) {
      log('Batch update error:', e.message);
    } finally {
      // Clear pending updates regardless of success/failure
      pendingUpdates.clear();
    }
  }
  
  return { batchUpdateRows };
};