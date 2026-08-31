import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  transformIgnorePatterns: ['node_modules/(?!(@redis|cache-manager-redis-store)/)'],
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@middlewares/(.*)$': '<rootDir>/middlewares/$1',
    '^@interceptors/(.*)$': '<rootDir>/interceptors/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@logger/(.*)$': '<rootDir>/logger/$1',
    '^@db/(.*)$': '<rootDir>/db/$1',
    '^@redis\/(?!client|bloom|search|json|graph|time-series)(.*)$': '<rootDir>/redis/$1',
    '^@otel/(.*)$': '<rootDir>/otel/$1',
    '^@bg/(.*)$': '<rootDir>/background/$1',
    '^@cron/(.*)$': '<rootDir>/background/cron/$1',
    '^@email-queue/(.*)$': '<rootDir>/background/queue/email/$1',
    '^@dead-letter-queue/(.*)$': '<rootDir>/../src/background/queue/dead-letter/$1',
    '^@notification-queue/(.*)$': '<rootDir>/background/queue/notification/$1',
    '^@metrics/(.*)$': '<rootDir>/api/metrics/$1',
    '^@health/(.*)$': '<rootDir>/api/health/$1',
    '^@users/(.*)$': '<rootDir>/users/$1',
    '^@auth/(.*)$': '<rootDir>/auth/$1',
    '^@ai/(.*)$': '<rootDir>/ai/$1',
    '^@notifications/(.*)$': '<rootDir>/notifications/$1',
    '^@email/(.*)$': '<rootDir>/email/$1',
    '^@sms/(.*)$': '<rootDir>/sms/$1',
    '^@media/(.*)$': '<rootDir>/media/$1',
  },
};

export default config;
