export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    '*.js',
    'lib/**/*.js',
    '!jest.config.js',
    '!test-*.js',
    '!*.test.js',
    '!**/*.test.js',
    '!coverage/**',
    '!scripts/**'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ]
};