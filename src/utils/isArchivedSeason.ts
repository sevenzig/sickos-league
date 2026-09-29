import { CURRENT_SEASON } from './currentSeason';

/** True when league season is before the platform current year (read-only / soft-lock). */
export function isArchivedSeason(season: number): boolean {
  return season < CURRENT_SEASON;
}
