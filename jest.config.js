// Jest config — two projects so pure logic and RN components test under the right environment:
//  - "logic":      *.test.ts  via ts-jest in node (fast, dependency-light: renderFor, cardWiring).
//  - "components": *.test.tsx via jest-expo (RN renderer) for snapshot/behavior tests of cards.
// CI runs `jest`, which runs both projects.
const mapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    {
      displayName: 'logic',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/*.test.ts'],
      moduleNameMapper: mapper,
    },
    {
      displayName: 'components',
      preset: 'jest-expo',
      testMatch: ['**/*.test.tsx'],
      moduleNameMapper: mapper,
      setupFiles: ['<rootDir>/jest.setup.components.js'],
    },
  ],
};
