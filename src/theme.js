/**
 * Appearance: a background theme and an accent colour, chosen separately.
 *
 * Applied as data-theme / data-accent on <html>; the colours themselves are
 * tokens in index.css. The choice is a per-browser convenience kept in
 * localStorage. public/theme-init.js applies it before first paint (the CSP
 * forbids inline scripts), so it must use the same storage key.
 */

import { useSyncExternalStore } from 'react';

export const THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'amoled', label: 'Super dark' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'mocha', label: 'Mocha' },
  { id: 'light', label: 'Light' },
];

export const ACCENTS = [
  { id: 'blue', label: 'Blue' },
  { id: 'violet', label: 'Violet' },
  { id: 'pink', label: 'Pink' },
  { id: 'red', label: 'Red' },
  { id: 'orange', label: 'Orange' },
  { id: 'green', label: 'Green' },
  { id: 'teal', label: 'Teal' },
];

const STORAGE_KEY = 'chatviz-appearance';
const DEFAULTS = { theme: 'dark', accent: 'blue' };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      theme: THEMES.some((t) => t.id === saved.theme) ? saved.theme : DEFAULTS.theme,
      accent: ACCENTS.some((a) => a.id === saved.accent) ? saved.accent : DEFAULTS.accent,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set();

function apply({ theme, accent }) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  // Mobile browser toolbar colour
  const bg = getComputedStyle(root).getPropertyValue('--color-ig-bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

/** Applies the saved appearance; call once before rendering. */
export function initAppearance() {
  apply(current);
}

/** @param {{ theme?: string, accent?: string }} patch */
export function setAppearance(patch) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice lasts for this page only
  }
  apply(current);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {{ theme: string, accent: string }} */
export function useAppearance() {
  return useSyncExternalStore(subscribe, () => current);
}
