import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services', '<rootDir>/shared'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@movemate/shared$': '<rootDir>/shared/src/index.ts',
    '^@movemate/shared/adapters$': '<rootDir>/shared/src/adapters/index.ts',
  },
  collectCoverageFrom: [
    'services/**/src/**/*.ts',
    'shared/src/**/*.ts',
    '!**/__tests__/**',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testTimeout: 30000,
};

export default config;
