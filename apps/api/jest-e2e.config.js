/** إعداد jest لاختبارات التكامل (تشغيل تسلسلي على قاعدة اختبار واحدة). */
module.exports = {
  preset: 'ts-jest',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  moduleNameMapper: {
    '^@/common/(.*)$': '<rootDir>/src/common/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@/database/(.*)$': '<rootDir>/src/database/$1',
  },
  setupFiles: ['<rootDir>/test/e2e/test-env.ts'],
  maxWorkers: 1,
  testTimeout: 180000,
  forceExit: true,
};
