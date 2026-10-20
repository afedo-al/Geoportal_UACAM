import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { gzipSync, constants } from 'node:zlib';

/* Política de seguridad del contenido (CSP). Solo se inyecta en el build: el
   servidor de desarrollo necesita su cliente de recarga en caliente. En
   producción el servidor (nginx) debe enviarla también como cabecera, con
   frame-ancestors, que no funciona en una etiqueta meta. */
const TILES = 'https://tile.openstreetmap.org https://server.arcgisonline.com https://*.tile.opentopomap.org';
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `img-src 'self' data: blob: ${TILES}`,
  `connect-src 'self' ${TILES}`,
  "worker-src 'self'",
  "child-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'"
].join('; ');

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': `${CSP}; frame-ancestors 'none'`
};

const cspPlugin = () => ({
  name: 'geoportal-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: html => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`)
  }
});

/* El mapa es la portada, pero su vista va en un fragmento aparte (meterla en el paquete
   principal alarga la tarea de arranque). Se precarga desde el HTML para que se descargue
   a la vez que el paquete principal, en lugar de después. */
const preloadMapView = () => ({
  name: 'geoportal-preload-map',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const chunk = Object.values(ctx.bundle || {}).find(c => c.type === 'chunk' && c.name === 'MapView');
      return chunk ? [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `./${chunk.fileName}` }, injectTo: 'head' }] : html;
    }
  }
});

/* Compresión: el build deja una copia .gz de cada archivo de texto (JS, CSS, GeoJSON…)
   para que nginx la sirva con gzip_static; la vista previa local hace lo mismo, así
   que las mediciones de `npm run preview` reflejan lo que descargará el usuario. */
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.geojson', '.svg', '.txt']);
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

const compressPlugin = () => {
  let outDir = 'dist';
  return {
    name: 'geoportal-compress',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      if (!existsSync(outDir)) return;
      for (const f of walk(outDir)) {
        if (!COMPRESSIBLE.has(extname(f)) || statSync(f).size < 1024) continue;
        writeFileSync(`${f}.gz`, gzipSync(readFileSync(f), { level: constants.Z_BEST_COMPRESSION }));
      }
    },
    configurePreviewServer(server) {
      const root = resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '/').split(/[?#]/)[0]);
        const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
        if (!file.startsWith(root) || !/\bgzip\b/.test(req.headers['accept-encoding'] || '') || !existsSync(`${file}.gz`)) return next();
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
        res.end(readFileSync(`${file}.gz`));
      });
    }
  };
};

export default defineConfig({
  base: './',
  plugins: [vue(), cspPlugin(), preloadMapView(), compressPlugin()],
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 5175, strictPort: true, headers: securityHeaders, allowedHosts: ['.loca.lt'] },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 }
});
