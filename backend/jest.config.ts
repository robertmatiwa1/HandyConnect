import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['<rootDir>/test/setup-prisma-client.ts'],
  globals: {
    'ts-jest': {
      diagnostics: false,
    },
  },
  collectCoverageFrom: ['src/**/*.{ts,js}'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
