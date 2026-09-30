module.exports = {
  root: true,
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, es6: true },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', '.next/', 'coverage/'],
};
