/**
 * 王者荣耀 Mini-Game Collection — LocalStorage Leaderboard System
 */

import { getCurrentSeason } from './season.js';

const MAX_ENTRIES = 20;

function storageKey(gameId, seasonId) {
  return `wz_lb_${gameId}_${seasonId}`;
}

function historyKey(gameId) {
  return `wz_lb_history_${gameId}`;
}

function load(gameId, seasonId) {
  try {
    const raw = localStorage.getItem(storageKey(gameId, seasonId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(gameId, seasonId, entries) {
  localStorage.setItem(storageKey(gameId, seasonId), JSON.stringify(entries));
}

function assignRanks(entries) {
  return entries
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

/**
 * Get the leaderboard for a game.
 * @param {string} gameId
 * @param {string} [seasonId] — defaults to current season
 * @returns {{ rank: number, name: string, score: number, heroId: number, date: string }[]}
 */
export function getLeaderboard(gameId, seasonId) {
  const sid = seasonId ?? getCurrentSeason().id;
  return assignRanks(load(gameId, sid));
}

/**
 * Add a score to the leaderboard.
 * @param {string} gameId
 * @param {number} score
 * @param {number} heroId
 * @param {string} [playerName="玩家"]
 * @returns {{ rank: number, name: string, score: number, heroId: number, date: string }}
 */
export function addScore(gameId, score, heroId, playerName = '玩家') {
  const season = getCurrentSeason();
  const entries = load(gameId, season.id);

  const entry = {
    name: playerName,
    score,
    heroId,
    date: new Date().toISOString(),
  };

  entries.push(entry);
  const ranked = assignRanks(entries);
  save(gameId, season.id, ranked);

  // Find the entry we just added (match by date since it's unique enough)
  const added = ranked.find(
    (e) => e.date === entry.date && e.score === entry.score
  );
  return added ?? { ...entry, rank: ranked.length + 1 };
}

/**
 * Check whether a score would make the top 20.
 * @param {string} gameId
 * @param {number} score
 * @returns {boolean}
 */
export function isHighScore(gameId, score) {
  const board = getLeaderboard(gameId);
  if (board.length < MAX_ENTRIES) return true;
  return score > board[board.length - 1].score;
}

/**
 * Get the player's personal best for a game (current season).
 * @param {string} gameId
 * @returns {{ rank: number, name: string, score: number, heroId: number, date: string } | null}
 */
export function getPersonalBest(gameId) {
  const board = getLeaderboard(gameId);
  // Since we don't track unique players with auth, return the #1 entry
  return board.length > 0 ? board[0] : null;
}

/**
 * Clear all leaderboard entries for a game (current season).
 * @param {string} gameId
 */
export function clearLeaderboard(gameId) {
  const season = getCurrentSeason();
  localStorage.removeItem(storageKey(gameId, season.id));
}

/**
 * Get past season leaderboard snapshots.
 * @param {string} gameId
 * @returns {{ seasonId: string, entries: object[] }[]}
 */
export function getSeasonHistory(gameId) {
  try {
    const raw = localStorage.getItem(historyKey(gameId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Archive the current leaderboard into season history.
 * @param {string} gameId
 * @param {string} seasonId
 */
export function archiveSeason(gameId, seasonId) {
  const entries = load(gameId, seasonId);
  if (entries.length === 0) return;

  const history = getSeasonHistory(gameId);

  // Don't archive the same season twice
  if (history.some((h) => h.seasonId === seasonId)) return;

  history.push({ seasonId, entries: assignRanks(entries) });
  localStorage.setItem(historyKey(gameId), JSON.stringify(history));
}
