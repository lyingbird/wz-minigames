/**
 * heroes.js — Honor of Kings (王者荣耀) hero data module
 *
 * Fetches hero data from the official API and provides image loading
 * utilities for mini-games. Includes caching, fallback, and graceful
 * degradation when CDN is slow or unreachable.
 *
 * Pure ES6 module, no dependencies.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = 'https://pvp.qq.com/web201605/js/herolist.json';
const AVATAR_BASE = 'https://game.gtimg.cn/images/yxzj/img201606/heroimg';
const SKIN_BASE = 'https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info';

const CACHE_KEY = 'heroes_cache';
const CACHE_TS_KEY = 'heroes_cache_ts';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const IMAGE_TIMEOUT = 5000; // 5 seconds

/** Hero type mapping */
export const HERO_TYPES = {
  1: '战士',  // Warrior
  2: '法师',  // Mage
  3: '坦克',  // Tank
  4: '刺客',  // Assassin
  5: '射手',  // Marksman
  6: '辅助',  // Support
};

/**
 * Unified 3-category color semantic (used across ALL games for target borders):
 *   DANGER  = red    → don't touch (bombs, allies, hazards)
 *   VALUE   = gold   → go grab it (high-score targets, tanks, rare heroes)
 *   SPECIAL = cyan   → power-up (buffs, treasure, special effects)
 *   DEFAULT = grey   → low-value/common (minions, basic targets)
 */
export const TARGET_COLORS = {
  DANGER:  '#E74C3C',
  VALUE:   '#FFD700',
  SPECIAL: '#1ABC9C',
  DEFAULT: '#8899AA',
};

/**
 * Hero ability flavor — subtle gameplay effects when a hero appears as a target.
 * Each hero has a short passive that doesn't break core gameplay but adds character.
 */
export const HERO_ABILITIES = {
  109: { name: '妲己', passive: 'charm',     desc: '被击中时，附近目标短暂减速' },
  107: { name: '赵云', passive: 'charge',    desc: '会突然加速冲刺' },
  112: { name: '鲁班', passive: 'tiny',      desc: '体型小移动快，难以命中' },
  150: { name: '韩信', passive: 'dash',      desc: '会突然变向闪避' },
  166: { name: '亚瑟', passive: 'shield',    desc: '有护盾，需要命中两次' },
  142: { name: '安琪拉', passive: 'fire',    desc: '经过的路径留下火焰区域' },
  167: { name: '孙悟空', passive: 'clone',   desc: '偶尔分裂出分身（假目标）' },
  113: { name: '庄周', passive: 'immune',    desc: '短暂免疫一次钩取/切割' },
  105: { name: '廉颇', passive: 'heavy',     desc: '极重极慢，但分值最高' },
  199: { name: '公孙离', passive: 'blink',   desc: '被接近时会短距传送' },
};

/** Key hero constants used across mini-games */
export const GAME_HEROES = {
  // Main playable heroes (one per game)
  DIAOCHAN: 141,    // 貂蝉 - Dodge game protagonist
  ZHONGKUI: 175,    // 钟馗 - Hook game protagonist
  LANLINGWANG: 153, // 兰陵王 - Slash game protagonist
  MARKOPOLO: 132,   // 马可波罗 - Shoot game protagonist
  LIBAI: 131,       // 李白 - Rhythm game protagonist

  // Common target heroes (used across games)
  DAJI: 109,        // 妲己
  ZHAOYUN: 107,     // 赵云
  LUBAN: 112,       // 鲁班七号
  HANXIN: 150,      // 韩信
  YASE: 166,        // 亚瑟
  ANQILA: 142,      // 安琪拉
  SUNWUKONG: 167,   // 孙悟空
  ZHUANGZHOU: 113,  // 庄周
  LIANPO: 105,      // 廉颇
  GONGSUNLI: 199,   // 公孙离
};

// ---------------------------------------------------------------------------
// Hardcoded fallback (minimum viable data when API + cache both unavailable)
// ---------------------------------------------------------------------------

