import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const commonConfig = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
};

const extensionConfig = {
  ...commonConfig,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
};

const sidebarConfig = {
  ...commonConfig,
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview/sidebar.js',
  platform: 'browser',
  format: 'iife',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
};

async function build() {
  try {
    if (isWatch) {
      const [extensionCtx, sidebarCtx] = await Promise.all([
        esbuild.context(extensionConfig),
        esbuild.context(sidebarConfig),
      ]);

      await Promise.all([
        extensionCtx.watch(),
        sidebarCtx.watch(),
      ]);

      console.log('Watching for changes...');
    } else {
      await Promise.all([
        esbuild.build(extensionConfig),
        esbuild.build(sidebarConfig),
      ]);

      console.log('Build complete!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
