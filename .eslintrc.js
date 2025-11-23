module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
    webextensions: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  globals: {
    // Browser extension globals
    browser: 'readonly',
    chrome: 'readonly',
    
    // Test globals
    describe: 'readonly',
    test: 'readonly',
    it: 'readonly',
    expect: 'readonly',
    jest: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly',
    
    // Test utilities
    testUtils: 'readonly',
    
    // Third-party libraries
    Readability: 'readonly'
  },
  rules: {
    // Possible Errors
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    
    // Best Practices
    'curly': 'error',
    'eqeqeq': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
    
    // Variables
    'no-use-before-define': 'error',
    
    // Stylistic Issues
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'brace-style': ['error', '1tbs'],
    'camelcase': 'error',
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    
    // ES6
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-spacing': 'error',
    'no-var': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};
