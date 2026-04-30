import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/tests/**/*.test.js',
  workspaceFolder: '.vscode-test/workspace',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
  },
});
