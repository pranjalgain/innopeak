import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  transformIgnorePatterns: ['node_modules/(?!(@redis|cache-manager-redis-yet)/)'],
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@middlewares/(.*)$': '<rootDir>/src/middlewares/$1',
    '^@interceptors/(.*)$': '<rootDir>/src/interceptors/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@logger/(.*)$': '<rootDir>/src/logger/$1',
    '^@db/(.*)$': '<rootDir>/src/db/$1',
    '^@redis\/(?!client|bloom|search|json|graph|time-series)(.*)$': '<rootDir>/src/redis/$1',
    '^@otel/(.*)$': '<rootDir>/src/otel/$1',
    '^@bg/(.*)$': '<rootDir>/src/background/$1',
    '^@cron/(.*)$': '<rootDir>/src/background/cron/$1',
    '^@email-queue/(.*)$': '<rootDir>/src/background/queue/email/$1',
    '^@dead-letter-queue/(.*)$': '<rootDir>/src/background/queue/dead-letter/$1',
    '^@notification-queue/(.*)$': '<rootDir>/src/background/queue/notification/$1',
    '^@metrics/(.*)$': '<rootDir>/src/api/metrics/$1',
    '^@health/(.*)$': '<rootDir>/src/api/health/$1',
  },
};

export default config;
