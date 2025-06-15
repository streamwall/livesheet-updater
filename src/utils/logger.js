/**
 * @fileoverview Logging utility functions with timestamp formatting and debug support
 * @module utils/logger
 */

// Logging utilities

export const createLogger = (deps) => {
  const { console, process, Date } = deps;
  
  const log = (...args) => console.log(new Date().toISOString(), ...args);
  
  const debug = (...args) => {
    if (process.env.DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args);
  };
  
  return { log, debug };
};