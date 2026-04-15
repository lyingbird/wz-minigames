/**
 * engine.js — Lightweight mobile game engine for Honor of Kings themed HTML5 mini-games
 * Pure ES6 module, no dependencies. All coordinates in CSS pixels.
 *
 * Palette:
 *   Gold   #D4A84B
 *   Dark   #1A1A2E
 *   Red    #E74C3C
 *   Blue   #3498DB
 */

// ─── 1. Canvas Management ────────────────────────────────────────────────────

/**
 * Creates a full-screen canvas inside `container`, handling DPR for crisp
 * rendering on retina screens. Locks to portrait and auto-resizes.
 *
 * @param {HTMLElement} container
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number }}
 */
export function createCanvas(container) {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';          // prevent browser gestures
  container.style.overflow = 'hidden';
  container.style.position = container.style.position || 'relative';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const state = { canvas, ctx, width: 0, height: 0, dpr: 1 };

  // Rotation prompt overlay
  let rotateOverlay = null;

  function createRotateOverlay() {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;flex-direction:column;background:#1A1A2E;color:#D4A84B;' +
      'font-family:sans-serif;font-size:20px;text-align:center;padding:20px;';
    el.innerHTML =
      '<div style="font-size:48px;margin-bottom:16px">📱</div>' +
      '<div>请将手机竖屏使用</div>' +
      '<div style="font-size:14px;color:#aaa;margin-top:8px">Please rotate to portrait mode</div>';
    document.body.appendChild(el);
    return el;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3x
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.width = w;
    state.height = h;
    state.dpr = dpr;

    // Portrait lock: show overlay when landscape
    const isLandscape = w > h && w > 500;
    if (isLandscape) {
      if (!rotateOverlay) rotateOverlay = createRotateOverlay();
      rotateOverlay.style.display = 'flex';
    } else if (rotateOverlay) {
      rotateOverlay.style.display = 'none';
    }
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    // Small delay lets the browser settle on new dimensions
    setTimeout(resize, 150);
  });

  return state;
}

// ─── 2. Game Loop ────────────────────────────────────────────────────────────

/**
 * @param {(dt: number) => void} updateFn  — dt in seconds, capped at 0.05
 * @param {() => void} renderFn
 */
export function createGameLoop(updateFn, renderFn) {
  let rafId = null;
  let lastTime = 0;
  let paused = false;
  let running = false;
  let fps = 0;
  let frameCount = 0;
  let fpsTime = 0;

  function tick(now) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    if (lastTime === 0) { lastTime = now; return; }

    const rawDt = (now - lastTime) / 1000;
    lastTime = now;

    // FPS counter
    frameCount++;
    fpsTime += rawDt;
    if (fpsTime >= 1) {
      fps = frameCount;
      frameCount = 0;
      fpsTime -= 1;
    }

    if (paused) return;

    const dt = Math.min(rawDt, 0.05); // spiral-of-death cap
    updateFn(dt);
    renderFn();
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    },
    pause() { paused = true; },
    resume() { paused = false; lastTime = 0; },
    get isPaused() { return paused; },
    get fps() { return fps; }
  };
}

// ─── 3. Touch Controls ──────────────────────────────────────────────────────

/**
 * Convert a touch/pointer event to CSS-pixel canvas coordinates.
 */
function touchToCanvas(canvas, touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top
  };
}

// ── 3a. Virtual Joystick ──

/**
 * @param {{ side?: 'left'|'right', radius?: number, deadzone?: number }} options
 */
