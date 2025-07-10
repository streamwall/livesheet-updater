import StreamSourceClient from './streamSourceClient.js';

// 🗞 Config
const RATE_LIVE = parseInt(process.env.RATE_LIVE || '120000'); // 2 minutes default
const RATE_OFF = parseInt(process.env.RATE_OFF || '420000'); // 7 minutes default
const LOOP_DELAY_MIN = 10000;
const LOOP_DELAY_MAX = 20000;

// StreamSource Config
const STREAMSOURCE_API_URL = process.env.STREAMSOURCE_API_URL || 'https://api.streamsource.com';
const STREAMSOURCE_EMAIL = process.env.STREAMSOURCE_EMAIL;
const STREAMSOURCE_PASSWORD = process.env.STREAMSOURCE_PASSWORD;

// Archiving Config (optional)
const ARCHIVE_ENABLED = process.env.ARCHIVE_ENABLED === 'true';
const ARCHIVE_THRESHOLD_MINUTES = parseInt(process.env.ARCHIVE_THRESHOLD_MINUTES || '30');
const ARCHIVE_CHECK_INTERVAL = parseInt(process.env.ARCHIVE_CHECK_INTERVAL || '300000'); // 5 minutes

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const delay = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => delay(min + Math.random() * (max - min));
const log = (...args) => console.log(new Date().toISOString(), ...args);
const debug = (...args) => {
  if (process.env.DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args);
};

// Initialize StreamSource client
if (!STREAMSOURCE_EMAIL || !STREAMSOURCE_PASSWORD) {
  throw new Error('StreamSource credentials required: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD');
}

const streamSourceClient = new StreamSourceClient({
  apiUrl: STREAMSOURCE_API_URL,
  email: STREAMSOURCE_EMAIL,
  password: STREAMSOURCE_PASSWORD
}, { log, error: log });

// Authenticate on startup
await streamSourceClient.authenticate();
log('Connected to StreamSource API');

let lastArchiveCheck = 0;

async function checkStreamStatus(stream) {
  const url = stream.link;
  if (!url) {
    log(`Stream ${stream.id} has no URL, skipping`);
    return null;
  }

  // Clean and validate URL
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/[^\x20-\x7E]/g, '');
  cleanUrl = cleanUrl.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');

  // Validate URL patterns
  const patterns = {
    tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
    youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
    youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
    youtubeShort: /^https:\/\/youtu\.be\/.+/,
    twitch: /^https:\/\/(www\.)?twitch\.tv\/.+/
  };

  const isValidLiveUrl = cleanUrl && Object.values(patterns).some(p => p.test(cleanUrl));
  
  if (!isValidLiveUrl) {
    log(`Stream ${stream.id} has invalid URL: ${cleanUrl}`);
    return null;
  }

  // Check rate limiting
  const now = Date.now();
  const lastChecked = stream.last_checked_at ? new Date(stream.last_checked_at).getTime() : 0;
  const currentStatus = stream.status?.toLowerCase() || 'offline';
  const threshold = currentStatus === 'live' ? RATE_LIVE : RATE_OFF;

  if (now - lastChecked < threshold) {
    debug(`Stream ${stream.id} checked recently (${Math.round((now - lastChecked) / 1000)}s ago), skipping`);
    return null;
  }

  const baseUrl = cleanUrl.split('?')[0];
  const platform = stream.platform || 'Unknown';
  
  log(`[${stream.id}] Checking ${platform}: ${cleanUrl}`);
  
  try {
    // For YouTube, always use the full URL with parameters
    const fetchUrl = platform === 'YouTube' ? cleanUrl : baseUrl;
    debug(`[${stream.id}] Fetching: "${fetchUrl}"`);
    
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow'
    });

    if (response.status !== 200) {
      log(`[${stream.id}] HTTP ${response.status} for ${cleanUrl}`);
      return null;
    }

    const html = await response.text();
    
    // Check for WAF/challenge pages
    if (html.includes('_wafchallengeid') || html.includes('Please wait...') || html.includes('/waf-aiso/')) {
      log(`[${stream.id}] WARNING: Received challenge/WAF page, skipping`);
      return null;
    }
    
    let status = 'offline';
    
    if (platform === 'TikTok') {
      if (html.includes('"isLiveBroadcast":true')) {
        debug(`[${stream.id}] Found TikTok isLiveBroadcast:true`);
        status = 'live';
      }
    } else if (platform === 'Twitch') {
      if (html.includes('"isLiveBroadcast":true')) {
        debug(`[${stream.id}] Found Twitch isLiveBroadcast:true`);
        status = 'live';
      } else if (html.includes('tw-channel-status-text-indicator') || 
                 html.includes('"stream":{') ||
                 html.includes('viewers</p>') ||
                 html.includes('data-a-target="tw-indicator"')) {
        debug(`[${stream.id}] Found other Twitch live indicators`);
        status = 'live';
      }
    } else if (platform === 'YouTube') {
      if (html.includes('"isLiveBroadcast":"True"') && !html.includes('"endDate":"')) {
        debug(`[${stream.id}] Detected LIVE - isLiveBroadcast:True without endDate`);
        status = 'live';
      } else if (html.includes('"isLiveBroadcast" content="True"') && !html.includes('"endDate"')) {
        debug(`[${stream.id}] Detected LIVE - isLiveBroadcast content="True" without endDate`);
        status = 'live';
      } else if (html.includes('"liveBroadcastDetails"') && html.includes('"isLiveNow":true')) {
        debug(`[${stream.id}] Detected LIVE - liveBroadcastDetails with isLiveNow`);
        status = 'live';
      } else if (html.includes('\\\"isLive\\\":true') || html.includes('"isLive":true')) {
        debug(`[${stream.id}] Detected LIVE - isLive:true`);
        status = 'live';
      } else if (html.includes('"videoDetails":') && html.includes('"isLiveContent":true') && html.includes('"isLive":true')) {
        debug(`[${stream.id}] Detected LIVE - videoDetails with isLiveContent and isLive`);
        status = 'live';
      }
    }
    
    log(`[${stream.id}] Status: ${status.toUpperCase()} for ${platform} ${cleanUrl}`);
    
    return { streamId: stream.id, status, platform };
    
  } catch (e) {
    log(`[${stream.id}] Request error:`, e.message);
    return null;
  }
}

