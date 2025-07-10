// StreamSource API Client for livesheet-updater
class StreamSourceClient {
  constructor(config, logger) {
    this.apiUrl = config.apiUrl || 'https://api.streamsource.com';
    this.email = config.email;
    this.password = config.password;
    this.token = null;
    this.tokenExpiry = null;
    this.logger = logger || console;
    
    // Rate limiting
    this.rateLimitDelay = 100; // ms between requests
    this.lastRequestTime = 0;
    
    // URL to Stream ID cache
    this.urlToStreamIdCache = new Map();
    this.cacheExpiryTime = 60 * 60 * 1000; // 1 hour cache
  }

  async authenticate() {
    try {
      this.logger.log('Authenticating with StreamSource API...');
      
      const response = await this.request('/api/v1/users/login', {
        method: 'POST',
        body: JSON.stringify({
          email: this.email,
          password: this.password
        }),
        skipAuth: true
      });

      this.token = response.token;
      // Set token expiry to 23 hours from now (JWT tokens expire in 24h)
      this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
      
      this.logger.log('Successfully authenticated with StreamSource');
      return true;
    } catch (error) {
      this.logger.error('Failed to authenticate with StreamSource:', error.message);
      throw error;
    }
  }

  async ensureAuthenticated() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  async request(endpoint, options = {}) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await this.delay(this.rateLimitDelay - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add auth token unless explicitly skipped
    if (!options.skipAuth) {
      await this.ensureAuthenticated();
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        ...options,
        headers
      });

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { error: responseText };
      }

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          this.rateLimitDelay *= 2; // Exponential backoff
          this.logger.log(`Rate limited, increasing delay to ${this.rateLimitDelay}ms`);
        }
        
        // Handle auth errors by re-authenticating
        if (response.status === 401 && !options.skipAuth) {
          this.logger.log('Token expired, re-authenticating...');
          this.token = null;
          await this.authenticate();
          // Retry the request once
          return this.request(endpoint, options);
        }

        throw new Error(responseData.error || `HTTP ${response.status}`);
      }

      // Reset rate limit delay on successful request
      this.rateLimitDelay = 100;

      return responseData;
    } catch (error) {
      this.logger.error(`StreamSource API request failed: ${error.message}`);
      throw error;
    }
  }

  async getStreams(params = {}) {
    const queryParams = new URLSearchParams(params);
    return await this.request(`/api/v1/streams?${queryParams}`);
  }

  async updateStream(streamId, updates) {
    // Update stream properties
    return await this.request(`/api/v1/streams/${streamId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  async archiveStream(streamId) {
    // Archive a stream by setting is_archived to true
    return await this.updateStream(streamId, { is_archived: true });
  }

  async updateStreamStatus(streamId, status, lastCheckedAt = new Date().toISOString()) {
    const updates = {
      status: status.toLowerCase(),
      last_checked_at: lastCheckedAt
    };

    // If stream is going live, update last_live_at
    if (status.toLowerCase() === 'live') {
      updates.last_live_at = lastCheckedAt;
    }

    return await this.updateStream(streamId, updates);
  }

  async findStreamByUrl(url) {
    try {
      // Check cache first
      const cachedEntry = this.urlToStreamIdCache.get(url);
      if (cachedEntry && Date.now() - cachedEntry.timestamp < this.cacheExpiryTime) {
        return cachedEntry.stream;
      }

      // Search for stream by link
      const response = await this.getStreams({
        link: url,
        per_page: 1
      });

      if (response.streams && response.streams.length > 0) {
        const stream = response.streams[0];
        // Cache the result
        this.urlToStreamIdCache.set(url, {
          stream,
          timestamp: Date.now()
        });
        return stream;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to find stream by URL ${url}:`, error.message);
      return null;
    }
  }

  async createStream(streamData) {
    return await this.request('/api/v1/streams', {
      method: 'POST',
      body: JSON.stringify(streamData)
    });
  }

  async getExpiredOfflineStreams(thresholdMinutes = 15) {
    try {
      const allStreams = [];
      let page = 1;
      let hasMore = true;

      // Fetch all non-archived streams
      while (hasMore) {
        const response = await this.getStreams({
          page,
          per_page: 100,
          is_archived: false
        });

        allStreams.push(...response.streams);
        hasMore = page < response.meta.total_pages;
        page++;
      }

      // Filter for offline streams that are expired
      const now = new Date();
      const thresholdMs = thresholdMinutes * 60 * 1000;
      
      return allStreams.filter(stream => {
        // Only archive offline and unknown status streams
        if (stream.status !== 'offline' && stream.status !== 'unknown') return false;
        
        // Check if last_live_at timestamp is old enough
        if (stream.last_live_at) {
          const lastLive = new Date(stream.last_live_at);
          return (now - lastLive) > thresholdMs;
        }
        
        // If no last_live_at timestamp, check updated_at
        const updatedAt = new Date(stream.updated_at);
        return (now - updatedAt) > thresholdMs;
      });
    } catch (error) {
      this.logger.error('Failed to get expired offline streams:', error.message);
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default StreamSourceClient;