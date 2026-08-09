module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // shadcn-style files export both a component and a CVA variant — suppress
      // the react-refresh warning since these are not page-level fast-reload files.
      files: ['src/components/ui/**/*.tsx', 'src/lib/**/*.ts'],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/'],
};