export function createJoystick(options = {}) {
  const side = options.side || 'left';
  const radius = options.radius || 60;
  const deadzone = options.deadzone || 10;
  const innerRadius = radius * 0.4;

  const state = {
    x: 0,         // -1..1
    y: 0,         // -1..1
    angle: 0,     // radians
    magnitude: 0, // 0..1
    active: false
  };

  // Internal tracking
  let touchId = null;
  let baseX = 0;
  let baseY = 0;
  let thumbX = 0;
  let thumbY = 0;

  function handleStart(canvas, touch) {
    if (state.active) return false; // already tracking a finger
    const pos = touchToCanvas(canvas, touch);
    const halfW = canvas.clientWidth / 2;
    const inZone = side === 'left' ? pos.x < halfW : pos.x >= halfW;
    if (!inZone) return false;

    touchId = touch.identifier;
    baseX = pos.x;
    baseY = pos.y;
    thumbX = pos.x;
    thumbY = pos.y;
    state.active = true;
    updateVector();
    return true;
  }

  function handleMove(canvas, touch) {
    if (touch.identifier !== touchId) return;
    const pos = touchToCanvas(canvas, touch);
    thumbX = pos.x;
    thumbY = pos.y;
    updateVector();
  }

  function handleEnd(touch) {
    if (touch.identifier !== touchId) return;
    touchId = null;
    state.x = 0;
    state.y = 0;
    state.angle = 0;
    state.magnitude = 0;
    state.active = false;
  }

  function updateVector() {
    let dx = thumbX - baseX;
    let dy = thumbY - baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < deadzone) {
      state.x = 0;
      state.y = 0;
      state.angle = 0;
      state.magnitude = 0;
      // keep thumb at base visually
      thumbX = baseX;
      thumbY = baseY;
      return;
    }

    // Clamp to radius
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
      thumbX = baseX + dx;
      thumbY = baseY + dy;
    }

    state.x = dx / radius;
    state.y = dy / radius;
    state.angle = Math.atan2(dy, dx);
    state.magnitude = Math.min(dist / radius, 1);
  }

  /**
   * Call this to install listeners on the canvas.
   * Returns a cleanup function.
   */
  function attach(canvas) {
    function onTouchStart(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (handleStart(canvas, e.changedTouches[i])) {
          // Don't preventDefault globally — only claim our touch
          break;
        }
      }
    }
    function onTouchMove(e) {
      e.preventDefault(); // prevent scroll while dragging
      for (let i = 0; i < e.changedTouches.length; i++) {
        handleMove(canvas, e.changedTouches[i]);
      }
    }
    function onTouchEnd(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        handleEnd(e.changedTouches[i]);
      }
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }

  /**
   * Render the joystick onto the game canvas.
   * @param {CanvasRenderingContext2D} ctx
   */
  function render(ctx) {
    if (!state.active) return;

    // Base circle
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(baseX, baseY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#D4A84B';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#D4A84B';
    ctx.stroke();

    // Inner thumb
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#D4A84B';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    ctx.restore();
  }

  return { state, attach, render };
}

// ── 3b. Swipe Detector ──

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createSwipeDetector(canvas) {
  const MIN_DISTANCE = 30; // px — minimum swipe length
  let callback = null;
  let trails = [];          // { points[], active }

  // Track multiple simultaneous swipes by touch id
  const activeTouches = new Map();

  function onTouchStart(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const pos = touchToCanvas(canvas, t);
      const trail = { points: [{ x: pos.x, y: pos.y, t: performance.now() }], active: true };
      activeTouches.set(t.identifier, trail);
      trails.push(trail);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const trail = activeTouches.get(t.identifier);
      if (!trail) continue;
      const pos = touchToCanvas(canvas, t);
      trail.points.push({ x: pos.x, y: pos.y, t: performance.now() });
    }
  }

  function onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const trail = activeTouches.get(t.identifier);
      if (!trail) continue;
      trail.active = false;
      activeTouches.delete(t.identifier);

      const pts = trail.points;
      if (pts.length < 2) continue;
      const dx = pts[pts.length - 1].x - pts[0].x;
      const dy = pts[pts.length - 1].y - pts[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= MIN_DISTANCE && callback) {
        const elapsed = (pts[pts.length - 1].t - pts[0].t) / 1000 || 0.01;
        const velocity = dist / elapsed;
        callback(pts, velocity);
      }
    }
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return {
    /** @param {(points: {x:number,y:number,t:number}[], velocity: number) => void} fn */
    set onSwipe(fn) { callback = fn; },

    /** Active + recent trails for rendering slash effects. */
    get trails() { return trails; },

    /** Call each frame to prune old finished trails (> 300ms old). */
    prune() {
      const now = performance.now();
      trails = trails.filter(tr => {
        if (tr.active) return true;
        const last = tr.points[tr.points.length - 1];
        return now - last.t < 300;
      });
    },

    destroy() {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    }
  };
}

