/**
 * Web Worker for off-main-thread parsing.
 *
 * Parsing 100k+ messages, running the encoding fix on every string and
 * unzipping WhatsApp exports is CPU-intensive. This worker keeps the main
 * thread (and UI) fully responsive during the parse.
 *
 * It's bundled inline (`?worker&inline`) so it runs from a blob: URL, which
 * inherits the page's Content-Security-Policy. A worker loaded from its own
 * .js file would get its policy from that file's HTTP headers instead, and
 * the meta-tag CSP (connect-src 'none') wouldn't apply to it.
 *
 * Input:  { files: Array<{ name, blob }> } -- the user's File objects
 * Output: { chats } or { error }
 */

import { parseImport } from '../parsers/index.js';

self.onmessage = async (e) => {
  const { files } = e.data;

  try {
    const chats = await parseImport(files);
    self.postMessage({ chats });
  } catch (err) {
    self.postMessage({ error: err.message || 'Failed to parse the file.' });
  }
};
