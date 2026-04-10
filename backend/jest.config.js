/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/scheduling/**/*.test.js',
    '**/tests/rate-limit/**/*.test.js',
    '**/tests/api-v1-alias.test.js',
    '**/tests/auth/**/*.test.js',
    '**/tests/sales/**/*.test.js',
  ],
  testTimeout: 120000
};
