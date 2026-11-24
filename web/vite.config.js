import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import compression from 'compression';

/* Política de seguridad del contenido (CSP). Solo se inyecta en el build: el
   servidor de desarrollo necesita su cliente de recarga en caliente. En
   producción el servidor (nginx) debe enviarla también como cabecera, con
   frame-ancestors, que no funciona en una etiqueta meta. */
const TILES = 'https://tile.openstreetmap.org https://server.arcgisonline.com https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com https://api.maptiler.com';
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

/* Las vistas públicas (mapa y catálogo) van en fragmentos aparte (meterlas en el paquete principal
   alarga la tarea de arranque). Se precargan desde el HTML para que se descarguen a la vez que el
   paquete principal, en lugar de después; son pequeñas. Carga y GPS (solo administración) no. */
const PRELOAD = ['MapView', 'CatalogView'];
const preloadMapView = () => ({
  name: 'geoportal-preload-views',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const chunks = Object.values(ctx.bundle || {}).filter(c => c.type === 'chunk' && PRELOAD.includes(c.name));
      return chunks.length ? chunks.map(c => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `./${c.fileName}` }, injectTo: 'head' })) : html;
    }
  }
});

/* Servidor de desarrollo: comprime las respuestas (como lo hará nginx), así lo que se mide y se ve en
   `npm run dev` pesa mucho menos. Sigue sin minificar: para medir el rendimiento real usa `npm run start`. */
const devCompress = () => ({
  name: 'geoportal-dev-compress',
  apply: 'serve',
  configureServer(server) { server.middlewares.use(compression({ threshold: 1024 })); }
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
        const data = readFileSync(f);
        writeFileSync(`${f}.gz`, gzipSync(data, { level: constants.Z_BEST_COMPRESSION }));
        writeFileSync(`${f}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }));
      }
    },
    configurePreviewServer(server) {
      const root = resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '/').split(/[?#]/)[0]);
        const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
        const accepts = req.headers['accept-encoding'] || '';
        const enc = /\bbr\b/.test(accepts) && existsSync(`${file}.br`) ? 'br' : /\bgzip\b/.test(accepts) && existsSync(`${file}.gz`) ? 'gzip' : null;
        if (!file.startsWith(root) || !enc) return next();
        res.setHeader('Content-Encoding', enc);
        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
        res.end(readFileSync(`${file}.${enc === 'br' ? 'br' : 'gz'}`));
      });
    }
  };
};

/* Servicio de publicación (pendiente): si se define GEOPORTAL_API, /api se redirige a esa dirección en
   desarrollo y en la vista previa. En producción lo hará nginx (deploy/nginx-seguridad.conf). */
const API_TARGET = process.env.GEOPORTAL_API;
const apiProxy = API_TARGET ? { '/api': { target: API_TARGET, changeOrigin: false, xfwd: true } } : undefined;

export default defineConfig({
  base: './',
  /* Las rutas van tras «#», así que el servidor nunca necesita devolver index.html para otra ruta.
     Con 'mpa', una ruta inexistente (por ejemplo /.well-known/ai-catalog.json) responde 404 como
     lo hará nginx, en lugar de devolver la página principal con código 200 y HTML. */
  appType: 'mpa',
  plugins: [vue(), devCompress(), cspPlugin(), preloadMapView(), compressPlugin()],
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true, proxy: apiProxy,
    /* Se transforman por adelantado los archivos de arranque, para que la primera carga no espere a Vite */
    warmup: { clientFiles: ['./src/main.js', './src/App.vue', './src/views/MapView.vue', './src/views/CatalogView.vue'] }
  },
  preview: { host: '127.0.0.1', port: 5175, strictPort: true, headers: securityHeaders, allowedHosts: ['.loca.lt'], proxy: apiProxy },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 }
});