async function updateStreamStatus(streamId, status) {
  try {
    await streamSourceClient.updateStreamStatus(streamId, status);
    debug(`Updated stream ${streamId} status to ${status}`);
  } catch (error) {
    log(`Failed to update stream ${streamId}:`, error.message);
  }
}

async function archiveExpiredStreams() {
  if (!ARCHIVE_ENABLED) return;
  
  try {
    log(`Checking for expired streams to archive (threshold: ${ARCHIVE_THRESHOLD_MINUTES} minutes)`);
    
    const expiredStreams = await streamSourceClient.getExpiredOfflineStreams(ARCHIVE_THRESHOLD_MINUTES);
    
    if (expiredStreams.length === 0) {
      log('No expired streams found to archive');
      return;
    }
    
    log(`Found ${expiredStreams.length} expired streams to archive`);
    
    let archivedCount = 0;
    let errorCount = 0;
    
    for (const stream of expiredStreams) {
      try {
        const currentTime = new Date();
        const lastLiveTime = stream.last_live_at ? new Date(stream.last_live_at) : new Date(stream.updated_at);
        const diffMinutes = (currentTime - lastLiveTime) / 60000;
        
        if ((stream.status !== 'offline' && stream.status !== 'unknown') || diffMinutes < ARCHIVE_THRESHOLD_MINUTES) {
          log(`Stream ${stream.id} state changed, skipping archive`);
          continue;
        }
        
        await streamSourceClient.archiveStream(stream.id);
        archivedCount++;
        log(`Archived stream ${stream.id}: ${stream.link} (offline for ${diffMinutes.toFixed(1)} min)`);
        
        await delay(100);
      } catch (error) {
        errorCount++;
        log(`Failed to archive stream ${stream.id}: ${error.message}`);
      }
    }
    
    log(`Archive complete: ${archivedCount} archived, ${errorCount} errors`);
  } catch (error) {
    log('Error during archive process:', error.message);
  }
}

async function main() {
  log(`StreamSource Live Checker started`);
  log(`Check rates - Live: ${RATE_LIVE/1000}s, Offline: ${RATE_OFF/1000}s`);

  while (true) {
    try {
      // Fetch active (non-archived) streams from StreamSource
      log('Fetching streams from StreamSource...');
      let allStreams = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await streamSourceClient.getStreams({
          page,
          per_page: 100,
          is_archived: false
        });

        allStreams = allStreams.concat(response.streams);
        hasMore = page < response.meta.total_pages;
        page++;
      }

      log(`Fetched ${allStreams.length} active streams`);

      // Sort streams by priority
      const now = Date.now();
      const prioritizedStreams = allStreams.sort((a, b) => {
        const getPriority = stream => {
          if (!stream.last_checked_at) return 3; // Never checked
          if (stream.status?.toLowerCase() === 'live') return 2; // Currently live
          const lastLive = stream.last_live_at;
          if (lastLive && now - new Date(lastLive).getTime() <= 20 * 60 * 1000) return 1; // Recently live
          return 0;
        };
        return getPriority(b) - getPriority(a);
      });

      // Check each stream
      const updates = [];
      for (const stream of prioritizedStreams) {
        const result = await checkStreamStatus(stream);
        if (result) {
          updates.push(result);
        }
      }

      // Update all statuses
      log(`Updating ${updates.length} stream statuses...`);
      for (const update of updates) {
        await updateStreamStatus(update.streamId, update.status);
      }

      // Check if we should run the archive process
      if (ARCHIVE_ENABLED && Date.now() - lastArchiveCheck >= ARCHIVE_CHECK_INTERVAL) {
        await archiveExpiredStreams();
        lastArchiveCheck = Date.now();
      }

      const sleepTime = LOOP_DELAY_MIN + Math.random() * (LOOP_DELAY_MAX - LOOP_DELAY_MIN);
      log(`Cycle complete — sleeping ${(sleepTime / 1000).toFixed(0)}s`);
      await delay(sleepTime);
      
    } catch (e) {
      log('Main loop error:', e.message);
      if (e.message.includes('401') || e.message.includes('Unauthorized')) {
        log('Re-authenticating...');
        try {
          await streamSourceClient.authenticate();
        } catch (authError) {
          log('Re-authentication failed:', authError.message);
        }
      }
      await delay(30000); // Wait 30s on error
    }
  }
}

main();