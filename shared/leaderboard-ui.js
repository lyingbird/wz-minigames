/**
 * 王者荣耀 Mini-Game Collection — Leaderboard UI Components
 *
 * Reusable canvas + HTML overlay rendering for leaderboards.
 * Works on mobile H5. Uses real HTML inputs for text entry.
 */

import {
  getLeaderboard,
  getAllTimeBest,
  getPersonalBest,
  getPlayerName,
} from './leaderboard.js';

// ─── Color palette (dark + gold theme) ────────────────────────

const COLORS = {
  overlay:   'rgba(0, 0, 0, 0.75)',
  panelBg:   'rgba(15, 10, 30, 0.92)',
  border:    '#c8a24e',
  borderDim: '#8a6d2b',
  gold:      '#ffd700',
  silver:    '#c0c0c0',
  bronze:    '#cd7f32',
  text:      '#f0e6d2',
  textDim:   'rgba(240, 230, 210, 0.6)',
  highlight: 'rgba(255, 215, 0, 0.15)',
  rowEven:   'rgba(255, 255, 255, 0.04)',
  rowOdd:    'rgba(255, 255, 255, 0.02)',
  accent:    '#e8c96a',
  red:       '#ff6b6b',
  white:     '#ffffff',
};

const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];

// ─── Helpers ──────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawGoldBorder(ctx, x, y, w, h, r, lineWidth) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = lineWidth || 2;
  ctx.stroke();
}

function truncateName(ctx, name, maxWidth) {
  let display = name;
  while (ctx.measureText(display).width > maxWidth && display.length > 1) {
    display = display.slice(0, -1);
  }
  if (display !== name) display += '…';
  return display;
}

// ─── Nickname Input Modal ─────────────────────────────────────

/**
 * Show a nickname input modal overlaid on the canvas.
 * Uses real HTML elements for reliable mobile text input.
 *
 * @param {HTMLCanvasElement} canvas — the game canvas
 * @param {number} score — the score to display
 * @param {string} rankText — e.g. "今日第1名!" or "历史最佳!"
 * @returns {Promise<string>} resolves with the entered name
 */
export function showNicknameInput(canvas, score, rankText) {
  return new Promise(resolve => {
    const currentName = getPlayerName();

    // Overlay container
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.75);
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      animation: wzLbFadeIn 0.25s ease-out;
    `;

    // Panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 88vw; max-width: 340px;
      background: linear-gradient(180deg, #1a1230 0%, #0d0a1a 100%);
      border: 2px solid #c8a24e;
      border-radius: 16px;
      padding: 28px 24px 24px;
      box-shadow: 0 0 40px rgba(200,162,78,0.25), inset 0 1px 0 rgba(255,215,0,0.1);
      text-align: center;
      animation: wzLbSlideUp 0.3s ease-out;
    `;

    // Title with glow
    const title = document.createElement('div');
    title.textContent = rankText || '新纪录!';
    title.style.cssText = `
      font-size: 22px; font-weight: bold;
      color: #ffd700;
      text-shadow: 0 0 12px rgba(255,215,0,0.6), 0 0 24px rgba(255,215,0,0.3);
      margin-bottom: 12px;
      animation: wzLbGlow 1.5s ease-in-out infinite alternate;
    `;

    // Score
    const scoreEl = document.createElement('div');
    scoreEl.textContent = score.toLocaleString();
    scoreEl.style.cssText = `
      font-size: 40px; font-weight: bold;
      color: #ffd700;
      text-shadow: 0 2px 8px rgba(0,0,0,0.5);
      margin-bottom: 20px;
      letter-spacing: 2px;
    `;

    // Label
    const label = document.createElement('div');
    label.textContent = '输入你的昵称';
    label.style.cssText = `
      font-size: 13px; color: rgba(240,230,210,0.6);
      margin-bottom: 8px;
    `;

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    input.value = currentName;
    input.placeholder = '无名侠客';
    input.style.cssText = `
      width: 100%; box-sizing: border-box;
      padding: 12px 16px;
      font-size: 18px; text-align: center;
      color: #f0e6d2;
      background: rgba(255,255,255,0.08);
      border: 1.5px solid #8a6d2b;
      border-radius: 10px;
      outline: none;
      caret-color: #ffd700;
      font-family: inherit;
      transition: border-color 0.2s;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = '#c8a24e';
      input.select();
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#8a6d2b';
    });

    // Button
    const btn = document.createElement('button');
    btn.textContent = '确认';
    btn.style.cssText = `
      margin-top: 18px;
      width: 100%; padding: 14px 0;
      font-size: 17px; font-weight: bold;
      color: #1a1230;
      background: linear-gradient(180deg, #ffd700 0%, #c8a24e 100%);
      border: none; border-radius: 10px;
      cursor: pointer;
      font-family: inherit;
      box-shadow: 0 4px 12px rgba(200,162,78,0.3);
      transition: transform 0.1s, box-shadow 0.1s;
      -webkit-tap-highlight-color: transparent;
    `;
    btn.addEventListener('touchstart', () => {
      btn.style.transform = 'scale(0.97)';
    });
    btn.addEventListener('touchend', () => {
      btn.style.transform = 'scale(1)';
    });

    function confirm() {
      const name = input.value.trim() || '无名侠客';
      overlay.remove();
      styleTag.remove();
      resolve(name);
    }

    btn.addEventListener('click', confirm);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
    });

    // Assemble
    panel.appendChild(title);
    panel.appendChild(scoreEl);
    panel.appendChild(label);
    panel.appendChild(input);
    panel.appendChild(btn);
    overlay.appendChild(panel);

    // Inject keyframe animations
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      @keyframes wzLbFadeIn {
        from { opacity: 0; } to { opacity: 1; }
      }
      @keyframes wzLbSlideUp {
        from { opacity: 0; transform: translateY(30px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes wzLbGlow {
        from { text-shadow: 0 0 12px rgba(255,215,0,0.6), 0 0 24px rgba(255,215,0,0.3); }
        to   { text-shadow: 0 0 20px rgba(255,215,0,0.9), 0 0 40px rgba(255,215,0,0.5); }
      }
    `;
    document.head.appendChild(styleTag);
    document.body.appendChild(overlay);

    // Auto-focus with slight delay for mobile keyboards
    setTimeout(() => input.focus(), 100);
  });
}

