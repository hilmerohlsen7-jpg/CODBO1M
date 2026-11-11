/**
 * Vel.gg Mobile Controller Overlay
 * Injected into the WebView that loads https://vel.gg
 *
 * Features:
 * - Left virtual joystick  → WASD movement
 * - Right look pad         → mouse look
 * - Action buttons         → Fire, Reload, Use, Jump, Sprint, Knife
 * - Pause toggle           → sends Escape + hides overlay
 * - Overlay shows while playing, hides when paused
 * - Small "Controls" FAB to restore overlay after pause
 */

(function () {
  "use strict";

  if (window.VelController) return; // already loaded

  // ─── Key codes the game expects ───────────────────────────────────────────
  const KEYS = {
    W: 87, A: 65, S: 83, D: 68,
    SPACE: 32, SHIFT: 16,
    R: 82, F: 70, E: 69,       // reload / use
    V: 86,                      // knife (common binding)
    ESC: 27,
    MOUSE1: 0                   // left click
  };

  // ─── State ────────────────────────────────────────────────────────────────
  let paused = false;
  let overlayVisible = true;
  let keysDown = new Set();
  let mouseButtons = new Set();

  // Joystick
  let joyActive = false;
  let joyId = null;
  let joyOrigin = { x: 0, y: 0 };
  let joyVec = { x: 0, y: 0 };

  // Look pad
  let lookActive = false;
  let lookId = null;
  let lookLast = { x: 0, y: 0 };
  const LOOK_SENS = 1.8;        // higher = faster turn

  // ─── DOM helpers ──────────────────────────────────────────────────────────
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "className") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    children.forEach(c => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  // ─── Synthetic events ─────────────────────────────────────────────────────
  function dispatchKey(code, type) {
    const e = new KeyboardEvent(type, {
      keyCode: code,
      which: code,
      bubbles: true,
      cancelable: true
    });
    // Some engines listen on window, some on document, some on canvas
    window.dispatchEvent(e);
    document.dispatchEvent(e);
    const canvas = document.querySelector("canvas");
    if (canvas) canvas.dispatchEvent(e);
  }

  function pressKey(code) {
    if (keysDown.has(code)) return;
    keysDown.add(code);
    dispatchKey(code, "keydown");
  }

  function releaseKey(code) {
    if (!keysDown.has(code)) return;
    keysDown.delete(code);
    dispatchKey(code, "keyup");
  }

  function releaseAllKeys() {
    [...keysDown].forEach(releaseKey);
    keysDown.clear();
  }

  function dispatchMouse(type, button, clientX, clientY) {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button,
      buttons: button === 0 ? 1 : 0,
      clientX,
      clientY
    });
    const target = document.querySelector("canvas") || document.body;
    target.dispatchEvent(e);
  }

  function fireDown() {
    if (mouseButtons.has(0)) return;
    mouseButtons.add(0);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    dispatchMouse("mousedown", 0, cx, cy);
  }

  function fireUp() {
    if (!mouseButtons.has(0)) return;
    mouseButtons.delete(0);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    dispatchMouse("mouseup", 0, cx, cy);
  }

  // Continuous look movement via mousemove
  function moveLook(dx, dy) {
    const canvas = document.querySelector("canvas") || document.body;
    const e = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: window,
      movementX: dx,
      movementY: dy,
      clientX: window.innerWidth / 2 + dx,
      clientY: window.innerHeight / 2 + dy
    });
    canvas.dispatchEvent(e);
    // Some engines also listen on document/window
    document.dispatchEvent(e);
    window.dispatchEvent(e);
  }

  // ─── Overlay UI ───────────────────────────────────────────────────────────
  let root, joyBase, joyKnob, lookPad, fab, btnPause;

  function buildOverlay() {
    // Root container
    root = el("div", {
      id: "vel-controller",
      style: {
        position: "fixed",
        inset: "0",
        zIndex: "2147483646",
        pointerEvents: "none",
        fontFamily: "-apple-system, system-ui, sans-serif",
        userSelect: "none",
        touchAction: "none"
      }
    });

    // ── Left joystick ──────────────────────────────────────────────────────
    joyBase = el("div", {
      style: {
        position: "absolute",
        left: "max(16px, env(safe-area-inset-left))",
        bottom: "max(24px, env(safe-area-inset-bottom))",
        width: "140px",
        height: "140px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.08)",
        border: "2px solid rgba(255,255,255,0.18)",
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    });

    joyKnob = el("div", {
      style: {
        width: "58px",
        height: "58px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.35)",
        border: "2px solid rgba(255,255,255,0.5)",
        transform: "translate(0,0)",
        transition: "transform 0.05s linear"
      }
    });
    joyBase.appendChild(joyKnob);
    root.appendChild(joyBase);

    // ── Right look pad (invisible full half) ───────────────────────────────
    lookPad = el("div", {
      style: {
        position: "absolute",
        right: "0",
        top: "0",
        width: "50%",
        height: "70%",
        pointerEvents: "auto",
        // subtle visual so users know the zone
        background: "linear-gradient(to left, rgba(255,255,255,0.03), transparent)"
      }
    });
    root.appendChild(lookPad);

    // ── Action buttons (right side, lower) ─────────────────────────────────
    const btnStyle = {
      width: "64px",
      height: "64px",
      borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.35)",
      background: "rgba(0,0,0,0.45)",
      color: "#fff",
      fontSize: "11px",
      fontWeight: "700",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "auto",
      textAlign: "center",
      lineHeight: "1.1",
      boxShadow: "0 2px 10px rgba(0,0,0,0.4)"
    };

    function makeBtn(label, x, y, onDown, onUp, extra = {}) {
      const b = el("div", {
        style: {
          ...btnStyle,
          position: "absolute",
          right: `calc(${x} + env(safe-area-inset-right, 0px))`,
          bottom: `calc(${y} + env(safe-area-inset-bottom, 0px))`,
          ...extra
        }
      }, [label]);
      b.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); onDown(); b.style.background = "rgba(196,30,58,0.7)"; }, { passive: false });
      b.addEventListener("touchend",   e => { e.preventDefault(); e.stopPropagation(); onUp();   b.style.background = "rgba(0,0,0,0.45)"; }, { passive: false });
      b.addEventListener("touchcancel",e => { onUp(); b.style.background = "rgba(0,0,0,0.45)"; });
      // mouse fallback for testing in desktop browser
      b.addEventListener("mousedown", e => { e.preventDefault(); onDown(); });
      b.addEventListener("mouseup",   e => { e.preventDefault(); onUp(); });
      root.appendChild(b);
      return b;
    }

    // Fire (large)
    makeBtn("FIRE", "18px", "100px", fireDown, fireUp, {
      width: "78px", height: "78px", fontSize: "13px",
      background: "rgba(196,30,58,0.55)", borderColor: "rgba(255,100,100,0.6)"
    });

    // Reload
    makeBtn("R", "100px", "110px", () => pressKey(KEYS.R), () => releaseKey(KEYS.R));

    // Use / Interact
    makeBtn("USE", "18px", "190px", () => { pressKey(KEYS.F); pressKey(KEYS.E); }, () => { releaseKey(KEYS.F); releaseKey(KEYS.E); });

    // Jump
    makeBtn("JUMP", "100px", "190px", () => pressKey(KEYS.SPACE), () => releaseKey(KEYS.SPACE));

    // Sprint
    makeBtn("SPRINT", "18px", "280px", () => pressKey(KEYS.SHIFT), () => releaseKey(KEYS.SHIFT), { fontSize: "10px" });

    // Knife
    makeBtn("KNIFE", "100px", "280px", () => pressKey(KEYS.V), () => releaseKey(KEYS.V), { fontSize: "10px" });

    // Pause button
    btnPause = makeBtn("❚❚", "18px", "370px", () => togglePause(), () => {}, {
      width: "52px", height: "52px", fontSize: "16px",
      background: "rgba(40,40,40,0.7)"
    });

    // ── Floating "Controls" button (shown only when overlay is hidden) ─────
    fab = el("div", {
      id: "vel-fab",
      style: {
        position: "fixed",
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(24px, env(safe-area-inset-bottom))",
        width: "52px",
        height: "52px",
        borderRadius: "50%",
        background: "rgba(196,30,58,0.85)",
        color: "#fff",
        fontSize: "22px",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "2147483647",
        pointerEvents: "auto",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)"
      }
    }, ["🎮"]);
    fab.addEventListener("touchstart", e => {
      e.preventDefault();
      e.stopPropagation();
      showOverlay();
    }, { passive: false });
    fab.addEventListener("click", showOverlay);
    document.documentElement.appendChild(fab);

    document.documentElement.appendChild(root);
  }

  // ─── Show / Hide overlay ──────────────────────────────────────────────────
  function showOverlay() {
    overlayVisible = true;
    if (root) root.style.display = "block";
    if (fab) fab.style.display = "none";
    paused = false;
  }

  function hideOverlay() {
    overlayVisible = false;
    if (root) root.style.display = "none";
    if (fab) fab.style.display = "flex";
    releaseAllKeys();
    fireUp();
    joyVec = { x: 0, y: 0 };
    updateJoystickVisual();
  }

  function togglePause() {
    // Send Escape so the game opens its pause menu
    pressKey(KEYS.ESC);
    setTimeout(() => releaseKey(KEYS.ESC), 80);

    paused = !paused;
    if (paused) {
      hideOverlay();
    } else {
      showOverlay();
    }
  }

  // ─── Joystick logic ───────────────────────────────────────────────────────
  function updateJoystickVisual() {
    const max = 40;
    const x = joyVec.x * max;
    const y = joyVec.y * max;
    joyKnob.style.transform = `translate(${x}px, ${y}px)`;
  }

  function applyMovement() {
    // Deadzone
    const dead = 0.22;
    const ax = Math.abs(joyVec.x) > dead ? joyVec.x : 0;
    const ay = Math.abs(joyVec.y) > dead ? joyVec.y : 0;

    // Vertical (W/S)
    if (ay < -dead) { pressKey(KEYS.W); releaseKey(KEYS.S); }
    else if (ay > dead) { pressKey(KEYS.S); releaseKey(KEYS.W); }
    else { releaseKey(KEYS.W); releaseKey(KEYS.S); }

    // Horizontal (A/D)
    if (ax < -dead) { pressKey(KEYS.A); releaseKey(KEYS.D); }
    else if (ax > dead) { pressKey(KEYS.D); releaseKey(KEYS.A); }
    else { releaseKey(KEYS.A); releaseKey(KEYS.D); }
  }

  function onJoyStart(e) {
    if (joyActive) return;
    const t = e.changedTouches[0];
    joyActive = true;
    joyId = t.identifier;
    const rect = joyBase.getBoundingClientRect();
    joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    onJoyMove(e);
  }

  function onJoyMove(e) {
    if (!joyActive) return;
    let t = null;
    for (const touch of e.changedTouches) {
      if (touch.identifier === joyId) { t = touch; break; }
    }
    if (!t) return;

    const dx = t.clientX - joyOrigin.x;
    const dy = t.clientY - joyOrigin.y;
    const dist = Math.hypot(dx, dy);
    const max = 48;
    const scale = dist > max ? max / dist : 1;
    joyVec = { x: (dx * scale) / max, y: (dy * scale) / max };
    updateJoystickVisual();
    applyMovement();
  }

  function onJoyEnd(e) {
    if (!joyActive) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === joyId) {
        joyActive = false;
        joyId = null;
        joyVec = { x: 0, y: 0 };
        updateJoystickVisual();
        releaseKey(KEYS.W); releaseKey(KEYS.A); releaseKey(KEYS.S); releaseKey(KEYS.D);
        break;
      }
    }
  }

  // ─── Look pad logic ───────────────────────────────────────────────────────
  function onLookStart(e) {
    if (lookActive) return;
    const t = e.changedTouches[0];
    lookActive = true;
    lookId = t.identifier;
    lookLast = { x: t.clientX, y: t.clientY };
  }

  function onLookMove(e) {
    if (!lookActive) return;
    let t = null;
    for (const touch of e.changedTouches) {
      if (touch.identifier === lookId) { t = touch; break; }
    }
    if (!t) return;

    const dx = (t.clientX - lookLast.x) * LOOK_SENS;
    const dy = (t.clientY - lookLast.y) * LOOK_SENS;
    lookLast = { x: t.clientX, y: t.clientY };
    moveLook(dx, dy);
  }

  function onLookEnd(e) {
    if (!lookActive) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === lookId) {
        lookActive = false;
        lookId = null;
        break;
      }
    }
  }

  // ─── Bind touch events ────────────────────────────────────────────────────
  function bindEvents() {
    // Joystick
    joyBase.addEventListener("touchstart", e => { e.preventDefault(); onJoyStart(e); }, { passive: false });
    joyBase.addEventListener("touchmove",  e => { e.preventDefault(); onJoyMove(e); }, { passive: false });
    joyBase.addEventListener("touchend",   e => { e.preventDefault(); onJoyEnd(e); }, { passive: false });
    joyBase.addEventListener("touchcancel",e => { onJoyEnd(e); });

    // Look
    lookPad.addEventListener("touchstart", e => { e.preventDefault(); onLookStart(e); }, { passive: false });
    lookPad.addEventListener("touchmove",  e => { e.preventDefault(); onLookMove(e); }, { passive: false });
    lookPad.addEventListener("touchend",   e => { e.preventDefault(); onLookEnd(e); }, { passive: false });
    lookPad.addEventListener("touchcancel",e => { onLookEnd(e); });

    // Prevent the browser from scrolling or zooming while playing
    document.addEventListener("touchmove", e => {
      if (overlayVisible) e.preventDefault();
    }, { passive: false });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById("vel-controller")) return; // already there
    buildOverlay();
    bindEvents();
    showOverlay();
    console.log("[VelController] Overlay ready");
  }

  // Auto-init if script is injected after the game page has loaded
  if (document.readyState === "complete" || document.readyState === "interactive") {
    // Give the game a moment to create its canvas
    setTimeout(init, 800);
  } else {
    window.addEventListener("load", () => setTimeout(init, 800));
  }

  // Expose for manual control from Capacitor / React Native
  window.VelController = {
    init,
    show: showOverlay,
    hide: hideOverlay,
    togglePause,
    isPaused: () => paused,
    isVisible: () => overlayVisible
  };
})();