// ── 3c. Tap Detector ──

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createTapDetector(canvas) {
  const MOVE_THRESHOLD = 15; // px — finger moved more than this => not a tap
  let callback = null;
  const pending = new Map(); // touchId -> { x, y }

  function onStart(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const pos = touchToCanvas(canvas, t);
      pending.set(t.identifier, { x: pos.x, y: pos.y, moved: false });
    }
  }

  function onMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const info = pending.get(t.identifier);
      if (!info) continue;
      const pos = touchToCanvas(canvas, t);
      const dx = pos.x - info.x;
      const dy = pos.y - info.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        info.moved = true;
      }
    }
  }

  function onEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const info = pending.get(t.identifier);
      pending.delete(t.identifier);
      if (info && !info.moved && callback) {
        callback(info.x, info.y);
      }
    }
  }

  canvas.addEventListener('touchstart', onStart, { passive: true });
  canvas.addEventListener('touchmove', onMove, { passive: true });
  canvas.addEventListener('touchend', onEnd, { passive: true });
  canvas.addEventListener('touchcancel', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      pending.delete(e.changedTouches[i].identifier);
    }
  }, { passive: true });

  return {
    /** @param {(x: number, y: number) => void} fn */
    set onTap(fn) { callback = fn; },

    destroy() {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
    }
  };
}

// ─── 4. Collision Detection ──────────────────────────────────────────────────

/** Circle vs circle. */
export function circleCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const rSum = r1 + r2;
  return dx * dx + dy * dy <= rSum * rSum;
}

