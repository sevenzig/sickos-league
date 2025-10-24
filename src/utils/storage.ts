import { LeagueData } from '../types';
import { initialLeagueData } from '../data/initialData';
import { getAvailableWeeks } from './csvLoader';

const STORAGE_KEY = 'bad-qb-league-data';

/**
 * Auto-determine locked weeks based on CSV data and complete lineups
 */
function determineLockedWeeks(data: LeagueData): number[] {
  const lockedWeeks: number[] = [];
  const availableWeeks = getAvailableWeeks(); // Weeks with CSV data
  
  // Any week with CSV data AND complete lineups is automatically locked
  for (const week of availableWeeks) {
    const weekLineups = data.lineups.filter(l => l.week === week);
    const hasAllLineups = weekLineups.length === data.teams.length;
    if (hasAllLineups) {
      lockedWeeks.push(week);
    }
  }
  return lockedWeeks;
}

/**
 * Load league data from localStorage or return initial data
 */
export function loadLeagueData(): LeagueData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that the data has the required structure and new matchups
      if (parsed.teams && parsed.currentWeek !== undefined && parsed.matchups && parsed.matchups.length >= 18) {
        // Migration: Add lockedWeeks if it doesn't exist
        if (!parsed.lockedWeeks) {
          parsed.lockedWeeks = determineLockedWeeks(parsed);
        }
        return parsed as LeagueData;
      }
    }
  } catch (error) {
    console.error('Error loading league data from localStorage:', error);
  }
  
  // Return initial data if no valid data found
  console.log('Loading fresh initial data with new matchups');
  const data = { ...initialLeagueData };
  // Auto-calculate locked weeks for initial data
  data.lockedWeeks = determineLockedWeeks(data);
  return data;
}

/**
 * Save league data to localStorage
 */
export function saveLeagueData(data: LeagueData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving league data to localStorage:', error);
  }
}

/**
 * Clear all league data and reset to initial state
 */
export function resetLeagueData(): LeagueData {
  localStorage.removeItem(STORAGE_KEY);
  const initialData = initialLeagueData;
  saveLeagueData(initialData);
  return initialData;
}

/**
 * Force refresh with new data structure
 */
export function forceRefreshData(): LeagueData {
  localStorage.removeItem(STORAGE_KEY);
  return initialLeagueData;
}

/**
 * Clear all data and force reload with fresh initial data
 */
export function clearAndReloadData(): LeagueData {
  localStorage.clear();
  return initialLeagueData;
}

/**
 * Export league data as JSON string for backup
 */
export function exportLeagueData(data: LeagueData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Import league data from JSON string
 */
export function importLeagueData(jsonString: string): LeagueData | null {
  try {
    const parsed = JSON.parse(jsonString);
    // Validate structure
    if (parsed.teams && parsed.currentWeek !== undefined) {
      const data = parsed as LeagueData;
      saveLeagueData(data);
      return data;
    }
  } catch (error) {
    console.error('Error importing league data:', error);
  }
  return null;
}