// ─── Canvas Leaderboard Panel ─────────────────────────────────

/**
 * Render a full leaderboard panel on a canvas context.
 * Shows today's top 5, personal best, and all-time #1.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x — left edge
 * @param {number} y — top edge
 * @param {number} w — panel width
 * @param {number} h — panel height
 * @param {string} gameId
 * @param {object} [options]
 * @param {string} [options.title] — panel title (default: "今日排行")
 * @param {number} [options.highlightRank] — rank to highlight (1-based)
 * @param {string} [options.highlightName] — name to highlight
 * @param {boolean} [options.showAllTime] — show all-time #1 (default: true)
 * @param {boolean} [options.showPersonalBest] — show personal best (default: true)
 */
export function renderLeaderboard(ctx, x, y, w, h, gameId, options = {}) {
  const {
    title = '今日排行',
    highlightRank = -1,
    highlightName = '',
    showAllTime = true,
    showPersonalBest = true,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  const fontSize = Math.max(14, Math.round(w / 22));
  const smallFont = Math.max(11, Math.round(fontSize * 0.78));
  const rowH = Math.round(h / 10.5);
  const pad = Math.round(w * 0.05);

  ctx.save();

  // --- Panel background ---
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = COLORS.panelBg;
  ctx.fill();
  drawGoldBorder(ctx, x, y, w, h, 12, 2);

  // --- Title + date ---
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}月${today.getDate()}日`;
  ctx.textBaseline = 'middle';

  let cy = y + rowH * 0.7;
  ctx.font = `bold ${fontSize + 2}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + pad, cy);

  ctx.font = `${smallFont}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = COLORS.textDim;
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, x + w - pad, cy);

  // --- Divider ---
  cy += rowH * 0.55;
  ctx.beginPath();
  ctx.moveTo(x + pad, cy);
  ctx.lineTo(x + w - pad, cy);
  ctx.strokeStyle = COLORS.borderDim;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // --- Rows ---
  const board = getLeaderboard(gameId);
  const nameMaxW = w * 0.42;

  cy += rowH * 0.2;

  for (let i = 0; i < 5; i++) {
    const rowY = cy + i * rowH;
    const entry = board[i];
    const rank = i + 1;
    const isHighlighted =
      (highlightRank === rank) ||
      (highlightName && entry && entry.name === highlightName);

    // Row background
    if (isHighlighted) {
      roundRect(ctx, x + pad * 0.5, rowY, w - pad, rowH - 2, 6);
      ctx.fillStyle = COLORS.highlight;
      ctx.fill();
    } else {
      roundRect(ctx, x + pad * 0.5, rowY, w - pad, rowH - 2, 4);
      ctx.fillStyle = i % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
      ctx.fill();
    }

    const rowMid = rowY + rowH * 0.45;
    ctx.textBaseline = 'middle';

    // Rank number
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = i < 3 ? RANK_COLORS[i] : COLORS.textDim;
    ctx.fillText(rank, x + pad + fontSize * 0.6, rowMid);

    if (!entry) {
      // Empty slot
      ctx.textAlign = 'left';
      ctx.font = `${smallFont}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText('— 虚位以待 —', x + pad + fontSize * 1.8, rowMid);
      continue;
    }

    // Name
    ctx.textAlign = 'left';
    ctx.font = `${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = isHighlighted ? COLORS.gold : COLORS.text;
    const displayName = truncateName(ctx, entry.name, nameMaxW);
    ctx.fillText(displayName, x + pad + fontSize * 1.8, rowMid);

    // Score
    ctx.textAlign = 'right';
    ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = isHighlighted ? COLORS.gold : COLORS.accent;
    ctx.fillText(entry.score.toLocaleString(), x + w - pad, rowMid);
  }

  // --- Footer info ---
  let footerY = cy + 5 * rowH + rowH * 0.2;

  // Divider
  ctx.beginPath();
  ctx.moveTo(x + pad, footerY);
  ctx.lineTo(x + w - pad, footerY);
  ctx.strokeStyle = COLORS.borderDim;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  footerY += rowH * 0.5;
  ctx.font = `${smallFont}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textBaseline = 'middle';

  if (showPersonalBest) {
    const pb = getPersonalBest(gameId);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('我的最佳', x + pad, footerY);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(pb ? pb.score.toLocaleString() : '—', x + w - pad, footerY);
    footerY += rowH * 0.7;
  }

  if (showAllTime) {
    const atBoard = getAllTimeBest(gameId);
    const best = atBoard.length > 0 ? atBoard[0] : null;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('历史最佳', x + pad, footerY);
    ctx.textAlign = 'right';
    if (best) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillText(`${best.score.toLocaleString()}  ${best.name}`, x + w - pad, footerY);
    } else {
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText('—', x + w - pad, footerY);
    }
  }

  ctx.restore();
}

