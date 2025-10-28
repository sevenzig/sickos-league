import React, { useState, useEffect, useRef } from 'react';
import { useLeagueData } from '../context/LeagueContext';
import { calculateScore, getDetailedScoringBreakdown, SCORING_EVENTS, QBStats } from '../utils/scoring';
import { getWeeklyCSVData, getTeamPerformance } from '../data/scoringData';
import { parseWeeklyCSV } from '../utils/csvParser';
import { clearAndReloadData } from '../utils/storage';

const EnterScores: React.FC = () => {
  const { leagueData, updateLeagueData } = useLeagueData();
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [scoringData, setScoringData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{team: any, col: string} | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleRefreshData = () => {
    const freshData = clearAndReloadData();
    updateLeagueData(freshData);
    window.location.reload();
  };

  const handleRefreshCSVData = () => {
    // Force re-import of CSV modules and recalculate standings
    window.location.reload();
  };

  // Create team ownership map
  const teamOwnership: { [teamName: string]: string } = {};
  leagueData.teams.forEach(team => {
    team.rosters.forEach(nflTeam => {
      teamOwnership[nflTeam] = team.name;
    });
  });

  // Get teams that were started in the selected week
  const startedTeams = new Set<string>();
  leagueData.lineups
    .filter(lineup => lineup.week === selectedWeek)
    .forEach(lineup => {
      lineup.activeQBs.forEach(team => {
        startedTeams.add(team);
      });
    });

  // Helper function to calculate points for each category
  const calculateCategoryPoints = (team: any, category: string): number => {
    switch (category) {
      case 'passYards':
        if (team.passYards <= 100) return 25;
        if (team.passYards <= 150) return 12;
        if (team.passYards <= 200) return 6;
        if (team.passYards <= 299) return 0;
        if (team.passYards <= 349) return -6;
        if (team.passYards <= 399) return -9;
        return -12;
      case 'touchdowns':
        if (team.touchdowns === 0) return 10;
        if (team.touchdowns === 1 || team.touchdowns === 2) return 0;
        if (team.touchdowns === 3) return -5;
        if (team.touchdowns === 4) return -10;
        return -20;
      case 'completionPercent':
        if (team.completionPercent <= 30) return 25;
        if (team.completionPercent <= 40) return 15;
        if (team.completionPercent <= 50) return 5;
        return 0;
      case 'interceptions':
        if (team.interceptions >= 6) return 50;
        if (team.interceptions === 5) return 24;
        if (team.interceptions === 4) return 16;
        if (team.interceptions === 3) return 12;
        return 0;
      case 'fumbles':
        if (team.fumbles >= 6) return 50;
        if (team.fumbles === 5) return 24;
        if (team.fumbles === 4) return 16;
        if (team.fumbles === 3) return 12;
        return 0;
      case 'defensiveTD':
        return team.defensiveTD * 20;
      case 'safety':
        return team.safety * 15;
      case 'gameEndingFumble':
        return team.gameEndingFumble * 50;
      case 'gameWinningDrive':
        return team.gameWinningDrive * -12;
      case 'benching':
        return team.benching * 35;
      default:
        return 0;
    }
  };

  // Helper function to get tooltip content
  const getTooltipContent = (team: any, category: string): string => {
    const points = calculateCategoryPoints(team, category);
    const descriptions: { [key: string]: string } = {
      'passYards': 'Pass Yards',
      'touchdowns': 'Passing Touchdowns',
      'completionPercent': 'Completion Percentage',
      'interceptions': 'Interceptions',
      'fumbles': 'Fumbles',
      'defensiveTD': 'Defensive Touchdowns',
      'safety': 'Safety',
      'gameEndingFumble': 'Game-ending Fumble',
      'gameWinningDrive': 'Game-winning Drive',
      'benching': 'Benching'
    };
    
    return `${descriptions[category] || category}: ${points > 0 ? '+' : ''}${points} points`;
  };

  // Helper function to get final score breakdown
  const getFinalScoreBreakdown = (team: any): string => {
    const breakdown = [
      `Pass Yards: ${calculateCategoryPoints(team, 'passYards')}`,
      `Pass TDs: ${calculateCategoryPoints(team, 'touchdowns')}`,
      `Comp %: ${calculateCategoryPoints(team, 'completionPercent')}`,
      `INTs: ${calculateCategoryPoints(team, 'interceptions')}`,
      `Fumbles: ${calculateCategoryPoints(team, 'fumbles')}`,
      `Def TD: ${calculateCategoryPoints(team, 'defensiveTD')}`,
      `Safety: ${calculateCategoryPoints(team, 'safety')}`,
      `GEF: ${calculateCategoryPoints(team, 'gameEndingFumble')}`,
      `GWD: ${calculateCategoryPoints(team, 'gameWinningDrive')}`,
      `Benching: ${calculateCategoryPoints(team, 'benching')}`
    ].filter(item => !item.includes(': 0')).join('\n');
    
    return breakdown || 'No additional points';
  };

  // Helper function to handle mouse enter with smart positioning
  const handleMouseEnter = (e: React.MouseEvent, team: any, category: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipHeight = 100; // Estimated tooltip height
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate preferred position (above cell)
    let x = rect.left + rect.width / 2;
    let y = rect.top - 10;
    let transform = 'translate(-50%, -100%)';
    
    // Check if tooltip would go off-screen and adjust
    if (y - tooltipHeight < 0) {
      // Not enough space above, position below
      y = rect.bottom + 10;
      transform = 'translate(-50%, 0%)';
    }
    
    // Check horizontal boundaries
    const tooltipWidth = 300; // Estimated tooltip width
    if (x - tooltipWidth / 2 < 0) {
      x = tooltipWidth / 2 + 10;
    } else if (x + tooltipWidth / 2 > viewportWidth) {
      x = viewportWidth - tooltipWidth / 2 - 10;
    }
    
    setTooltipPosition({ x, y });
    setHoveredCell({ team, col: category });
    setShowTooltip(true);
  };

  // Helper function to handle mouse leave
  const handleMouseLeave = () => {
    setShowTooltip(false);
    setHoveredCell(null);
  };

  // Load scoring data when week changes
  useEffect(() => {
    const loadScoringData = async () => {
      setLoading(true);
      try {
        const csvData = getWeeklyCSVData(selectedWeek);
        if (csvData) {
          const parsedData = parseWeeklyCSV(csvData, selectedWeek);
          // Add owner and started information to each team
          const enhancedData = parsedData.qbPerformances.map(team => ({
            ...team,
            owner: teamOwnership[team.team] || 'Unknown',
            started: startedTeams.has(team.team) ? 'Yes' : 'No'
          }));
          setScoringData(enhancedData);
        } else {
          setScoringData([]);
        }
      } catch (error) {
        console.error('Error loading scoring data:', error);
        setScoringData([]);
      } finally {
        setLoading(false);
      }
    };

    loadScoringData();
  }, [selectedWeek]);


  // Define scoring categories to display
  const scoringCategories = [
    { key: 'team', label: 'Team', type: 'text' },
    { key: 'owner', label: 'Owner', type: 'text' },
    { key: 'started', label: 'Started', type: 'text' },
    { key: 'passYards', label: 'pYD', type: 'number' },
    { key: 'touchdowns', label: 'pTDs', type: 'number' },
    { key: 'completionPercent', label: 'Comp %', type: 'number', format: (val: number) => `${val.toFixed(1)}%` },
    { key: 'interceptions', label: 'INTs', type: 'number' },
    { key: 'fumbles', label: 'Fum', type: 'number' },
    { key: 'rushYards', label: 'rYD', type: 'number' },
    { key: 'rushTouchdowns', label: 'rTDs', type: 'number' },
    { key: 'sacks', label: 'Sacks', type: 'number' },
    { key: 'qbr', label: 'QBR', type: 'number', format: (val: number) => val.toFixed(1) },
    { key: 'defensiveTD', label: 'Def TD', type: 'number' },
    { key: 'safety', label: 'Safety', type: 'number' },
    { key: 'gameEndingFumble', label: 'GEF', type: 'number' },
    { key: 'gameWinningDrive', label: 'GWD', type: 'number' },
    { key: 'benching', label: 'Benched', type: 'number' },
    { key: 'finalScore', label: 'Final Score', type: 'number', highlight: true }
  ];

  return (
    <div className="space-y-8 relative">
      {/* Week Selection */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] h-[74px] px-8 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-2xl font-black text-slate-50 tracking-tight">Week {selectedWeek} Scoring Data</h2>
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Week</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="bg-slate-800/90 text-slate-200 border border-slate-700/50 rounded-lg px-4 py-2 text-sm hover:bg-slate-700/50 transition-colors focus-ring"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
            {loading && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/30 text-sm font-medium">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading data...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && hoveredCell && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 text-xs rounded-2xl p-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] border border-slate-700/50 max-w-xs pointer-events-none backdrop-blur-xl"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: tooltipPosition.y < window.innerHeight / 2 ? 'translate(-50%, -100%)' : 'translate(-50%, 0%)'
          }}
        >
          {hoveredCell.col === 'finalScore' ? (
                <div>
              <div className="font-bold text-slate-50 mb-2">Final Score Breakdown:</div>
              <div className="whitespace-pre-line text-xs text-slate-300">
                {getFinalScoreBreakdown(hoveredCell.team)}
              </div>
            </div>
          ) : (
            <div className="text-slate-200">
              {getTooltipContent(hoveredCell.team, hoveredCell.col)}
            </div>
          )}
          </div>
      )}

      {/* Scoring Data Table */}
      {scoringData.length > 0 && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-x-auto">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  {scoringCategories.map((category) => (
                    <th
                      key={category.key}
                      className={`px-3 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider ${
                        category.highlight ? 'bg-emerald-500/20 text-emerald-400' : ''
                      }`}
                    >
                      {category.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {scoringData
                  .sort((a, b) => b.finalScore - a.finalScore) // Sort by final score descending
                  .map((team, index) => {
                    const isStarted = team.started === 'Yes';
                    return (
                      <tr 
                        key={team.team} 
                        className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                          index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                        } ${
                          isStarted ? 'border-l-4 border-emerald-500' : ''
                        }`}
                      >
                        {scoringCategories.map((category) => {
                          const value = team[category.key];
                          const displayValue = category.format ? category.format(value) : value;
                          
                          return (
                            <td
                              key={category.key}
                              className={`px-3 py-4 text-xs cursor-help ${
                                category.highlight 
                                  ? 'font-bold text-emerald-400 tabular-nums' 
                                  : category.key === 'started' && isStarted
                                  ? 'font-bold text-emerald-400'
                                  : category.key === 'owner'
                                  ? 'text-yellow-400'
                                  : 'text-slate-200'
                              }`}
                              onMouseEnter={(e) => handleMouseEnter(e, team, category.key)}
                              onMouseLeave={handleMouseLeave}
                            >
                              {displayValue}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scoringData.length === 0 && !loading && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-8 text-center text-slate-400">
          No scoring data available for Week {selectedWeek}
        </div>
      )}

      {/* Refresh Data Buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleRefreshCSVData}
          className="px-6 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-all duration-200 font-medium"
        >
          Refresh CSV Data
        </button>
        <button
          onClick={handleRefreshData}
          className="px-6 py-3 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all duration-200 font-medium"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
};

export default EnterScores;
