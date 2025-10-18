/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: '@ton/sandbox/jest-environment',
  testTimeout: 20000,
  transform: {
    '^.+\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        esModuleInterop: true,
        resolveJsonModule: true,
        skipLibCheck: true,
      },
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '**/tests/**/*.spec.ts',
    '**/tests/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/frontend/',
    '/services/',
    '/backend/',
  ],
  collectCoverageFrom: [
    'wrappers/**/*.ts',
    'contracts/**/*.fc',
    '!**/node_modules/**', 
    '!**/dist/**', 
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '.compile.ts$',
  ],
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
  maxWorkers: 1,
  cache: false,
};