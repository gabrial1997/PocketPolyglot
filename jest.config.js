// Jest config. Uses ts-jest for fast, dependency-light unit tests of pure logic
// (renderFor + types). The CI smoke test runs `jest`; renderFor.test.ts is the real coverage.
// jest-expo is installed for when RN component tests are added later.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