const FALLBACK_HEROES = [
  { ename: 141, cname: '貂蝉',     hero_type: 2, title: '离殇之舞',   id_name: 'diaochan',    skin_name: '离殇之舞' },
  { ename: 175, cname: '钟馗',     hero_type: 2, title: '驱傩正仪',   id_name: 'zhongkui',    skin_name: '驱傩正仪' },
  { ename: 153, cname: '兰陵王',   hero_type: 4, title: '秘密潜入',   id_name: 'lanlingwang', skin_name: '秘密潜入' },
  { ename: 132, cname: '马可波罗', hero_type: 5, title: '远游之枪',   id_name: 'makeboluo',   skin_name: '远游之枪' },
  { ename: 131, cname: '李白',     hero_type: 4, title: '青莲剑仙',   id_name: 'libai',       skin_name: '青莲剑仙' },
  { ename: 109, cname: '妲己',     hero_type: 2, title: '魅力之狐',   id_name: 'daji',        skin_name: '魅惑之狐' },
  { ename: 107, cname: '赵云',     hero_type: 1, title: '常山之龙',   id_name: 'zhaoyun',     skin_name: '常山之龙' },
  { ename: 112, cname: '鲁班七号', hero_type: 5, title: '机关造物',   id_name: 'lubanqihao',  skin_name: '机关造物' },
  { ename: 150, cname: '韩信',     hero_type: 4, title: '国士无双',   id_name: 'hanxin',      skin_name: '国士无双' },
  { ename: 166, cname: '亚瑟',     hero_type: 1, title: '圣光守护',   id_name: 'yase',        skin_name: '圣光守护' },
  { ename: 142, cname: '安琪拉',   hero_type: 2, title: '暗夜萝莉',   id_name: 'anqila',      skin_name: '暗夜萝莉' },
  { ename: 167, cname: '孙悟空',   hero_type: 1, title: '齐天大圣',   id_name: 'sunwukong',   skin_name: '齐天大圣' },
  { ename: 113, cname: '庄周',     hero_type: 6, title: '梦蝶',       id_name: 'zhuangzhou',  skin_name: '梦蝶' },
  { ename: 105, cname: '廉颇',     hero_type: 3, title: '正义爆轰',   id_name: 'lianpo',      skin_name: '正义爆轰' },
  { ename: 199, cname: '公孙离',   hero_type: 5, title: '舞铃玲珑',   id_name: 'gongsunli',   skin_name: '舞铃玲珑' },
];

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** In-memory hero list cache (array of hero objects) */
let heroListCache = null;

/** ename -> hero lookup map */
let heroMap = null;

/** ename -> Image element cache for preloaded avatars */
const avatarImageCache = new Map();

/** "ename-skinIndex" -> Image element cache for preloaded skins */
const skinImageCache = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the ename -> hero lookup map from an array of hero objects.
 */
function buildHeroMap(heroes) {
  const map = new Map();
  for (const hero of heroes) {
    map.set(hero.ename, hero);
  }
  return map;
}

/**
 * Read hero list from localStorage if still within TTL.
 * Returns the parsed array or null.
 */
function readLocalCache() {
  try {
    const ts = Number(localStorage.getItem(CACHE_TS_KEY));
    if (!ts || Date.now() - ts > CACHE_TTL) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist hero list to localStorage with current timestamp.
 */
function writeLocalCache(heroes) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(heroes));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {
    // localStorage may be full or unavailable — ignore silently
  }
}

/**
 * Fetch with timeout wrapper.
 */
