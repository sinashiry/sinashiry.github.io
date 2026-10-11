import { defineConfig } from 'astro/config';
// Served at the root of https://sina-shiri.com by GitHub Pages: no `base`, and every URL stays root-absolute.
// The Content-Security-Policy meta is added by scripts/prepare-pages.mjs, which hashes the final HTML after its own
// post-build injections; Astro's security.csp would hash inline styles and miss those injected scripts.
export default defineConfig({
  site: 'https://sina-shiri.com',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  outDir: process.env.BUILD_OUT_DIR || './dist',
  // Keep the shared site script (src/scripts/site.ts) an external, cacheable file as before; everything else keeps the default 4 KiB limit.
  vite: { build: { assetsInlineLimit: (file, content) => /(?:^|\/)Base\.astro_astro_type_script_/.test(file) && content.includes('.menu-toggle') ? false : undefined } },
});
