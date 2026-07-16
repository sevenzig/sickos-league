import React, { useState, useEffect, useRef } from 'react';
import { useLeagueData } from '../context/LeagueContext';
import { calculateScore, getDetailedScoringBreakdown, SCORING_EVENTS, QBStats } from '../utils/scoring';
import TeamLogo from '../components/TeamLogo';
import { clearAndReloadData } from '../utils/storage';
import { getWeeklyQBPerformancesFromDb, clearQBPerformancesCache } from '../services/database';

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

  



  // Helper function to calculate points for each category using the same logic as MatchupModal
  const calculateCategoryPoints = (team: any, category: string): number => {
    const netPassYards = (team.passYards ?? 0) + (team.sackYards ?? 0);
    const turnovers = (team.interceptions ?? 0) + (team.fumbles ?? 0);
    const scoring = getDetailedScoringBreakdown({
      passYards: netPassYards,
      touchdowns: team.touchdowns ?? 0,
      completionPercent: team.completionPercent ?? 0,
      turnovers,
      longestPlay: team.longestPlay ?? 0,
      interceptions: team.interceptions ?? 0,
      fumbles: team.fumbles ?? 0,
      rushYards: team.rushYards ?? 0,
      // special events are scored via SCORING_EVENTS below to mirror modal behavior
      events: []
    } as any);

    // Base mapped scores from detailed breakdown
    const map: { [key: string]: number } = {
      passYards: scoring.passYards ?? 0,
      touchdowns: scoring.touchdowns ?? 0,
      completionPercent: scoring.completionPercent ?? 0,
      turnovers: scoring.turnovers ?? 0,
      interceptions: scoring.interceptions ?? 0,
      fumbles: scoring.fumbles ?? 0,
      longestPlay: scoring.longestPlay ?? 0,
      rushYards: scoring.rushYards ?? 0,
      // special event categories handled below
    };

    if (category in map) {
      return map[category];
    }

    // Mirror modal special event scoring using SCORING_EVENTS
    const getEventPoints = (name: string) => (SCORING_EVENTS.find(e => e.name === name)?.points ?? 0);

    switch (category) {
      case 'defensiveTD': {
        const pts = getEventPoints('Defensive TD');
        return (team.defensiveTD ?? 0) * pts;
      }
      case 'safety': {
        const pts = getEventPoints('QB Safety');
        return (team.safety ?? 0) * pts;
      }
      case 'gameEndingFumble': {
        const pts = getEventPoints('Game-ending F Up');
        return (team.gameEndingFumble ?? 0) * pts;
      }
      case 'gameWinningDrive': {
        const gwdPts = getEventPoints('Game-Winning Drive');
        const gwdFgPts = getEventPoints('GWD by Field Goal');
        const count = (team.gameWinningDrive ?? 0);
        const fgCount = (team.gwdByFieldGoal ?? 0);
        return count * gwdPts + fgCount * gwdFgPts;
      }
      case 'benching': {
        const pts = getEventPoints('Benching');
        return (team.benching ?? 0) * pts;
      }
      default:
        return 0;
    }
  };

  // Helper function to get tooltip content
  const getTooltipContent = (team: any, category: string): string => {
    const points = calculateCategoryPoints(team, category);
    const descriptions: { [key: string]: string } = {
      'passYards': 'Net Pass Yards',
      'touchdowns': 'Passing Touchdowns',
      'completionPercent': 'Completion Percentage',
      'turnovers': 'Total Turnovers',
      'interceptions': 'Interceptions',
      'fumbles': 'Fumbles',
      'longestPlay': 'Longest Play',
      'rushYards': 'Rush Yards',
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
        const performances = await getWeeklyQBPerformancesFromDb(selectedWeek);
        setScoringData(performances || []);
      } catch (error) {
        console.error('Error loading scoring data:', error);
        setScoringData([]);
      } finally {
        setLoading(false);
      }
    };

    loadScoringData();
  }, [selectedWeek]);


  // Define scoring categories to display (aligned with modal)
	const scoringCategories = [
	    { key: 'team', label: 'Team', type: 'text' },
	    { key: 'passYards', label: 'pYD', type: 'number' },
	    { key: 'touchdowns', label: 'pTDs', type: 'number' },
	    { key: 'completionPercent', label: 'Comp %', type: 'number', format: (val: number) => `${val.toFixed(1)}%` },
	    { key: 'turnovers', label: 'TO', type: 'number', valueFrom: (t: any) => (t.interceptions ?? 0) + (t.fumbles ?? 0) },
	    { key: 'interceptions', label: 'INTs', type: 'number' },
	    { key: 'fumbles', label: 'Fum', type: 'number' },
	    { key: 'longestPlay', label: 'Long', type: 'number' },
	    { key: 'rushYards', label: 'rYD', type: 'number' },
	    { key: 'defensiveTD', label: 'Def TD', type: 'number' },
	    { key: 'safety', label: 'Safety', type: 'number' },
	    { key: 'gameEndingFumble', label: 'GEF', type: 'number' },
	    { key: 'gameWinningDrive', label: 'GWD', type: 'number' },
	    { key: 'benching', label: 'Benched', type: 'number' },
	    { key: 'finalScore', label: 'Final Score', type: 'number', highlight: true }
	  ];

  // Points display components (mirroring matchup modal)
  const PointsDisplay = ({ points }: { points: number }) => {
    if (points === 0) return <span className="text-slate-500 text-[10px] font-medium">—</span>;
    const isPositive = points > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
        isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
      }`}>
        {isPositive && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {!isPositive && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {points > 0 ? '+' : ''}{points}
      </span>
    );
  };

  const StatCell = ({ value, points }: { value: any; points: number }) => (
    <div className="flex flex-row items-center gap-2">
      <div className="text-xs font-semibold text-slate-100 tabular-nums">{value ?? '—'}</div>
      <PointsDisplay points={points} />
    </div>
  );

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))}
                disabled={selectedWeek <= 1}
                aria-label="Previous week"
                className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  selectedWeek <= 1
                    ? 'border-slate-700/50 text-slate-500 cursor-not-allowed'
                    : 'border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                <span className="tabular-nums">Previous</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedWeek((w) => Math.min(18, w + 1))}
                disabled={selectedWeek >= 18}
                aria-label="Next week"
                className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  selectedWeek >= 18
                    ? 'border-slate-700/50 text-slate-500 cursor-not-allowed'
                    : 'border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                <span className="tabular-nums">Next</span>
              </button>
            </div>
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
            <table className="w-full table-fixed">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  {scoringCategories.map((category) => {
                    const isTeam = category.key === 'team';
                    const widthClass = isTeam ? 'w-40 md:w-56' : 'w-24 md:w-28';
                    return (
                      <th
                        key={category.key}
                        className={`px-3 py-3 ${widthClass} text-left whitespace-nowrap text-xs font-bold text-slate-400 uppercase tracking-wider ${
                          category.highlight ? 'bg-emerald-500/20 text-emerald-400' : ''
                        }`}
                      >
                        {category.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {scoringData
                  .sort((a, b) => b.finalScore - a.finalScore) // Sort by final score descending
                  .map((team, index) => {
                    return (
                      <tr 
                        key={team.team} 
                        className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                          index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                        }`}
                      >
                        {scoringCategories.map((category) => {
                          const key = category.key as string;
                          const rawValue = (category as any).valueFrom ? (category as any).valueFrom(team) : team[key];
                          const value = category.format ? category.format(rawValue) : rawValue;
                          const showArrow = key !== 'team' && key !== 'finalScore';
                          const points = showArrow ? calculateCategoryPoints(team, key) : 0;
                          const isTeam = key === 'team';
                          const isFinal = key === 'finalScore';
                          const cellAlign = (isTeam || isFinal) ? 'text-center' : 'text-left';
                          const widthClass = isTeam ? 'w-40 md:w-56' : 'w-24 md:w-28';
                          return (
                            <td
                              key={category.key}
                              className={`px-3 py-3 ${widthClass} ${cellAlign} whitespace-nowrap align-top ${
                                category.highlight ? 'font-bold text-emerald-400 tabular-nums' : 'text-slate-200'
                              }`}
                              onMouseEnter={(e) => handleMouseEnter(e, team, category.key)}
                              onMouseLeave={handleMouseLeave}
                            >
                              {showArrow ? (
                                <div className="inline-flex items-center gap-2 justify-start">
                                  <span className="text-xs font-semibold tabular-nums">{value ?? '—'}</span>
                                  <PointsDisplay points={points} />
                                </div>
                              ) : (
                                key === 'team' ? (
                                  <div className="inline-flex items-center gap-3">
                                    <div className="pr-1">
                                      <TeamLogo teamName={String(value)} size="sm" />
                                    </div>
                                    <span className="font-medium text-slate-200">{value}</span>
                                  </div>
                                ) : key === 'finalScore' ? (
                                  <span className={`tabular-nums font-bold ${
                                    (Number(value) || 0) === 0
                                      ? 'text-slate-400'
                                      : (Number(value) || 0) >= 1
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}>{value}</span>
                                ) : (
                                  <span className="tabular-nums">{value}</span>
                                )
                              )}
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

      {/* Refresh Data Button */}
      <div className="flex justify-end gap-3">
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
