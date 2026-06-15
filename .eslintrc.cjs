// ESLint config — TypeScript + React + hooks rules, Prettier last to disable style conflicts.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: 'detect' } },
  env: { es2022: true, node: true },
  rules: {
    'react/react-in-jsx-scope': 'off', // not needed with the new JSX transform
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', 'babel.config.js', 'metro.config.js', 'metro-empty-module.js', 'content-pipeline/'],
};
