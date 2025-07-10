// Shared utility functions

export const delay = ms => new Promise(r => setTimeout(r, ms));

export const rand = (min, max) => delay(min + Math.random() * (max - min));

export const log = (...args) => console.log(new Date().toISOString(), ...args);

export const debug = (...args) => {
  if (process.env.DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args);
};

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};