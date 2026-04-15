/**
 * 王者荣耀 Mini-Game Collection — Season / Theme Configuration
 */

const SEASONS = [
  {
    id: 'S1',
    name: '长安夜宴',
    description: '盛唐长安，群英荟萃',
    startDate: '2025-04-15',
    endDate: '2025-04-29',
    colorScheme: {
      primary: '#D4A84B',
      secondary: '#1A1A2E',
      accent: '#E74C3C',
      text: '#F5F5F5',
      highlight: '#FFD700',
    },
    heroPool: [109, 107, 112, 150, 166, 142, 167, 113, 105, 199],
    modifiers: {
      speedMultiplier: 1.0,
      scoreMultiplier: 1.0,
    },
  },
  {
    id: 'S2',
    name: '冰霜极地',
    description: '极寒之境，冰封万里',
    startDate: '2025-04-29',
    endDate: '2025-05-13',
    colorScheme: {
      primary: '#5BC0EB',
      secondary: '#0B1929',
      accent: '#A0E7FF',
      text: '#E8F4FD',
      highlight: '#00D4FF',
    },
    heroPool: [171, 146, 127, 180, 154, 183, 117, 129, 194, 161],
    modifiers: {
      speedMultiplier: 0.9,
      scoreMultiplier: 1.2,
    },
  },
  {
    id: 'S3',
    name: '烈焰战场',
    description: '烈焰焚天，浴火重生',
    startDate: '2025-05-13',
    endDate: '2025-05-27',
    colorScheme: {
      primary: '#FF4500',
      secondary: '#1A0A00',
      accent: '#FFB347',
      text: '#FFF0E0',
      highlight: '#FF6347',
    },
    heroPool: [141, 169, 136, 153, 110, 174, 157, 132, 184, 190],
    modifiers: {
      speedMultiplier: 1.2,
      scoreMultiplier: 1.0,
    },
  },
];

/** Duration of one full cycle of all seasons in milliseconds. */
const cycleDurationMs = (() => {
  const first = new Date(SEASONS[0].startDate).getTime();
  const last = new Date(SEASONS[SEASONS.length - 1].endDate).getTime();
  return last - first;
})();

/**
 * Get the current season based on today's date.
 * If all defined seasons have expired the calendar wraps (loops) back to S1.
 * @returns {object} season object
 */
export function getCurrentSeason() {
  const now = Date.now();
  const cycleStart = new Date(SEASONS[0].startDate).getTime();

  // Direct match first
  for (const season of SEASONS) {
    const start = new Date(season.startDate).getTime();
    const end = new Date(season.endDate).getTime();
    if (now >= start && now < end) {
      return { ...season };
    }
  }

  // All expired — loop: project current time into the cycle
  const elapsed = now - cycleStart;
  const offset = ((elapsed % cycleDurationMs) + cycleDurationMs) % cycleDurationMs;

  for (const season of SEASONS) {
    const sStart = new Date(season.startDate).getTime() - cycleStart;
    const sEnd = new Date(season.endDate).getTime() - cycleStart;
    if (offset >= sStart && offset < sEnd) {
      // Compute virtual start/end for this looped instance
      const cycleIndex = Math.floor((now - cycleStart) / cycleDurationMs);
      const base = cycleStart + cycleIndex * cycleDurationMs;
      return {
        ...season,
        _virtualStart: new Date(base + sStart).toISOString(),
        _virtualEnd: new Date(base + sEnd).toISOString(),
      };
    }
  }

  // Fallback (shouldn't happen)
  return { ...SEASONS[0] };
}

/**
 * Get the time remaining until the current season ends.
 * @returns {{ days: number, hours: number, minutes: number }}
 */
export function getSeasonTimeRemaining() {
  const season = getCurrentSeason();
  const endStr = season._virtualEnd ?? season.endDate;
  const end = new Date(endStr).getTime();
  const diff = Math.max(0, end - Date.now());

  const totalMinutes = Math.floor(diff / 60000);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  return { days, hours, minutes };
}

/**
 * Check whether the current season (as defined in static data) has ended.
 * Note: with looping this effectively checks if we're past all defined seasons.
 * @returns {boolean}
 */
export function isSeasonExpired() {
  const now = Date.now();
  const lastEnd = new Date(SEASONS[SEASONS.length - 1].endDate).getTime();
  return now >= lastEnd;
}

/**
 * Get all defined seasons.
 * @returns {object[]}
 */
export function getAllSeasons() {
  return SEASONS.map((s) => ({ ...s }));
}
