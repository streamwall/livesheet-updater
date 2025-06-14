/**
 * @fileoverview Google Sheets initialization and setup
 * @module lib/googleSheets
 */

import { SHEET_ID, SHEET_NAME, KNOWN_STREAMERS_SHEET_NAME } from '../config/constants.js';

export const createGoogleSheets = (deps, logger) => {
  const { fs, GoogleAuth, GoogleSpreadsheet } = deps;
  const { log } = logger;
  
  /**
   * Initialize Google Sheets connection and load required sheets
   * @returns {Promise<{sheet: Object, knownStreamersSheet: Object|null}>}
   * @throws {Error} If credentials file is missing or invalid
   */
  async function initialize() {
    // Load credentials with error handling
    let CREDS;
    try {
      const credsData = await fs.readFile('./creds.json', 'utf8');
      CREDS = JSON.parse(credsData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Missing creds.json file. Please create one from creds.example.json');
      }
      if (error instanceof SyntaxError) {
        throw new Error('Invalid creds.json file. Please ensure it contains valid JSON');
      }
      throw new Error(`Failed to load credentials: ${error.message}`);
    }
    const auth = new GoogleAuth({
      credentials: CREDS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const client = await auth.getClient();
    const doc = new GoogleSpreadsheet(SHEET_ID, client);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
    await sheet.getRows({ limit: 1 });
    log(`Loaded sheet "${sheet.title}", headers:`, JSON.stringify(sheet.headerValues));

    const knownStreamersSheet = doc.sheetsByTitle[KNOWN_STREAMERS_SHEET_NAME];
    if (!knownStreamersSheet) {
      log(`Warning: Sheet "${KNOWN_STREAMERS_SHEET_NAME}" not found. Known streamers feature disabled.`);
    } else {
      await knownStreamersSheet.getRows({ limit: 1 });
      log(`Loaded sheet "${knownStreamersSheet.title}", headers:`, JSON.stringify(knownStreamersSheet.headerValues));
    }
    
    return { sheet, knownStreamersSheet };
  }
  
  return { initialize };
};