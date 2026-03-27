import * as esbuild from 'esbuild';
import tailwindPlugin from 'esbuild-plugin-tailwindcss';
import svgr from 'esbuild-plugin-svgr';
import fs from 'fs/promises';
import path from 'path';

const clientRootPath = process.cwd();

function resolveClientPath(relativePath) {
  return path.resolve(clientRootPath, relativePath);
}

// Copy static assets
try {
  await fs.cp(resolveClientPath('./static'), resolveClientPath('./build'), {
    recursive: true,
  });
  console.log('Copied static assets.');
} catch (error) {
  console.error('Failed to copy static assets:', error);
}

// Common esbuild options
const commonOptions = {
  absWorkingDir: clientRootPath,
  plugins: [
    tailwindPlugin({
      configPath: resolveClientPath('./tailwind.config.cjs'),
    }),
    svgr(),
  ],
  bundle: true,
  minify: false,
  sourcemap: true,
  target: 'es2023',
  logLevel: 'info',
  loader: {
    '.md': 'text',
  },
};

// Main Chat app config
const mainConfig = {
  ...commonOptions,
  entryPoints: [resolveClientPath('./src/app/main.tsx')],
  outdir: resolveClientPath('./build'),
};

const mainCtx = await esbuild.context(mainConfig);
await mainCtx.watch();

console.log('Watching main entry point...');

const PORT = 9000;
const HOST = 'localhost';

const { host = HOST, port = PORT } = await mainCtx.serve({
  servedir: resolveClientPath('./build'),
  port: PORT,
  fallback: resolveClientPath('./build/index.html'), // SPA fallback for client-side routing
});

console.log(`esbuild dev server is running at http://${host}:${port}`);
