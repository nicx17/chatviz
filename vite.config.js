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
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
})
