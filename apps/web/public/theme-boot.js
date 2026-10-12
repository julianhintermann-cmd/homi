/*
 * Homi appearance bootstrap – loaded as a classic, render-blocking script from <head> so the
 * user's forced light/dark appearance applies before first paint (no inline script: the CSP
 * is `script-src 'self'`). Mirrors `applyThemePreferences()` in src/lib/theme.ts; the unit
 * test src/lib/theme.test.ts keeps both in sync.
 */
/* global window, document */
(function () {
  'use strict';
  var STORAGE_KEY = 'homi.appearance';
  var THEME_COLORS = { light: '#F7F6F3', dark: '#0E0E10' };
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var prefs = JSON.parse(raw);
    if (!prefs || typeof prefs !== 'object') return;
    var root = document.documentElement;
    var appearance = prefs.appearance;
    if (appearance === 'light' || appearance === 'dark') {
      root.setAttribute('data-theme', appearance);
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', THEME_COLORS[appearance]);
    }
    if (prefs.reduceTransparency === true) root.setAttribute('data-transparency', 'reduced');
  } catch {
    // Storage blocked or corrupt – the system appearance (CSS media queries) applies.
  }
})();
