/**
 * 王者荣耀 Mini-Game Collection — LocalStorage Leaderboard System
 *
 * Daily reset leaderboards + all-time best + personal best tracking.
 * No external dependencies.
 */

const DAILY_MAX = 5;
const ALLTIME_MAX = 10;
const KEEP_DAYS = 7;
const DEFAULT_NAME = '无名侠客';

// ─── Date helpers ──────────────────────────────────────────────

function formatDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getTodayStr() {
  return formatDate(new Date());
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// ─── Storage key helpers ───────────────────────────────────────

function dailyKey(gameId, dateStr) {
  return `wz_lb_${gameId}_${dateStr}`;
}

function alltimeKey(gameId) {
  return `wz_lb_${gameId}_alltime`;
}

function personalBestKey(gameId) {
  return `wz_pb_${gameId}`;
}

// ─── Low-level storage ─────────────────────────────────────────

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJSON(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage full — silently fail
  }
}

// ─── Board operations ──────────────────────────────────────────

function loadBoard(key) {
  return loadJSON(key) || [];
}

function saveBoard(key, entries, max) {
  const sorted = entries
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  saveJSON(key, sorted);
  return sorted;
}

function rankEntries(entries) {
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ─── Player name ───────────────────────────────────────────────

/**
 * Get the stored player name.
 * @returns {string}
 */
export function getPlayerName() {
  return localStorage.getItem('wz_player_name') || DEFAULT_NAME;
}

/**
 * Set and persist the player name.
 * @param {string} name
 */
export function setPlayerName(name) {
  const trimmed = (name || '').trim();
  localStorage.setItem('wz_player_name', trimmed || DEFAULT_NAME);
}

// ─── Daily leaderboard ────────────────────────────────────────

/**
 * Get today's leaderboard (top 5).
 * @param {string} gameId
 * @returns {{ rank: number, name: string, score: number, date: string }[]}
 */
export function getLeaderboard(gameId) {
  const key = dailyKey(gameId, getTodayStr());
  const entries = loadBoard(key).slice(0, DAILY_MAX);
  return rankEntries(entries);
}

/**
 * Check if a score would make today's top 5.
 * @param {string} gameId
 * @param {number} score
 * @returns {boolean}
 */
export function isTopScore(gameId, score) {
  const board = loadBoard(dailyKey(gameId, getTodayStr()));
  if (board.length < DAILY_MAX) return true;
  return score > board[board.length - 1].score;
}

// ─── All-time leaderboard ─────────────────────────────────────

/**
 * Get the all-time best leaderboard (top 10).
 * @param {string} gameId
 * @returns {{ rank: number, name: string, score: number, date: string }[]}
 */
export function getAllTimeBest(gameId) {
  const entries = loadBoard(alltimeKey(gameId)).slice(0, ALLTIME_MAX);
  return rankEntries(entries);
}

/**
 * Check if a score would make the all-time top 10.
 * @param {string} gameId
 * @param {number} score
 * @returns {boolean}
 */
export function isAllTimeBest(gameId, score) {
  const board = loadBoard(alltimeKey(gameId));
  if (board.length < ALLTIME_MAX) return true;
  return score > board[board.length - 1].score;
}

// ─── Personal best ────────────────────────────────────────────

/**
 * Get the personal best for this device.
 * @param {string} gameId
 * @returns {{ score: number, date: string } | null}
 */
export function getPersonalBest(gameId) {
  return loadJSON(personalBestKey(gameId));
}

/**
 * Update personal best if the new score is higher.
 * @param {string} gameId
 * @param {number} score
 * @returns {boolean} whether it was a new personal best
 */
function updatePersonalBest(gameId, score) {
  const current = getPersonalBest(gameId);
  if (current && current.score >= score) return false;
  saveJSON(personalBestKey(gameId), {
    score,
    date: new Date().toISOString(),
  });
  return true;
}

// ─── Add score ────────────────────────────────────────────────

/**
 * Add a score to both the daily and all-time leaderboards.
 * Also updates personal best.
 *
 * @param {string} gameId
 * @param {number} score
 * @param {string} [playerName] — defaults to stored name or "无名侠客"
 * @returns {{ rank: number, isNewDaily: boolean, isNewAllTime: boolean }}
 */
export function addScore(gameId, score, playerNameOrHeroId, legacyPlayerName) {
  // Backward compat: old signature was addScore(gameId, score, heroId, playerName)
  // where heroId is a number. Detect and skip the heroId.
  let rawName;
  if (typeof playerNameOrHeroId === 'number') {
    rawName = legacyPlayerName;
  } else {
    rawName = playerNameOrHeroId;
  }
  const name = (rawName || '').trim() || getPlayerName();
  const now = new Date().toISOString();
  const entry = { name, score, date: now };

  // Remember the name for next time
  setPlayerName(name);

  // --- Daily board ---
  const todayK = dailyKey(gameId, getTodayStr());
  const dailyEntries = loadBoard(todayK);
  dailyEntries.push({ ...entry });
  const dailySorted = saveBoard(todayK, dailyEntries, DAILY_MAX);
  const dailyIdx = dailySorted.findIndex(e => e.date === now && e.score === score);
  const isNewDaily = dailyIdx !== -1;
  const dailyRank = isNewDaily ? dailyIdx + 1 : -1;

  // --- All-time board ---
  const atKey = alltimeKey(gameId);
  const atEntries = loadBoard(atKey);
  atEntries.push({ ...entry });
  const atSorted = saveBoard(atKey, atEntries, ALLTIME_MAX);
  const atIdx = atSorted.findIndex(e => e.date === now && e.score === score);
  const isNewAllTime = atIdx !== -1;

  // --- Personal best ---
  updatePersonalBest(gameId, score);

  // The rank returned is the daily rank if it made the board, otherwise
  // we compute a virtual rank (position it would be in).
  let rank;
  if (isNewDaily) {
    rank = dailyRank;
  } else {
    // Didn't make the cut — figure out where it would have been
    const allDaily = [...dailyEntries].sort((a, b) => b.score - a.score);
    const virtualIdx = allDaily.findIndex(e => e.date === now && e.score === score);
    rank = virtualIdx !== -1 ? virtualIdx + 1 : dailySorted.length + 1;
  }

  return { rank, isNewDaily, isNewAllTime };
}

// ─── Yesterday's board ────────────────────────────────────────

/**
 * Get yesterday's leaderboard (top 5). Returns null if none exists.
 * @param {string} gameId
 * @returns {{ rank: number, name: string, score: number }[] | null}
 */
export function getYesterdayBoard(gameId) {
  const key = dailyKey(gameId, getYesterdayStr());
  const entries = loadBoard(key);
  if (entries.length === 0) return null;
  return rankEntries(entries.slice(0, DAILY_MAX)).map(e => ({
    rank: e.rank,
    name: e.name,
    score: e.score,
  }));
}

// ─── Cleanup ──────────────────────────────────────────────────

/**
 * Remove daily boards older than 7 days to prevent localStorage bloat.
 * @param {string} gameId
 */
export function cleanupOldData(gameId) {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);

  const prefix = `wz_lb_${gameId}_`;
  const dateRe = /^(\d{4}-\d{2}-\d{2})$/;

  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    const suffix = key.slice(prefix.length);
    if (!dateRe.test(suffix)) continue; // skip "alltime" keys

    const entryDate = new Date(suffix + 'T00:00:00');
    if (entryDate < cutoff) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(k => localStorage.removeItem(k));
}

// ─── Backward compatibility aliases ───────────────────────────

/** @deprecated Use isTopScore instead */
export const isHighScore = isTopScore;
