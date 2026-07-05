// Jest config — two projects so pure logic and RN components test under the right environment:
//  - "logic":      *.test.ts  via ts-jest in node (fast, dependency-light: renderFor, cardWiring).
//  - "components": *.test.tsx via jest-expo (RN renderer) for snapshot/behavior tests of cards.
// CI runs `jest`, which runs both projects.
// supabase/functions/ contains Deno code — excluded so jest never tries to parse it.
const mapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '/supabase/functions/'],
  projects: [
    {
      displayName: 'logic',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/supabase/functions/'],
      moduleNameMapper: mapper,
      setupFiles: ['<rootDir>/jest.setup.logic.js'],
    },
    {
      displayName: 'components',
      preset: 'jest-expo',
      testMatch: ['**/*.test.tsx'],
      testPathIgnorePatterns: ['/node_modules/', '/supabase/functions/'],
      moduleNameMapper: mapper,
      setupFiles: ['<rootDir>/jest.setup.components.js'],
    },
  ],
};