// ─── Mini Leaderboard (game-over screen) ──────────────────────

/**
 * Render a compact leaderboard (just a list of entries).
 * Ideal for game-over overlays.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x — left edge
 * @param {number} y — top edge
 * @param {number} w — width
 * @param {{ rank: number, name: string, score: number }[]} entries
 * @param {number} [highlightRank] — rank to highlight (1-based)
 */
export function renderMiniLeaderboard(ctx, x, y, w, entries, highlightRank = -1) {
  const fontSize = Math.max(13, Math.round(w / 20));
  const rowH = Math.round(fontSize * 2.2);
  const pad = Math.round(w * 0.04);
  const nameMaxW = w * 0.45;
  const totalH = entries.length * rowH + 8;

  ctx.save();

  // Background
  roundRect(ctx, x, y, w, totalH, 8);
  ctx.fillStyle = 'rgba(15, 10, 30, 0.85)';
  ctx.fill();
  drawGoldBorder(ctx, x, y, w, totalH, 8, 1.5);

  ctx.textBaseline = 'middle';

  entries.forEach((entry, i) => {
    const rowY = y + 4 + i * rowH;
    const rowMid = rowY + rowH * 0.5;
    const isHighlighted = entry.rank === highlightRank;

    // Highlight background
    if (isHighlighted) {
      roundRect(ctx, x + 3, rowY + 1, w - 6, rowH - 2, 5);
      ctx.fillStyle = COLORS.highlight;
      ctx.fill();
    }

    // Rank
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = i < 3 ? RANK_COLORS[i] : COLORS.textDim;
    ctx.fillText(entry.rank, x + pad + fontSize * 0.7, rowMid);

    // Name
    ctx.textAlign = 'left';
    ctx.font = `${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = isHighlighted ? COLORS.gold : COLORS.text;
    const displayName = truncateName(ctx, entry.name, nameMaxW);
    ctx.fillText(displayName, x + pad + fontSize * 2, rowMid);

    // Score
    ctx.textAlign = 'right';
    ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = isHighlighted ? COLORS.gold : COLORS.accent;
    ctx.fillText(entry.score.toLocaleString(), x + w - pad, rowMid);
  });

  ctx.restore();
}
