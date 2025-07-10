// Configuration management

export const config = {
  // Rate limits
  RATE_LIVE: parseInt(process.env.RATE_LIVE || '120000'), // 2 minutes default
  RATE_OFF: parseInt(process.env.RATE_OFF || '420000'), // 7 minutes default
  
  // Loop timing
  LOOP_DELAY_MIN: 10000,
  LOOP_DELAY_MAX: 20000,
  
  // StreamSource API
  STREAMSOURCE_API_URL: process.env.STREAMSOURCE_API_URL || 'https://api.streamsource.com',
  STREAMSOURCE_EMAIL: process.env.STREAMSOURCE_EMAIL,
  STREAMSOURCE_PASSWORD: process.env.STREAMSOURCE_PASSWORD,
  
  // Archiving
  ARCHIVE_ENABLED: process.env.ARCHIVE_ENABLED === 'true',
  ARCHIVE_THRESHOLD_MINUTES: parseInt(process.env.ARCHIVE_THRESHOLD_MINUTES || '30'),
  ARCHIVE_CHECK_INTERVAL: parseInt(process.env.ARCHIVE_CHECK_INTERVAL || '300000'), // 5 minutes
  
  // Debug
  DEBUG: process.env.DEBUG === 'true'
};

/**
 * Validate required configuration
 * @throws {Error} If required config is missing
 */
export function validateConfig() {
  if (!config.STREAMSOURCE_EMAIL || !config.STREAMSOURCE_PASSWORD) {
    throw new Error('StreamSource credentials required: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD');
  }
}