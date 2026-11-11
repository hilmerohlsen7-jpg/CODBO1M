/**
 * Capacitor / React Native injection helper
 *
 * Call this after the WebView has finished loading https://vel.gg
 * so the controller overlay is injected into the game page.
 *
 * Capacitor example (in your App component or after Browser/WebView load):
 *
 *   import { Capacitor } from '@capacitor/core';
 *   // after page load:
 *   await Capacitor.Plugins.YourWebViewPlugin.evaluateJavaScript({ code: INJECT_CODE });
 *
 * Or with @capacitor/browser + a custom WebView plugin, or simply
 * include controller.js via a userscript / bookmarklet for testing.
 */

// Paste the entire contents of www/controller.js here when evaluating,
// or load it as a string:

export const CONTROLLER_SCRIPT_URL = './controller.js'; // relative if you host it

// Minimal injection snippet (loads the script from your app assets or a CDN you control)
export const INJECT_SNIPPET = `
(function() {
  if (window.VelController) { window.VelController.init(); return; }
  var s = document.createElement('script');
  s.src = 'https://YOUR-HOSTED-ASSETS/controller.js';  // ← change this
  s.onload = function() { if (window.VelController) window.VelController.init(); };
  document.documentElement.appendChild(s);
})();
`;

// Alternative: inline the whole controller (no external request)
// Just read controller.js and pass its source to evaluateJavaScript / injectJavaScript
