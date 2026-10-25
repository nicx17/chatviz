import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Strict Content-Security-Policy for production builds. `connect-src 'none'`
// means the app cannot make any network request (fetch, XHR, WebSocket,
// beacon), which enforces that chat data is never sent anywhere.
// Only applied on build: the dev server needs a websocket for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  // Inline style attributes are used by the virtualized list
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

// HTTP response headers for Cloudflare (Workers static assets read
// dist/_headers). The header CSP repeats the meta one and adds
// frame-ancestors, which browsers ignore in a <meta> tag.
const HEADERS = `/*
  Content-Security-Policy: ${CSP}; frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()

# Hashed filenames, safe to cache forever
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

function contentSecurityPolicy() {
  return {
    name: 'chatviz-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
})