function fetchWithTimeout(url, timeoutMs = IMAGE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Fetch timeout: ${url}`));
    }, timeoutMs);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Load a single image with timeout. Resolves with the Image element,
 * or rejects on error / timeout.
 */
function loadImage(url, timeoutMs = IMAGE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Image load timeout: ${url}`));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Image load failed: ${url}`));
    };
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

/**
 * Create a fallback placeholder canvas-image: a colored circle with the
 * first character of the hero name drawn in the center.
 * Returns an HTMLCanvasElement (usable anywhere an Image is expected).
 */
function createPlaceholder(heroName, size = 100) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deterministic colour from hero name
  let hash = 0;
  for (let i = 0; i < heroName.length; i++) {
    hash = heroName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;

  // Draw circle
  ctx.fillStyle = `hsl(${hue}, 55%, 50%)`;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw first character
  const char = heroName.charAt(0) || '?';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(size * 0.48)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, size / 2, size / 2);

  return canvas;
}

// ---------------------------------------------------------------------------
// Image URL helpers
// ---------------------------------------------------------------------------

/**
 * Get the 100x100 avatar URL for a hero.
 * @param {number} ename
 * @returns {string}
 */
export function getAvatarUrl(ename) {
  return `${AVATAR_BASE}/${ename}/${ename}.jpg`;
}

/**
 * Get the skin splash URL for a hero.
 * @param {number} ename
 * @param {number} skinIndex — starts at 1
 * @returns {string}
 */
export function getSkinUrl(ename, skinIndex = 1) {
  return `${SKIN_BASE}/${ename}/${ename}-bigskin-${skinIndex}.jpg`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Fetch the full hero list from the official API, with layered fallback:
 *   1. In-memory cache (instant)
 *   2. API fetch (cached to memory + localStorage on success)
 *   3. localStorage cache (even if expired)
 *   4. Hardcoded FALLBACK_HEROES
 *
 * @returns {Promise<Array>} — always resolves with a hero array
 */
export async function loadHeroList() {
  // 1. Already in memory
  if (heroListCache) return heroListCache;

  // 2. Fresh localStorage cache
  const localData = readLocalCache();
  if (localData) {
    heroListCache = localData;
    heroMap = buildHeroMap(localData);
    // Still attempt a background refresh from API (non-blocking)
    _backgroundRefresh();
    return heroListCache;
  }

  // 3. Fetch from API
  try {
    const res = await fetchWithTimeout(API_URL, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      heroListCache = data;
      heroMap = buildHeroMap(data);
      writeLocalCache(data);
      return heroListCache;
    }
    throw new Error('Empty hero list from API');
  } catch (err) {
    console.warn('[heroes] API fetch failed, falling back:', err.message);
  }

  // 4. Expired localStorage (better than nothing)
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        heroListCache = parsed;
        heroMap = buildHeroMap(parsed);
        return heroListCache;
      }
    }
  } catch {
    // ignore
  }

  // 5. Hardcoded fallback
  console.warn('[heroes] Using hardcoded fallback hero list');
  heroListCache = FALLBACK_HEROES;
  heroMap = buildHeroMap(FALLBACK_HEROES);
  return heroListCache;
}

/**
 * Non-blocking background refresh so stale-while-revalidate works.
 */
function _backgroundRefresh() {
  fetchWithTimeout(API_URL, 8000)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        heroListCache = data;
        heroMap = buildHeroMap(data);
        writeLocalCache(data);
      }
    })
    .catch(() => {
      // Silent — we already have data to work with
    });
}

// ---------------------------------------------------------------------------
// Hero queries
// ---------------------------------------------------------------------------

/**
 * Get a single hero object by ename.
 * Requires loadHeroList() to have been called (or calls it automatically).
 *
 * @param {number} ename
 * @returns {Promise<Object|null>}
 */
export async function getHeroById(ename) {
  if (!heroMap) await loadHeroList();
  return heroMap.get(Number(ename)) || null;
}

/**
 * Get all heroes of a given type.
 * @param {number} typeId — 1-6, see HERO_TYPES
 * @returns {Promise<Array>}
 */
export async function getHeroesByType(typeId) {
  if (!heroListCache) await loadHeroList();
  return heroListCache.filter((h) => h.hero_type === typeId);
}

/**
 * Pick `count` random heroes from the full list.
 * @param {number} count
 * @param {number[]} [excludeIds] — enames to exclude
 * @returns {Promise<Array>}
 */
export async function getRandomHeroes(count, excludeIds = []) {
  if (!heroListCache) await loadHeroList();

  const excludeSet = new Set(excludeIds.map(Number));
  const pool = heroListCache.filter((h) => !excludeSet.has(h.ename));

  if (pool.length <= count) return [...pool];

  // Fisher-Yates partial shuffle
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0 && shuffled.length - i <= count; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(-count);
}

// ---------------------------------------------------------------------------
// Image preloading
// ---------------------------------------------------------------------------

/**
 * Preload avatar images for the given enames.
 * Successfully loaded images are stored in an internal cache retrievable
 * via getAvatarImage(). Failed images get a placeholder canvas instead.
 *
 * @param {number[]} enameArray
 * @returns {Promise<void>} — resolves when all loading attempts finish
 */
export async function preloadAvatars(enameArray) {
  const tasks = enameArray.map(async (ename) => {
    if (avatarImageCache.has(ename)) return; // already loaded
    try {
      const img = await loadImage(getAvatarUrl(ename));
      avatarImageCache.set(ename, img);
    } catch {
      // Create placeholder fallback
      const hero = heroMap ? heroMap.get(Number(ename)) : null;
      const name = hero ? hero.cname : String(ename);
      avatarImageCache.set(ename, createPlaceholder(name));
    }
  });
  await Promise.all(tasks);
}

/**
 * Get a cached avatar Image (or placeholder canvas).
 * Returns null if preloadAvatars() has not been called for this ename.
 *
 * @param {number} ename
 * @returns {HTMLImageElement|HTMLCanvasElement|null}
 */
export function getAvatarImage(ename) {
  return avatarImageCache.get(Number(ename)) || null;
}

/**
 * Preload a single skin splash image.
 * On failure a placeholder is cached instead.
 *
 * @param {number} ename
 * @param {number} skinIndex — starts at 1
 * @returns {Promise<void>}
 */
export async function preloadSkin(ename, skinIndex = 1) {
  const key = `${ename}-${skinIndex}`;
  if (skinImageCache.has(key)) return;
  try {
    const img = await loadImage(getSkinUrl(ename, skinIndex));
    skinImageCache.set(key, img);
  } catch {
    const hero = heroMap ? heroMap.get(Number(ename)) : null;
    const name = hero ? hero.cname : String(ename);
    skinImageCache.set(key, createPlaceholder(name, 200));
  }
}

/**
 * Get a cached skin Image (or placeholder canvas).
 * @param {number} ename
 * @param {number} skinIndex
 * @returns {HTMLImageElement|HTMLCanvasElement|null}
 */
export function getSkinImage(ename, skinIndex = 1) {
  return skinImageCache.get(`${ename}-${skinIndex}`) || null;
}

// ---------------------------------------------------------------------------
// Q-version (chibi) hero drawing
// ---------------------------------------------------------------------------

/**
 * Draw a Q-version Lian Po (廉颇) character on a canvas context.
 * Chunky tank with white hair, blue armor, gold trim, big shield.
 * All coordinates relative to S x S canvas.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} S - canvas size (width & height)
 */
function drawLianPoQVersion(c, S) {
  const cx = S / 2;

  // Ground shadow
  c.save();
  c.globalAlpha = 0.25;
  c.fillStyle = '#000';
  c.beginPath();
  c.ellipse(cx, S * 0.93, S * 0.32, S * 0.05, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // Stubby legs
  const legY = S * 0.82;
  const legR = S * 0.06;
  c.fillStyle = '#2C5282';
  c.beginPath(); c.arc(cx - S * 0.1, legY, legR, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1A3A5C'; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(cx + S * 0.1, legY, legR, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#D4A84B';
  c.beginPath(); c.ellipse(cx - S * 0.1, legY + legR * 0.5, legR * 0.8, legR * 0.35, 0, 0, Math.PI); c.fill();
  c.beginPath(); c.ellipse(cx + S * 0.1, legY + legR * 0.5, legR * 0.8, legR * 0.35, 0, 0, Math.PI); c.fill();

  // Shield (left side)
  const shX = cx - S * 0.34, shY = S * 0.52, shW = S * 0.18, shH = S * 0.32, shR = S * 0.03;
  const shGrad = c.createLinearGradient(shX - shW / 2, shY, shX + shW / 2, shY);
  shGrad.addColorStop(0, '#2C5282'); shGrad.addColorStop(0.5, '#3B6BA5'); shGrad.addColorStop(1, '#2C5282');
  c.beginPath();
  c.moveTo(shX - shW / 2 + shR, shY - shH / 2);
  c.lineTo(shX + shW / 2 - shR, shY - shH / 2);
  c.arcTo(shX + shW / 2, shY - shH / 2, shX + shW / 2, shY - shH / 2 + shR, shR);
  c.lineTo(shX + shW / 2, shY + shH / 2 - shR);
  c.arcTo(shX + shW / 2, shY + shH / 2, shX + shW / 2 - shR, shY + shH / 2, shR);
  c.lineTo(shX - shW / 2 + shR, shY + shH / 2);
  c.arcTo(shX - shW / 2, shY + shH / 2, shX - shW / 2, shY + shH / 2 - shR, shR);
  c.lineTo(shX - shW / 2, shY - shH / 2 + shR);
  c.arcTo(shX - shW / 2, shY - shH / 2, shX - shW / 2 + shR, shY - shH / 2, shR);
  c.closePath();
  c.fillStyle = shGrad; c.fill();
  c.strokeStyle = '#D4A84B'; c.lineWidth = S * 0.02; c.stroke();
  c.strokeStyle = '#D4A84B'; c.lineWidth = S * 0.015;
  c.beginPath(); c.moveTo(shX, shY - shH * 0.3); c.lineTo(shX, shY + shH * 0.3);
  c.moveTo(shX - shW * 0.3, shY); c.lineTo(shX + shW * 0.3, shY); c.stroke();

  // Body (chunky ellipse)
  const bodyX = cx, bodyY = S * 0.62, bodyW = S * 0.32, bodyH = S * 0.24;
  const bodyGrad = c.createLinearGradient(bodyX, bodyY - bodyH, bodyX, bodyY + bodyH);
  bodyGrad.addColorStop(0, '#4A7FB5'); bodyGrad.addColorStop(0.4, '#3B6BA5'); bodyGrad.addColorStop(1, '#2C5282');
  c.beginPath(); c.ellipse(bodyX, bodyY, bodyW, bodyH, 0, 0, Math.PI * 2);
  c.fillStyle = bodyGrad; c.fill();
  c.strokeStyle = '#1A3A5C'; c.lineWidth = S * 0.015; c.stroke();

  // Gold belt
  const beltY2 = bodyY - bodyH * 0.05;
  const beltHW = bodyW * 0.95;
  c.fillStyle = '#D4A84B';
  c.beginPath();
  c.moveTo(bodyX - beltHW, beltY2 - S * 0.02);
  c.quadraticCurveTo(bodyX, beltY2 - S * 0.03, bodyX + beltHW, beltY2 - S * 0.02);
  c.lineTo(bodyX + beltHW, beltY2 + S * 0.02);
  c.quadraticCurveTo(bodyX, beltY2 + S * 0.01, bodyX - beltHW, beltY2 + S * 0.02);
  c.closePath(); c.fill();
  c.fillStyle = '#EAC85B';
  c.beginPath(); c.arc(bodyX, beltY2, S * 0.025, 0, Math.PI * 2); c.fill();

  // Arms
  const armR = S * 0.055;
  c.fillStyle = '#3B6BA5';
  c.beginPath(); c.arc(cx + S * 0.3, bodyY + bodyH * 0.1, armR, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1A3A5C'; c.lineWidth = 1; c.stroke();
  c.fillStyle = '#F5D0A9';
  c.beginPath(); c.arc(cx + S * 0.33, bodyY + bodyH * 0.2, armR * 0.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3B6BA5';
  c.beginPath(); c.arc(cx - S * 0.26, bodyY + bodyH * 0.05, armR, 0, Math.PI * 2); c.fill();

  // Head (BIG for Q-version)
  const headR = S * 0.23, headCy = S * 0.32;
  c.beginPath(); c.arc(cx + 1, headCy + 2, headR + 1, 0, Math.PI * 2);
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.fill();
  const skinGrad = c.createRadialGradient(cx - headR * 0.2, headCy - headR * 0.2, 0, cx, headCy, headR);
  skinGrad.addColorStop(0, '#FDDCB5'); skinGrad.addColorStop(0.7, '#F5D0A9'); skinGrad.addColorStop(1, '#E8B88A');
  c.beginPath(); c.arc(cx, headCy, headR, 0, Math.PI * 2);
  c.fillStyle = skinGrad; c.fill();
  c.strokeStyle = '#C9956B'; c.lineWidth = S * 0.012; c.stroke();

  // Eyebrows (thick white, angled = stern)
  c.strokeStyle = '#E8E8E8'; c.lineWidth = S * 0.03; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - headR * 0.55, headCy - headR * 0.22); c.lineTo(cx - headR * 0.15, headCy - headR * 0.08); c.stroke();
  c.beginPath(); c.moveTo(cx + headR * 0.55, headCy - headR * 0.22); c.lineTo(cx + headR * 0.15, headCy - headR * 0.08); c.stroke();

  // Eyes (small determined dots)
  c.fillStyle = '#1A1A2E';
  c.beginPath(); c.arc(cx - headR * 0.3, headCy + headR * 0.02, S * 0.025, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx + headR * 0.3, headCy + headR * 0.02, S * 0.025, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(cx - headR * 0.28, headCy - headR * 0.01, S * 0.01, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx + headR * 0.32, headCy - headR * 0.01, S * 0.01, 0, Math.PI * 2); c.fill();

  // Mouth
  c.strokeStyle = '#8B5E3C'; c.lineWidth = S * 0.012;
  c.beginPath(); c.moveTo(cx - headR * 0.18, headCy + headR * 0.32); c.lineTo(cx + headR * 0.18, headCy + headR * 0.32); c.stroke();

  // White beard
  c.strokeStyle = '#D8D8D8'; c.lineWidth = S * 0.02;
  c.beginPath(); c.arc(cx, headCy + headR * 0.45, headR * 0.2, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
  c.lineWidth = S * 0.015;
  c.beginPath(); c.arc(cx, headCy + headR * 0.52, headR * 0.13, Math.PI * 0.2, Math.PI * 0.8); c.stroke();

  // Blush
  c.save(); c.globalAlpha = 0.18; c.fillStyle = '#E8888A';
  c.beginPath(); c.ellipse(cx - headR * 0.48, headCy + headR * 0.18, S * 0.03, S * 0.02, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx + headR * 0.48, headCy + headR * 0.18, S * 0.03, S * 0.02, 0, 0, Math.PI * 2); c.fill();
  c.restore();

  // Spiky white hair
  c.fillStyle = '#E8E8E8'; c.strokeStyle = '#C8C8C8'; c.lineWidth = 0.8;
  const hairBase = headCy - headR * 0.65;
  const spikes = [
    { x: cx - headR * 0.4, tipX: cx - headR * 0.55, tipY: hairBase - S * 0.07 },
    { x: cx - headR * 0.15, tipX: cx - headR * 0.2, tipY: hairBase - S * 0.11 },
    { x: cx + headR * 0.1, tipX: cx + headR * 0.05, tipY: hairBase - S * 0.12 },
    { x: cx + headR * 0.35, tipX: cx + headR * 0.45, tipY: hairBase - S * 0.08 },
  ];
  for (const spike of spikes) {
    c.beginPath();
    c.moveTo(spike.x - S * 0.04, hairBase + S * 0.02);
    c.lineTo(spike.tipX, spike.tipY);
    c.lineTo(spike.x + S * 0.04, hairBase + S * 0.02);
    c.closePath(); c.fill(); c.stroke();
  }

  // Helmet headband
  const hbY = headCy - headR * 0.52;
  c.fillStyle = '#3B6BA5';
  c.beginPath();
  c.arc(cx, headCy, headR + 1, -Math.PI * 0.82, -Math.PI * 0.18);
  c.lineTo(cx + headR * Math.cos(-Math.PI * 0.18), hbY + S * 0.04);
  c.arc(cx, headCy, headR - S * 0.04, -Math.PI * 0.18, -Math.PI * 0.82, true);
  c.closePath(); c.fill();
  c.strokeStyle = '#D4A84B'; c.lineWidth = S * 0.015;
  c.beginPath(); c.arc(cx, headCy, headR - S * 0.005, -Math.PI * 0.8, -Math.PI * 0.2); c.stroke();
  c.fillStyle = '#EAC85B';
  c.beginPath(); c.arc(cx, hbY + S * 0.005, S * 0.02, 0, Math.PI * 2); c.fill();

  // Forehead highlight
  c.save(); c.globalAlpha = 0.35; c.fillStyle = '#fff';
  c.beginPath(); c.arc(cx - headR * 0.15, headCy - headR * 0.4, S * 0.018, 0, Math.PI * 2); c.fill();
  c.restore();
}

/**
 * Create an offscreen canvas with a Q-version hero character drawn on it.
 * Currently only Lian Po (105) has a custom Q-version drawing.
 * Other heroes fall back to their avatar image rendered in a circle.
 *
 * @param {number} ename - hero ID
 * @param {number} size - canvas width & height in pixels
 * @returns {HTMLCanvasElement}
 */
export function createQHeroCanvas(ename, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (Number(ename) === 105) {
    drawLianPoQVersion(ctx, size);
  } else {
    // Fallback: draw avatar image in circle if available
    const img = getAvatarImage(Number(ename));
    if (img) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
    } else {
      // Use placeholder if no image loaded
      const hero = heroMap ? heroMap.get(Number(ename)) : null;
      const name = hero ? hero.cname : String(ename);
      const placeholder = createPlaceholder(name, size);
      ctx.drawImage(placeholder, 0, 0);
    }
  }
  return canvas;
}

/**
 * Draw a Q-version hero on a provided canvas context.
 * Convenience wrapper — delegates to createQHeroCanvas internally
 * or draws directly for known heroes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ename - hero ID
 * @param {number} size - draw area size
 */
export function drawQHero(ctx, ename, size) {
  if (Number(ename) === 105) {
    drawLianPoQVersion(ctx, size);
  } else {
    const img = getAvatarImage(Number(ename));
    if (img) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
    }
  }
}
