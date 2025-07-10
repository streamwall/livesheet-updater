/**
 * Get priority score for a stream
 * @param {Object} stream - Stream object
 * @param {number} now - Current timestamp
 * @returns {number} Priority score (higher is more important)
 */
export function getStreamPriority(stream, now = Date.now()) {
  // Never checked - highest priority
  if (!stream.last_checked_at) return 3;
  
  // Currently live - high priority
  if (stream.status?.toLowerCase() === 'live') return 2;
  
  // Recently live (within 20 minutes) - medium priority
  const lastLive = stream.last_live_at;
  if (lastLive && now - new Date(lastLive).getTime() <= 20 * 60 * 1000) return 1;
  
  // Everything else - low priority
  return 0;
}

/**
 * Sort streams by priority (highest first)
 * @param {Array<Object>} streams - Array of stream objects
 * @returns {Array<Object>} Sorted array of streams
 */
export function prioritizeStreams(streams) {
  const now = Date.now();
  return [...streams].sort((a, b) => {
    return getStreamPriority(b, now) - getStreamPriority(a, now);
  });
}