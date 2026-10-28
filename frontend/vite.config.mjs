// Plugin-local REGISTRATION build (Phase 307, AITR-01/02/03; the Phase-303
// D-13/D-14 model, mirroring plugins/ai-schema-wizard/frontend/vite.config.mjs).
//
// Produces `plugins/ai-translation/static/ai-translation.js`: a single ES file
// that registers the plugin's three contributions — the translation panel
// action, the translation admin action and the schema settings section — plus
// the plugin's five per-language catalogs. Every host singleton is externalized
// BY IDENTITY so the bundle shares the host's one React, Router, QueryClient and
// authenticated api client (the import map in frontend/index.html resolves those
// bare specifiers at runtime).
//
// The plugin owns no chart/vendor payload: each of the three surfaces imports
// its scoped stylesheet with `?inline` (so it becomes a JS string and no
// separate CSS asset is emitted). It is built with the INSTALLED host Vite —
// there is no plugin-local node_modules or package toolchain.
export default {
  root: import.meta.dirname,
  build: {
    lib: {
      entry: 'index.jsx',
      formats: ['es'],
      fileName: () => 'ai-translation.js',
    },
    outDir: '../static',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        'react-router',
        'react-router-dom',
        '@tanstack/react-query',
        '@indramesh/plugin-api',
      ],
    },
  },
}
