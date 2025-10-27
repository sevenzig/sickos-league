import React from 'react';
import TeamLogo from './TeamLogo';
import { getDetailedScoringBreakdown } from '../utils/scoring';

// Type definition for QB stats display structure
interface QBStatsDisplay {
  netPassYards: { value: any; points: number };
  touchdowns: { value: any; points: number };
  completionPercent: { value: any; points: number };
  turnovers: { value: any; points: number };
  interceptions: { value: any; points: number };
  fumbles: { value: any; points: number };
  longestPlay: { value: any; points: number };
  rushYards: { value: any; points: number };
}

interface MatchupModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchupData: {
    week: number;
    team1: string;
    team2: string;
    team1Score: number;
    team2Score: number;
    team1Breakdown: Array<{
      qb: string;
      breakdown: any;
    }>;
    team2Breakdown: Array<{
      qb: string;
      breakdown: any;
    }>;
  } | null;
}

// Helper component for displaying points with icons
const PointsDisplay = ({ points }: { points: number }) => {
  if (points === 0) return <span className="text-slate-500 text-xs font-medium">—</span>;
  
  const isPositive = points > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold ${
      isPositive 
        ? 'bg-emerald-500/10 text-emerald-400' 
        : 'bg-rose-500/10 text-rose-400'
    }`}>
      {isPositive && (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {!isPositive && points !== 0 && (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {points > 0 ? '+' : ''}{points}
    </span>
  );
};

// Helper component for table cells
const StatCell = ({ value, points }: { value: any; points: number }) => (
  <div className="flex flex-col items-center gap-1 py-3">
    <div className="text-base font-semibold text-slate-100 tabular-nums">
      {value ?? '—'}
    </div>
    <PointsDisplay points={points} />
  </div>
);

const MatchupModal: React.FC<MatchupModalProps> = ({ isOpen, onClose, matchupData }) => {
  if (!isOpen || !matchupData) return null;

  const { week, team1, team2, team1Score, team2Score, team1Breakdown, team2Breakdown } = matchupData;
  const hasData = team1Breakdown.length > 0 && team1Breakdown[0].breakdown !== null;

  // Define stat categories for the table
  const statCategories = [
    { key: 'netPassYards', label: 'Net Pass Yards' },
    { key: 'touchdowns', label: 'Touchdowns' },
    { key: 'completionPercent', label: 'Completion %' },
    { key: 'turnovers', label: 'Turnovers' },
    { key: 'interceptions', label: 'Interceptions' },
    { key: 'fumbles', label: 'Fumbles' },
    { key: 'longestPlay', label: 'Longest Play' },
    { key: 'rushYards', label: 'Rush Yards' }
  ] as const;

  // Helper function to get QB stats for table display
  const getQBStats = (breakdown: any): QBStatsDisplay => {
    if (!breakdown) {
      return {
        netPassYards: { value: undefined, points: 0 },
        touchdowns: { value: undefined, points: 0 },
        completionPercent: { value: undefined, points: 0 },
        turnovers: { value: undefined, points: 0 },
        interceptions: { value: undefined, points: 0 },
        fumbles: { value: undefined, points: 0 },
        longestPlay: { value: undefined, points: 0 },
        rushYards: { value: undefined, points: 0 }
      };
    }
    
    // Calculate net pass yards (pass yards - sack yards)
    const netPassYards = breakdown.passYards + (breakdown.sackYards || 0);
    
    const scoringBreakdown = getDetailedScoringBreakdown({
      passYards: netPassYards,
      touchdowns: breakdown.touchdowns,
      completionPercent: breakdown.completionPercent,
      turnovers: breakdown.turnovers,
      events: breakdown.events,
      longestPlay: breakdown.longestPlay,
      interceptions: breakdown.interceptions,
      fumbles: breakdown.fumbles,
      rushYards: breakdown.rushYards
    });

    return {
      netPassYards: { value: netPassYards, points: scoringBreakdown.passYards },
      touchdowns: { value: breakdown.touchdowns, points: scoringBreakdown.touchdowns },
      completionPercent: { value: `${breakdown.completionPercent}%`, points: scoringBreakdown.completionPercent },
      turnovers: { value: breakdown.interceptions + breakdown.fumbles, points: scoringBreakdown.turnovers },
      interceptions: { value: breakdown.interceptions, points: scoringBreakdown.interceptions },
      fumbles: { value: breakdown.fumbles, points: scoringBreakdown.fumbles },
      longestPlay: { value: breakdown.longestPlay, points: scoringBreakdown.longestPlay },
      rushYards: { value: breakdown.rushYards, points: scoringBreakdown.rushYards }
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-[1400px] max-h-[90vh] overflow-y-auto bg-gradient-to-b from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-700/50">
        
        {/* Header with gradient accent */}
        <div className="relative bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-8 py-5 border-b border-slate-600/30">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30">
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-50 tracking-tight">Week {week} Matchup</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Bad QB League</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="group flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Score Comparison Section */}
        <div className="relative px-8 py-10 bg-gradient-to-b from-slate-800/60 to-slate-800/30">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-blue-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-500 rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative flex items-center justify-between max-w-5xl mx-auto">
            {/* Team 1 */}
            <div className="flex-1 text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border-2 mb-3 shadow-lg ${
                hasData && team1Score > team2Score 
                  ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-slate-700/50 border-slate-600/30 text-slate-400'
              }`}>
                <TeamLogo teamName={team1} size="sm" />
              </div>
              <div className="text-lg font-semibold text-slate-200 mb-2 tracking-tight">{team1}</div>
              <div className="relative inline-block">
                <div className={`text-6xl md:text-7xl font-black tabular-nums drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] ${
                  hasData && team1Score > team2Score 
                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 bg-clip-text text-transparent' 
                    : 'text-slate-400'
                }`}>
                  {team1Score}
                </div>
                {hasData && team1Score > team2Score && (
                  <div className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent rounded-full"></div>
                )}
              </div>
              {hasData && team1Score > team2Score && (
                <div className="mt-2 text-xs text-emerald-400 font-medium tracking-wide uppercase">Winner</div>
              )}
            </div>

            {/* VS Divider */}
            <div className="flex flex-col items-center px-8">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 shadow-xl">
                <span className="text-xl font-black text-slate-400">VS</span>
              </div>
              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
            </div>

            {/* Team 2 */}
            <div className="flex-1 text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border-2 mb-3 shadow-lg ${
                hasData && team2Score > team1Score 
                  ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-slate-700/50 border-slate-600/30 text-slate-400'
              }`}>
                <TeamLogo teamName={team2} size="sm" />
              </div>
              <div className="text-lg font-semibold text-slate-200 mb-2 tracking-tight">{team2}</div>
              <div className="relative inline-block">
                <div className={`text-6xl md:text-7xl font-black tabular-nums ${
                  hasData && team2Score > team1Score 
                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                    : 'text-slate-400'
                }`}>
                  {team2Score}
                </div>
                {hasData && team2Score > team1Score && (
                  <div className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent rounded-full"></div>
                )}
              </div>
              {hasData && team2Score > team1Score && (
                <div className="mt-2 text-xs text-emerald-400 font-medium tracking-wide uppercase">Winner</div>
              )}
            </div>
          </div>
        </div>

        {/* Main Stats Table */}
        <div className="px-8 py-8">
          <div className="rounded-2xl border border-slate-700/50 overflow-hidden bg-slate-800/40 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  {/* Owner Header Row */}
                  <tr className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                    <th className="py-3 px-6 text-left text-xs font-bold text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-800 z-10">
                      {/* Empty cell for statistic column */}
                    </th>
                    {team1Breakdown.length > 0 && (
                      <th colSpan={team1Breakdown.length} className="py-3 px-4 text-center border-l-4 border-blue-500 bg-blue-500/10">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <span className="text-sm font-bold text-slate-100">{team1}</span>
                        </div>
                      </th>
                    )}
                    {team2Breakdown.length > 0 && team1Breakdown.length > 0 && (
                      <th className="py-3 px-3 border-l-4 border-slate-600/30">
                        <div className="text-xs font-bold text-slate-500 uppercase">VS</div>
                      </th>
                    )}
                    {team2Breakdown.length > 0 && (
                      <th colSpan={team2Breakdown.length} className="py-3 px-4 text-center border-r-4 border-purple-500 bg-purple-500/10">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                          <span className="text-sm font-bold text-slate-100">{team2}</span>
                        </div>
                      </th>
                    )}
                  </tr>
                  {/* QB Header Row */}
                  <tr className="bg-gradient-to-r from-slate-800 to-slate-800/80 border-t border-slate-700/30">
                    <th className="py-4 px-6 text-left text-xs font-bold text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-800 z-10">
                      Statistic
                    </th>
                    {team1Breakdown.map(({ qb, breakdown }, index) => (
                      <th key={`team1-${index}`} className="py-4 px-4 text-center border-l border-slate-700/30 bg-blue-500/5">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2">
                            <TeamLogo teamName={qb} size="xs" />
                            <span className="text-sm font-bold text-slate-200">{qb}</span>
                          </div>
                          <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                            breakdown && breakdown.finalScore > 0 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {breakdown ? breakdown.finalScore : 0} pts
                          </div>
                        </div>
                      </th>
                    ))}
                    {team1Breakdown.length > 0 && team2Breakdown.length > 0 && (
                      <th className="py-4 px-3 border-x-2 border-slate-600/50 sticky bg-slate-800 z-10">
                        {/* Separator column */}
                      </th>
                    )}
                    {team2Breakdown.map(({ qb, breakdown }, index) => (
                      <th key={`team2-${index}`} className="py-4 px-4 text-center border-l border-slate-700/30 bg-purple-500/5">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2">
                            <TeamLogo teamName={qb} size="xs" />
                            <span className="text-sm font-bold text-slate-200">{qb}</span>
                          </div>
                          <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                            breakdown && breakdown.finalScore > 0 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {breakdown ? breakdown.finalScore : 0} pts
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statCategories.map((category, idx) => (
                    <tr 
                      key={category.key} 
                      className={`border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors duration-150 ${
                        idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-6 sticky left-0 bg-slate-800/95 backdrop-blur-sm z-10">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-300">{category.label}</span>
                        </div>
                      </td>
                      {team1Breakdown.map(({ qb, breakdown }, index) => {
                        const stats = getQBStats(breakdown);
                        return (
                          <td key={`team1-${index}`} className="border-l border-slate-700/30 bg-blue-500/5">
                            <StatCell 
                              value={stats[category.key as keyof QBStatsDisplay]?.value}
                              points={stats[category.key as keyof QBStatsDisplay]?.points || 0}
                            />
                          </td>
                        );
                      })}
                      {team1Breakdown.length > 0 && team2Breakdown.length > 0 && (
                        <td className="border-x-2 border-slate-600/50 bg-slate-800 z-10">
                          {/* Separator column */}
                        </td>
                      )}
                      {team2Breakdown.map(({ qb, breakdown }, index) => {
                        const stats = getQBStats(breakdown);
                        return (
                          <td key={`team2-${index}`} className="border-l border-slate-700/30 bg-purple-500/5">
                            <StatCell 
                              value={stats[category.key as keyof QBStatsDisplay]?.value}
                              points={stats[category.key as keyof QBStatsDisplay]?.points || 0}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Special Events */}
          {(team1Breakdown.some(({ breakdown }) => breakdown && (breakdown.defensiveTD > 0 || breakdown.safety > 0 || breakdown.gameEndingFumble > 0 || breakdown.gameWinningDrive > 0 || breakdown.benching > 0)) || 
            team2Breakdown.some(({ breakdown }) => breakdown && (breakdown.defensiveTD > 0 || breakdown.safety > 0 || breakdown.gameEndingFumble > 0 || breakdown.gameWinningDrive > 0 || breakdown.benching > 0))) && (
            <div className="mt-8 rounded-2xl border border-slate-700/50 overflow-hidden bg-slate-800/40 backdrop-blur-sm">
              <div className="bg-gradient-to-r from-slate-800 to-slate-800/80 px-6 py-3 border-b border-slate-700/30">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Special Events</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    {/* Owner Header Row */}
                    <tr className="border-b border-slate-700/30 bg-slate-800/20">
                      <th className="py-3 px-6 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {/* Empty cell for event type column */}
                      </th>
                      {team1Breakdown.length > 0 && (
                        <th colSpan={team1Breakdown.length} className="py-3 px-4 text-center border-l-4 border-blue-500 bg-blue-500/10">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-xs font-bold text-slate-100">{team1}</span>
                          </div>
                        </th>
                      )}
                      {team2Breakdown.length > 0 && team1Breakdown.length > 0 && (
                        <th className="py-3 px-3 border-l-4 border-slate-600/30">
                          <div className="text-xs font-bold text-slate-500 uppercase">VS</div>
                        </th>
                      )}
                      {team2Breakdown.length > 0 && (
                        <th colSpan={team2Breakdown.length} className="py-3 px-4 text-center border-r-4 border-purple-500 bg-purple-500/10">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                            <span className="text-xs font-bold text-slate-100">{team2}</span>
                          </div>
                        </th>
                      )}
                    </tr>
                    {/* QB Header Row */}
                    <tr className="border-b border-slate-700/30 bg-slate-800/20">
                      <th className="py-3 px-6 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Event Type</th>
                      {team1Breakdown.map(({ qb }, index) => (
                        <th key={`team1-${index}`} className="py-3 px-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider border-l border-slate-700/30 bg-blue-500/5">{qb}</th>
                      ))}
                      {team1Breakdown.length > 0 && team2Breakdown.length > 0 && (
                        <th className="py-3 px-3 border-x-2 border-slate-600/50">
                          {/* Separator column */}
                        </th>
                      )}
                      {team2Breakdown.map(({ qb }, index) => (
                        <th key={`team2-${index}`} className="py-3 px-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider border-l border-slate-700/30 bg-purple-500/5">{qb}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['Defensive TD', 'Safety', 'Game Ending Fumble', 'Game Winning Drive', 'Benching'].map((eventType, idx) => {
                      const hasAnyEvents = [...team1Breakdown, ...team2Breakdown].some(({ breakdown }) => {
                        if (!breakdown) return false;
                        const eventKey = eventType.toLowerCase().replace(/\s+/g, '');
                        return breakdown[eventKey] > 0;
                      });
                      
                      if (!hasAnyEvents) return null;
                      
                      return (
                        <tr 
                          key={idx} 
                          className={`border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors duration-150 ${
                            idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                          }`}
                        >
                          <td className="py-4 px-6 sticky left-0 bg-slate-800/95 backdrop-blur-sm">
                            <span className="text-sm font-medium text-slate-300">{eventType}</span>
                          </td>
                          {team1Breakdown.map(({ qb, breakdown }, teamIdx) => {
                            if (!breakdown) {
                              return (
                                <td key={teamIdx} className="py-4 px-4 border-l border-slate-700/30 bg-blue-500/5">
                                  <span className="text-slate-600 text-xs">—</span>
                                </td>
                              );
                            }
                            
                            const eventKey = eventType.toLowerCase().replace(/\s+/g, '');
                            const eventCount = breakdown[eventKey] || 0;
                            const eventPoints = eventCount > 0 ? (() => {
                              switch (eventKey) {
                                case 'defensivetd': return eventCount * 20;
                                case 'safety': return eventCount * 15;
                                case 'gameendingfumble': return eventCount * 50;
                                case 'gamewinningdrive': return eventCount * -12;
                                case 'benching': return eventCount * 35;
                                default: return 0;
                              }
                            })() : 0;
                            
                            return (
                              <td key={teamIdx} className="py-4 px-4 border-l border-slate-700/30 bg-blue-500/5">
                                {eventCount > 0 ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-base font-semibold text-slate-100 tabular-nums">×{eventCount}</span>
                                    <PointsDisplay points={eventPoints} />
                                  </div>
                                ) : (
                                  <span className="text-slate-600 text-xs">—</span>
                                )}
                              </td>
                            );
                          })}
                          {team1Breakdown.length > 0 && team2Breakdown.length > 0 && (
                            <td className="py-4 px-3 border-x-2 border-slate-600/50 bg-slate-800 z-10">
                              {/* Separator column */}
                            </td>
                          )}
                          {team2Breakdown.map(({ qb, breakdown }, teamIdx) => {
                            if (!breakdown) {
                              return (
                                <td key={`team2-${teamIdx}`} className="py-4 px-4 border-l border-slate-700/30 bg-purple-500/5">
                                  <span className="text-slate-600 text-xs">—</span>
                                </td>
                              );
                            }
                            
                            const eventKey = eventType.toLowerCase().replace(/\s+/g, '');
                            const eventCount = breakdown[eventKey] || 0;
                            const eventPoints = eventCount > 0 ? (() => {
                              switch (eventKey) {
                                case 'defensivetd': return eventCount * 20;
                                case 'safety': return eventCount * 15;
                                case 'gameendingfumble': return eventCount * 50;
                                case 'gamewinningdrive': return eventCount * -12;
                                case 'benching': return eventCount * 35;
                                default: return 0;
                              }
                            })() : 0;
                            
                            return (
                              <td key={`team2-${teamIdx}`} className="py-4 px-4 border-l border-slate-700/30 bg-purple-500/5">
                                {eventCount > 0 ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-base font-semibold text-slate-100 tabular-nums">×{eventCount}</span>
                                    <PointsDisplay points={eventPoints} />
                                  </div>
                                ) : (
                                  <span className="text-slate-600 text-xs">—</span>
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
        </div>
      </div>
    </div>
  );
};

export default MatchupModal;
