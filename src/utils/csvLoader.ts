// Utility to load CSV data from weekly-scoring-data directory

/**
 * Load CSV data for a specific week
 * This would typically fetch from your weekly-scoring-data directory
 */
export async function loadWeeklyCSVData(week: number): Promise<string> {
  try {
    // In a real implementation, you would fetch from your file system
    // For now, we'll use the embedded data from scoringData.ts
    const { getWeeklyCSVData } = await import('../data/scoringData');
    return getWeeklyCSVData(week);
  } catch (error) {
    console.error(`Error loading CSV data for week ${week}:`, error);
    return '';
  }
}

/**
 * Get all available weeks with CSV data
 */
export function getAvailableWeeks(): number[] {
  const availableWeeks: number[] = [];
  
  // Check weeks 1-18 for available data
  for (let week = 1; week <= 18; week++) {
    try {
      // Import the function dynamically to avoid circular dependencies
      const { getWeeklyCSVData } = require('../data/scoringData');
      const csvData = getWeeklyCSVData(week);
      if (csvData && csvData.trim().length > 0) {
        availableWeeks.push(week);
      }
    } catch (error) {
      // Week not available, continue
    }
  }
  
  return availableWeeks;
}

/**
 * Check if CSV data is available for a specific week
 */
export function hasCSVDataForWeek(week: number): boolean {
  return getAvailableWeeks().includes(week);
}
