/**
 * @fileoverview Promise-based delay utility for async operations
 * @module utils/delay
 */

// Delay utility

export const createDelay = (setTimeout) => {
  return (ms) => new Promise(resolve => setTimeout(resolve, ms));
};