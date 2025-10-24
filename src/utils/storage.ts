import { LeagueData } from '../types';
import { initialLeagueData } from '../data/initialData';

const STORAGE_KEY = 'bad-qb-league-data';

/**
 * Load league data from localStorage or return initial data
 */
export function loadLeagueData(): LeagueData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that the data has the required structure and new matchups
      if (parsed.teams && parsed.records && parsed.currentWeek !== undefined && parsed.matchups && parsed.matchups.length >= 18) {
        return parsed as LeagueData;
      }
    }
  } catch (error) {
    console.error('Error loading league data from localStorage:', error);
  }
  
  // Return initial data if no valid data found
  console.log('Loading fresh initial data with new matchups');
  return initialLeagueData;
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
    if (parsed.teams && parsed.records && parsed.currentWeek !== undefined) {
      const data = parsed as LeagueData;
      saveLeagueData(data);
      return data;
    }
  } catch (error) {
    console.error('Error importing league data:', error);
  }
  return null;
}
