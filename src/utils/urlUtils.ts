// URL utility functions for handling league IDs

/**
 * Generates a random 8-character league ID
 * Uses lowercase, uppercase, and numbers (62 possible characters)
 * 62^8 = ~218 trillion possible combinations
 */
export function generateLeagueId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Shortens a UUID by taking the first 8 characters (legacy function)
 * Example: c5dfbc02-0c51-4d2e-95ea-75515038155b -> c5dfbc02
 */
export function shortenLeagueId(uuid: string): string {
  return uuid.substring(0, 8);
}

/**
 * Checks if an ID is a league ID (8 characters) vs legacy UUID
 */
export function isLeagueId(id: string): boolean {
  // League IDs are exactly 8 characters
  return id.length === 8;
}

/**
 * Validates if a string looks like a valid league ID (8 alphanumeric characters)
 */
export function isValidLeagueId(id: string): boolean {
  return /^[a-zA-Z0-9]{8}$/.test(id);
}

/**
 * Validates if a string looks like a valid full UUID (legacy)
 */
export function isValidUUID(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
}

/**
 * Legacy function - checks if ID is short format
 */
export function isShortId(id: string): boolean {
  return isLeagueId(id);
}

/**
 * Legacy function - validates short ID format
 */
export function isValidShortId(id: string): boolean {
  return isValidLeagueId(id);
}

/** True when the current location is under /dev/leagues (browser only). */
function isDevLeaguePath(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/dev/leagues/');
}

/**
 * Generates league URLs using 8-character league IDs.
 * Under /dev/leagues keeps the full UUID and the /dev prefix so sandbox nav stays isolated.
 */
export function getLeagueUrl(leagueId: string, path: string = ''): string {
  const onDev = isDevLeaguePath();
  const urlId = onDev || !isValidUUID(leagueId) ? leagueId : shortenLeagueId(leagueId);
  const basePath = `${onDev ? '/dev/leagues' : '/leagues'}/${urlId}`;
  return path ? `${basePath}/${path}` : basePath;
}

/** Join page URL: /leagues/{short}/join (or /dev/leagues/{id}/join). */
export function getLeagueJoinUrl(leagueId: string): string {
  return getLeagueUrl(leagueId, 'join');
}

/** Explicit /dev/leagues URL (full UUID preferred). Use from sandbox launchers. */
export function getDevLeagueUrl(leagueId: string, path: string = ''): string {
  const basePath = `/dev/leagues/${leagueId}`;
  return path ? `${basePath}/${path}` : basePath;
}

/**
 * Matchup detail URL: /leagues/:id/week/:week/:team1/:team2
 * Team names are URI-encoded so spaces/special chars survive the path.
 */
export function getMatchupUrl(
  leagueId: string,
  week: number,
  team1: string,
  team2: string
): string {
  return getLeagueUrl(
    leagueId,
    `week/${week}/${encodeURIComponent(team1)}/${encodeURIComponent(team2)}`
  );
}