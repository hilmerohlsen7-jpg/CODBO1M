# Vel.gg Zombies — Capacitor Mobile Wrapper + Controller Overlay

Native-feeling Android / iOS app that loads the **vel.gg** Black Ops 1 Zombies browser port inside a WebView and injects a full on-screen controller.

## Features

| Control          | Action                          |
|------------------|---------------------------------|
| Left joystick    | WASD movement                   |
| Right look pad   | Mouse look (drag to turn)       |
| FIRE             | Left mouse button               |
| R                | Reload                          |
| USE              | Interact (F / E)                |
| JUMP             | Space                            |
| SPRINT           | Shift                           |
| KNIFE            | V                               |
| Pause (❚❚)       | Escape → hides overlay          |
| 🎮 FAB           | Restore overlay after pause     |

**Pause behaviour**
- Tapping the pause button sends `Escape` to the game and **hides** the whole controller overlay.
- A small red 🎮 floating button appears so you can bring the controls back when you unpause.
- All held keys/buttons are released when the overlay is hidden.

## Project layout

```
vel-gg-capacitor/
├── capacitor.config.ts   # points WebView at https://vel.gg
├── package.json
├── www/
│   ├── index.html        # fallback bootstrap page
│   └── controller.js     # the full overlay (inject this)
├── inject.js             # helper snippets for evaluateJavaScript
└── README.md
```

## Setup (Capacitor)

```bash
cd vel-gg-capacitor
npm install

# Add platforms
npx cap add android
# npx cap add ios          # requires macOS + Xcode

# Sync web assets + native projects
npx cap sync

# Open in IDE
npx cap open android
# npx cap open ios
```

### Injecting the controller

Because `capacitor.config.ts` sets `server.url = "https://vel.gg"`, the WebView loads the game directly. You must inject `controller.js` after the page has loaded.

**Option A – evaluateJavaScript (recommended)**

In your Capacitor app (or a small plugin) after the WebView finishes loading:

```ts
import { Capacitor } from '@capacitor/core';

// Read the file content of www/controller.js at build time
// or host it and fetch it, then:
const script = `/* paste entire controller.js source here */`;

await (window as any).Capacitor.Plugins.WebView.evaluateJavaScript({
  code: script
});
```

**Option B – load from a URL you control**

Host `controller.js` on any HTTPS server and inject:

```js
(function(){
  if (window.VelController) return window.VelController.init();
  var s = document.createElement('script');
  s.src = 'https://your-cdn.com/controller.js';
  s.onload = () => window.VelController && window.VelController.init();
  document.documentElement.appendChild(s);
})();
```

**Option C – React Native / Expo**

```jsx
<WebView
  source={{ uri: 'https://vel.gg' }}
  javaScriptEnabled
  domStorageEnabled
  allowsInlineMediaPlayback
  mediaPlaybackRequiresUserAction={false}
  onLoadEnd={() => {
    webviewRef.current?.injectJavaScript(controllerSource + '; true;');
  }}
/>
```

## Controls API (available after injection)

```js
window.VelController.init();        // build & show overlay
window.VelController.show();        // show overlay
window.VelController.hide();        // hide overlay + release keys
window.VelController.togglePause(); // send Escape + toggle visibility
window.VelController.isPaused();    // boolean
window.VelController.isVisible();   // boolean
```

## Important notes

1. **Copyright / ToS** – This is an unofficial fan wrapper. The game content belongs to Activision / Treyarch. Use at your own risk.
2. **Performance** – The original port targets desktop. On phones expect lower frame rates; landscape mode helps.
3. **Pointer lock** – Some WebGL games request pointer lock. On mobile this is usually ignored; the look pad synthesizes `mousemove` with `movementX/Y` instead.
4. **Key mapping** – If a button does nothing, the game may use a different binding. Open the browser console on desktop, press the real key, and adjust the `KEYS` map in `controller.js`.
5. **Safe areas** – The overlay respects `env(safe-area-inset-*)` so controls stay clear of notches / home indicators.

## Testing without a device

1. Open `www/index.html` in a desktop browser.
2. Click **Launch Game** (or navigate to vel.gg).
3. In the browser console paste the contents of `controller.js` and press Enter.
4. The overlay appears. You can test with the mouse (buttons work; joystick needs touch or a touch emulator).

## Next steps you may want

- Add haptic feedback on button press (`@capacitor/haptics`)
- Keep screen awake (`@capacitor-community/keep-awake`)
- Custom key rebinding UI
- Hide the system status bar for a more immersive experience
