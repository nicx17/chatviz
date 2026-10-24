import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // ── Ignore build output ────────────────────────────────────────────
  { ignores: ['dist/**', 'node_modules/**'] },

  // ── Base: ESLint recommended + strict custom rules ─────────────────
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // ── Start from ESLint recommended ──
      ...js.configs.recommended.rules,

      // ── React hooks (critical for correctness) ──
      ...reactHooks.configs.recommended.rules,

      // ── Strict error-level rules ──

      // Possible problems
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-promise-executor-return': 'error',
      'no-constructor-return': 'error',
      'no-new-native-nonconstructor': 'error',

      // Suggestions (code quality)
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-arrow-callback': 'error',
      'prefer-template': 'warn',
      'no-else-return': ['warn', { allowElseIf: false }],
      'no-lonely-if': 'warn',
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'error',
      'no-useless-return': 'error',
      'no-useless-rename': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'warn',
      'object-shorthand': ['warn', 'always'],
      'prefer-destructuring': ['warn', { object: true, array: false }],
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-return-assign': ['error', 'always'],
      'no-throw-literal': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-extend-native': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-multi-assign': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-proto': 'error',
      'no-sequences': 'error',
      'no-shadow': ['warn', { hoist: 'all' }],
      'no-void': 'error',
      'radix': 'error',
      'symbol-description': 'warn',
      'yoda': 'error',
      'curly': ['error', 'multi-line', 'consistent'],
      'grouped-accessor-pairs': ['warn', 'getBeforeSet'],
      'default-case-last': 'error',
      'no-array-constructor': 'error',
      'no-object-constructor': 'error',

      // Naming & consistency
      'camelcase': ['warn', { properties: 'never', ignoreDestructuring: true }],
      'new-cap': ['error', { newIsCap: true, capIsNew: false }],
    },
  },

  // ── Worker files need worker globals instead of browser ────────────
  {
    files: ['src/workers/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
    rules: {
      'no-restricted-globals': 'off',
    },
  },
];