/** Point vs circle. */
export function pointInCircle(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Line segment (x1,y1)-(x2,y2) vs circle (cx,cy,r).
 * Uses closest-point-on-segment approach.
 */
export function lineCircleCollision(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  // Degenerate segment (point)
  if (lenSq === 0) return pointInCircle(x1, y1, cx, cy, r);

  // Project circle center onto line, clamp to segment
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distX = cx - closestX;
  const distY = cy - closestY;
  return distX * distX + distY * distY <= r * r;
}

/** Rectangle (rx,ry,rw,rh) vs circle (cx,cy,r). */
export function rectCircleCollision(rx, ry, rw, rh, cx, cy, r) {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

// ─── 5. Particle System ─────────────────────────────────────────────────────

/**
 * @param {number} maxParticles — pool size
 */
export function createParticleSystem(maxParticles = 200) {
  // Pre-allocated pool
  const pool = new Array(maxParticles);
  for (let i = 0; i < maxParticles; i++) {
    pool[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', size: 4, gravity: 0, fadeOut: true, text: null, fontSize: 0 };
  }

  /**
   * Emit particles.
   * @param {number} x
   * @param {number} y
   * @param {{ count?: number, speed?: number, life?: number, color?: string, size?: number, gravity?: number, fadeOut?: boolean }} opts
   */
  function emit(x, y, opts = {}) {
    const count = opts.count || 10;
    const speed = opts.speed || 100;
    const life = opts.life || 0.8;
    const color = opts.color || '#D4A84B';
    const size = opts.size || 4;
    const gravity = opts.gravity || 0;
    const fadeOut = opts.fadeOut !== false;

    let spawned = 0;
    for (let i = 0; i < maxParticles && spawned < count; i++) {
      if (pool[i].alive) continue;
      const p = pool[i];
      p.alive = true;
      p.x = x;
      p.y = y;
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.5 + Math.random() * 0.5);
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.life = life * (0.7 + Math.random() * 0.3);
      p.maxLife = p.life;
      p.color = color;
      p.size = size * (0.6 + Math.random() * 0.4);
      p.gravity = gravity;
      p.fadeOut = fadeOut;
      p.text = null;
      spawned++;
    }
  }

  /**
   * Emit a single text particle (for floating score text — quick one-offs).
   */
  function emitText(x, y, text, opts = {}) {
    for (let i = 0; i < maxParticles; i++) {
      if (pool[i].alive) continue;
      const p = pool[i];
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = opts.vx || 0;
      p.vy = opts.vy || -60;
      p.life = opts.life || 1;
      p.maxLife = p.life;
      p.color = opts.color || '#D4A84B';
      p.size = opts.size || 20;
      p.gravity = opts.gravity || 0;
      p.fadeOut = opts.fadeOut !== false;
      p.text = text;
      p.fontSize = opts.size || 20;
      return;
    }
  }

  function update(dt) {
    for (let i = 0; i < maxParticles; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function render(ctx) {
    ctx.save();
    for (let i = 0; i < maxParticles; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      const alpha = p.fadeOut ? Math.max(0, p.life / p.maxLife) : 1;
      ctx.globalAlpha = alpha;

      if (p.text !== null) {
        // Text particle
        ctx.font = `bold ${p.fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#1A1A2E';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function clear() {
    for (let i = 0; i < maxParticles; i++) pool[i].alive = false;
  }

  return { emit, emitText, update, render, clear };
}

// ─── 6. Object Pool ─────────────────────────────────────────────────────────

/**
 * @param {() => T} factoryFn  — creates a new object
 * @param {(obj: T) => void} resetFn — resets object for reuse
 * @param {number} initialSize
 * @template T
 */
export function createPool(factoryFn, resetFn, initialSize = 20) {
  const free = [];
  const active = [];

  // Pre-populate
  for (let i = 0; i < initialSize; i++) {
    free.push(factoryFn());
  }

  return {
    /** Get an object from pool (recycled or new). */
    get() {
      let obj;
      if (free.length > 0) {
        obj = free.pop();
      } else {
        obj = factoryFn();
      }
      resetFn(obj);
      active.push(obj);
      return obj;
    },

    /** Release an active object back to pool. */
    release(obj) {
      const idx = active.indexOf(obj);
      if (idx !== -1) {
        // Swap-remove for O(1)
        active[idx] = active[active.length - 1];
        active.pop();
        free.push(obj);
      }
    },

    /** Iterate all active objects. Callback receives (obj, index). */
    forEach(fn) {
      // Iterate backwards so callback can safely release during iteration
      for (let i = active.length - 1; i >= 0; i--) {
        fn(active[i], i);
      }
    },

    /** Release all active objects. */
    releaseAll() {
      while (active.length > 0) {
        free.push(active.pop());
      }
    },

    get activeCount() { return active.length; },
    get freeCount() { return free.length; }
  };
}

// ─── 7. Floating Text ───────────────────────────────────────────────────────

export function createFloatingText() {
  const items = [];

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {{ color?: string, size?: number, duration?: number, rise?: number }} opts
   */
  function add(x, y, text, opts = {}) {
    items.push({
      x,
      y,
      text,
      color: opts.color || '#D4A84B',
      size: opts.size || 24,
      duration: opts.duration || 1,
      rise: opts.rise || 50,
      elapsed: 0
    });
  }

  function update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      item.elapsed += dt;
      if (item.elapsed >= item.duration) {
        items.splice(i, 1);
      }
    }
  }

  function render(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const t = item.elapsed / item.duration; // 0..1
      const alpha = 1 - t;
      const yOff = item.rise * t;
      const scale = 1 + t * 0.3; // slight grow

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `bold ${Math.round(item.size * scale)}px sans-serif`;

      const drawX = item.x;
      const drawY = item.y - yOff;

      // Outline for visibility
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1A1A2E';
      ctx.strokeText(item.text, drawX, drawY);

      ctx.fillStyle = item.color;
      ctx.fillText(item.text, drawX, drawY);
    }
    ctx.restore();
  }

  function clear() {
    items.length = 0;
  }

  return { add, update, render, clear };
}

// ─── 8. Screen Utils ─────────────────────────────────────────────────────────

/**
 * Draw a dark overlay with centered text (pause/gameover screens).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width  — canvas CSS width
 * @param {number} height — canvas CSS height
 * @param {{ title?: string, subtitle?: string, alpha?: number, titleColor?: string, subtitleColor?: string, titleSize?: number, subtitleSize?: number }} opts
 */
export function showOverlay(ctx, width, height, opts = {}) {
  const alpha = opts.alpha || 0.7;
  const title = opts.title || '';
  const subtitle = opts.subtitle || '';
  const titleColor = opts.titleColor || '#D4A84B';
  const subtitleColor = opts.subtitleColor || '#ffffff';
  const titleSize = opts.titleSize || 36;
  const subtitleSize = opts.subtitleSize || 18;

  ctx.save();

  // Dark overlay
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 1;

  // Title
  if (title) {
    ctx.font = `bold ${titleSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(title, width / 2, height / 2 - (subtitle ? 20 : 0));
    ctx.fillStyle = titleColor;
    ctx.fillText(title, width / 2, height / 2 - (subtitle ? 20 : 0));
  }

  // Subtitle
  if (subtitle) {
    ctx.font = `${subtitleSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = subtitleColor;
    ctx.fillText(subtitle, width / 2, height / 2 + 24);
  }

  ctx.restore();
}

/**
 * Draw a rounded rectangle path (does not fill/stroke — caller does that).
 */
export function drawRoundRect(ctx, x, y, w, h, radius = 8) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Format a number with commas: 1234567 → "1,234,567"
 */
export function formatScore(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── Color Palette (exported for convenience) ────────────────────────────────

export const COLORS = Object.freeze({
  GOLD: '#D4A84B',
  DARK: '#1A1A2E',
  RED: '#E74C3C',
  BLUE: '#3498DB',
  WHITE: '#FFFFFF',
  LIGHT_GOLD: '#F0D78C',
  DARK_RED: '#C0392B'
});
