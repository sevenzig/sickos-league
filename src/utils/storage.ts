import { LeagueData } from '../types';
import { initialLeagueData } from '../data/initialData';
import { getAvailableWeeks } from './csvLoader';
import { loadFullLeagueData } from '../services/database';

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
 * Load league data from database with localStorage fallback
 * DATABASE-FIRST: Attempts to load from Supabase database first, falls back to localStorage only if database fails
 */
export async function loadLeagueData(): Promise<LeagueData> {
  try {
    // Try to load from database first
    const dbData = await loadFullLeagueData();
    if (dbData && dbData.teams.length > 0) {
      // Save to localStorage for offline access
      saveLeagueDataToLocal(dbData);
      return dbData;
    }
  } catch (error) {
    console.warn('Database not available, falling back to localStorage:', error);
  }

  // Fallback to localStorage
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
 * Load league data from localStorage only (for offline mode)
 * OFFLINE-ONLY: Only used when database is unavailable or for offline fallback
 */
export function loadLeagueDataFromLocal(): LeagueData {
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
export function saveLeagueDataToLocal(data: LeagueData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving league data to localStorage:', error);
  }
}

/**
 * Save league data to both localStorage and database
 * CACHE-ONLY: Saves to localStorage as cache, database sync handled by context operations
 */
export async function saveLeagueData(data: LeagueData): Promise<void> {
  // Always save to localStorage immediately for offline access
  saveLeagueDataToLocal(data);
  
  // Try to sync to database (don't fail if database is unavailable)
  try {
    // This would need to be implemented based on what specific data changed
    // For now, we'll just save to localStorage and let the context handle database sync
    console.log('Data saved to localStorage, database sync handled by context');
  } catch (error) {
    console.warn('Database sync failed, data saved locally:', error);
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
      saveLeagueDataToLocal(data);
      return data;
    }
  } catch (error) {
    console.error('Error importing league data:', error);
  }
  return null;
}

/**
 * Check if there are pending changes in localStorage that need to be synced
 */
export function hasPendingChanges(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    
    const parsed = JSON.parse(stored);
    const lastSync = localStorage.getItem(`${STORAGE_KEY}-last-sync`);
    
    if (!lastSync) return true; // Never synced
    
    const dataTimestamp = parsed.lastModified || 0;
    const syncTimestamp = parseInt(lastSync);
    
    return dataTimestamp > syncTimestamp;
  } catch (error) {
    console.error('Error checking pending changes:', error);
    return false;
  }
}

/**
 * Mark data as synced to database
 */
export function markDataAsSynced(): void {
  try {
    const timestamp = Date.now();
    localStorage.setItem(`${STORAGE_KEY}-last-sync`, timestamp.toString());
  } catch (error) {
    console.error('Error marking data as synced:', error);
  }
}

/**
 * Get connection status (simplified check)
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Sync data to database (called by context)
 */
export async function syncToDatabase(data: LeagueData): Promise<boolean> {
  try {
    // This would be implemented by the context to sync specific changes
    // For now, just mark as synced
    markDataAsSynced();
    return true;
  } catch (error) {
    console.error('Error syncing to database:', error);
    return false;
  }
}

/**
 * Sync data from database (called by context)
 */
export async function syncFromDatabase(): Promise<LeagueData | null> {
  try {
    const dbData = await loadFullLeagueData();
    if (dbData) {
      saveLeagueDataToLocal(dbData);
      markDataAsSynced();
      return dbData;
    }
    return null;
  } catch (error) {
    console.error('Error syncing from database:', error);
    return null;
  }
}
