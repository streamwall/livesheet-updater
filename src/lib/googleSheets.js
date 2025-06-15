/**
 * @fileoverview Google Sheets initialization and setup
 * @module lib/googleSheets
 */

import { 
  SHEET_ID, 
  SHEET_NAME, 
  KNOWN_STREAMERS_SHEET_NAME,
  ERROR_MESSAGES,
  GOOGLE_SHEETS_SCOPE,
  CREDS_FILE_PATH,
  DEFAULT_ROW_LIMIT
} from '../config/constants.js';

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
      const credsData = await fs.readFile(CREDS_FILE_PATH, 'utf8');
      CREDS = JSON.parse(credsData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(ERROR_MESSAGES.MISSING_CREDS);
      }
      if (error instanceof SyntaxError) {
        throw new Error(ERROR_MESSAGES.INVALID_CREDS);
      }
      throw new Error(ERROR_MESSAGES.CREDS_LOAD_FAILED(error.message));
    }
    const auth = new GoogleAuth({
      credentials: CREDS,
      scopes: [GOOGLE_SHEETS_SCOPE]
    });
    const client = await auth.getClient();
    const doc = new GoogleSpreadsheet(SHEET_ID, client);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) throw new Error(ERROR_MESSAGES.SHEET_NOT_FOUND(SHEET_NAME));
    await sheet.getRows({ limit: DEFAULT_ROW_LIMIT });
    log(`Loaded sheet "${sheet.title}", headers:`, JSON.stringify(sheet.headerValues));

    const knownStreamersSheet = doc.sheetsByTitle[KNOWN_STREAMERS_SHEET_NAME];
    if (!knownStreamersSheet) {
      log(ERROR_MESSAGES.KNOWN_STREAMERS_WARNING(KNOWN_STREAMERS_SHEET_NAME));
    } else {
      await knownStreamersSheet.getRows({ limit: DEFAULT_ROW_LIMIT });
      log(`Loaded sheet "${knownStreamersSheet.title}", headers:`, JSON.stringify(knownStreamersSheet.headerValues));
    }
    
    return { sheet, knownStreamersSheet };
  }
  
  return { initialize };
};