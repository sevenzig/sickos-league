// Utility functions for team logos

// Map team names to their logo file names
const TEAM_LOGO_MAP: { [key: string]: string } = {
  // NFL Teams
  'Arizona': 'ari.png',
  'Atlanta': 'atl.png', 
  'Baltimore': 'bal.png',
  'Buffalo': 'buf.png',
  'Carolina': 'car.png',
  'Chicago': 'chi.png',
  'Cincinnati': 'cin.png',
  'Cleveland': 'cle.png',
  'Dallas': 'dal.png',
  'Denver': 'den.png',
  'Detroit': 'det.png',
  'Green Bay': 'gb.png',
  'Houston': 'hou.png',
  'Indianapolis': 'ind.png',
  'Jacksonville': 'jax.png',
  'Kansas City': 'kc.png',
  'Las Vegas': 'lv.png',
  'LA Chargers': 'lac.png',
  'LA Rams': 'lar.png',
  'Miami': 'mia.png',
  'Minnesota': 'min.png',
  'New England': 'ne.png',
  'New Orleans': 'no.png',
  'NY Giants': 'nyg.png',
  'NY Jets': 'nyj.png',
  'Philadelphia': 'phi.png',
  'Pittsburgh': 'pit.png',
  'San Francisco': 'sf.png',
  'Seattle': 'sea.png',
  'Tampa Bay': 'tb.png',
  'Tennessee': 'ten.png',
  'Washington': 'wsh.png'
};

/**
 * Get the logo path for a team name
 * @param teamName - The name of the team
 * @returns The path to the team's logo or null if not found
 */
export function getTeamLogo(teamName: string): string | null {
  const logoFile = TEAM_LOGO_MAP[teamName];
  return logoFile ? `/logos/${logoFile}` : null;
}

/**
 * Get the logo path for a team name with fallback
 * @param teamName - The name of the team
 * @param fallback - Fallback text to display if no logo is found
 * @returns The path to the team's logo or the fallback text
 */
export function getTeamLogoWithFallback(teamName: string, fallback?: string): string {
  const logoPath = getTeamLogo(teamName);
  return logoPath || fallback || teamName;
}

/**
 * Check if a team has a logo available
 * @param teamName - The name of the team
 * @returns True if logo is available, false otherwise
 */
export function hasTeamLogo(teamName: string): boolean {
  return TEAM_LOGO_MAP.hasOwnProperty(teamName);
}
