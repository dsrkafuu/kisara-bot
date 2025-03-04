import config from '@dsrca/config/eslint/eslint.config.js';

/**
 * @type {import('eslint').ESLint.ConfigData}
 */
export default [
  ...config,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['node_modules/**/*'],
  },
];
