import pkg from './package.json' with { type: "json" };

const deps = Object.keys(pkg.dependencies || {});

export const ctxConfig = {
  entryPoints: ['src/**/*.ts'],
  outdir: './build',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
  minify: false,
  sourcemap: true,
  external: [
    'fs',
    'path',
    'http',
    'https',
    'url',
    'crypto',
    'stream',
    'util',
    'events',
    'buffer',
    'process',
    'os',
    'child_process',
    ...deps,
  ],
  loader: {
    '.md': 'text',
  },
}
