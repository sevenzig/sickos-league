import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import TeamLogo from '../TeamLogo';
import FantasyTeamRosterModal from '../league/FantasyTeamRosterModal';

interface SeasonWLTChartProps {
  leagueId: string;
  teams: string[];
  weeks: number[];
  teamWeekResults: Record<string, string>;
  teamRecords: Record<string, string>;
  teamWeekMatchupDetails: Record<string, any>;
  openWLTModal: (teamName: string, week: number) => void;
  /** Maps fantasy team name → fantasy_team_id for roster lookup */
  teamIdByName?: Record<string, string>;
}

interface HoveredCell {
  teamName: string;
  week: number;
  rect: DOMRect;
}

const SeasonWLTChart: React.FC<SeasonWLTChartProps> = ({
  leagueId,
  teams,
  weeks,
  teamWeekResults,
  teamRecords,
  teamWeekMatchupDetails,
  openWLTModal,
  teamIdByName = {},
}) => {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [loading, setLoading] = useState(true);
  const [rosterTeamName, setRosterTeamName] = useState<string | null>(null);

  // Simulate loading state based on data availability
  useEffect(() => {
    if (leagueId && teams.length > 0) {
      // Simulate a brief loading period for consistency with other components
      const timer = setTimeout(() => {
        setLoading(false);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setLoading(true);
    }
  }, [leagueId, teams]);

  const calculateTooltipPosition = (cellRect: DOMRect, isNearBottom: boolean) => {
    const tooltipWidth = 240;
    const tooltipHeight = 120;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;

    let left = cellRect.left + cellRect.width / 2 - tooltipWidth / 2;
    let top = isNearBottom
      ? cellRect.top + scrollY - tooltipHeight - 10
      : cellRect.bottom + scrollY + 10;

    // Adjust for viewport boundaries
    if (left < 10) left = 10;
    if (left + tooltipWidth > viewportWidth - 10) left = viewportWidth - tooltipWidth - 10;
    if (top < scrollY + 10) top = cellRect.bottom + scrollY + 10;
    if (top + tooltipHeight > viewportHeight + scrollY - 10) top = cellRect.top + scrollY - tooltipHeight - 10;

    return { left, top };
  };

  return (
    <>
      <div className="xl:col-span-2 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-black text-slate-50 tracking-tight">Season W/L/T Chart</h3>
          {/* Legend */}
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-500 rounded-lg"></div>
              <span className="text-slate-300 font-medium">Win</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-rose-500 rounded-lg"></div>
              <span className="text-slate-300 font-medium">Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded-lg"></div>
              <span className="text-slate-300 font-medium">Tie</span>
            </div>
          </div>
        </div>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-3 py-3 lg:px-2 lg:py-2 xl:px-4 xl:py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-32 sticky left-0 bg-slate-800/95 backdrop-blur-sm z-10">Team</th>
                  {weeks.map(week => (
                    <th key={week} className="px-2 py-3 lg:px-1 lg:py-2 xl:px-2 xl:py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider w-8">
                      {week}
                    </th>
                  ))}
                  <th className="px-4 py-3 lg:px-2 lg:py-2 xl:px-4 xl:py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider w-16">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {loading ? (
                  <tr>
                    <td colSpan={weeks.length + 2} className="px-4 py-8 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        <p className="text-slate-400 text-sm">Loading season data...</p>
                      </div>
                    </td>
                  </tr>
                ) : teams.length > 0 ? (
                  teams.map((teamName, teamIndex) => {
                    const record = teamRecords[teamName] || '0-0';
                    return (
                      <tr key={teamName} className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                        teamIndex % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                      }`}>
                        <td className="px-3 py-3 lg:px-2 lg:py-2 xl:px-4 xl:py-4 text-sm font-medium text-slate-200 sticky left-0 bg-slate-800/95 backdrop-blur-sm z-10">
                          {teamIdByName[teamName] ? (
                            <button
                              type="button"
                              onClick={() => setRosterTeamName(teamName)}
                              className="rounded-lg hover:bg-slate-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 transition-colors"
                              aria-label={`View ${teamName} roster`}
                            >
                              <TeamLogo teamName={teamName} size="sm" showName={true} className="lg:text-xs xl:text-sm" />
                            </button>
                          ) : (
                            <TeamLogo teamName={teamName} size="sm" showName={true} className="lg:text-xs xl:text-sm" />
                          )}
                        </td>
                        {weeks.map((week, weekIndex) => {
                          const key = `${teamName}-${week}`;
                          const result = teamWeekResults[key];
                          const matchupDetails = teamWeekMatchupDetails[key];
                          const isNearBottom = teamIndex >= teams.length - 3; // Last 3 rows show tooltip above
                          return (
                            <td
                              key={week}
                              className={`px-2 py-3 lg:py-2 xl:py-4 text-center ${
                                result ? 'group min-w-11 min-h-11 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800' : ''
                              }`}
                              onClick={result ? () => openWLTModal(teamName, week) : undefined}
                              onKeyDown={result ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openWLTModal(teamName, week);
                                }
                              } : undefined}
                              role={result ? 'button' : undefined}
                              tabIndex={result ? 0 : undefined}
                              onMouseEnter={result ? (e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredCell({ teamName, week, rect });
                              } : undefined}
                              onMouseLeave={result ? () => setHoveredCell(null) : undefined}
                            >
                              {result && (
                                <div
                                  className={`w-7 h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 rounded-lg flex items-center justify-center text-xs font-bold mx-auto transition-all duration-200 group-hover:ring-2 group-hover:ring-blue-400 group-hover:scale-110 ${
                                    result === 'W'
                                      ? 'bg-emerald-500 text-white group-hover:bg-emerald-400'
                                      : result === 'L'
                                      ? 'bg-rose-500 text-white group-hover:bg-rose-400'
                                      : 'bg-yellow-500 text-black group-hover:bg-yellow-400'
                                  }`}
                                >
                                  {result}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 lg:py-2 xl:py-4 text-center text-sm font-bold text-emerald-400 tabular-nums">{record}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={weeks.length + 2} className="px-4 py-8 text-center text-slate-400">
                      No season data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Portal Tooltip */}
      {hoveredCell && (() => {
        const key = `${hoveredCell.teamName}-${hoveredCell.week}`;
        const matchupDetails = teamWeekMatchupDetails[key];
        if (!matchupDetails) return null;

        const teamIndex = teams.indexOf(hoveredCell.teamName);
        const isNearBottom = teamIndex >= teams.length - 3;
        const position = calculateTooltipPosition(hoveredCell.rect, isNearBottom);

        return createPortal(
          <div
            key={`tooltip-${hoveredCell.teamName}-${hoveredCell.week}`}
            className="fixed z-40 pointer-events-none"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
          >
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 text-xs rounded-2xl p-4 shadow-panel border border-slate-700/50 backdrop-blur-xl">
              <div className="flex items-center gap-6">
                {/* Hovered team (always left side) */}
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2">
                    <TeamLogo teamName={hoveredCell.teamName} size="sm" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {matchupDetails.teamQBs?.map((qb: string) => (
                      <div key={qb} className="w-5 h-5">
                        <TeamLogo teamName={qb} size="xs" />
                      </div>
                    ))}
                  </div>
                  <div className={`font-black text-lg tabular-nums ${
                    matchupDetails.teamScore > matchupDetails.opponentScore
                      ? 'text-emerald-400'
                      : matchupDetails.teamScore < matchupDetails.opponentScore
                      ? 'text-rose-400'
                      : 'text-slate-200'
                  }`}>
                    {matchupDetails.teamScore || 0}
                  </div>
                </div>

                {/* Opponent (always right side) */}
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2">
                    <TeamLogo teamName={matchupDetails.opponent} size="sm" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {matchupDetails.opponentQBs?.map((qb: string) => (
                      <div key={qb} className="w-5 h-5">
                        <TeamLogo teamName={qb} size="xs" />
                      </div>
                    ))}
                  </div>
                  <div className={`font-black text-lg tabular-nums ${
                    matchupDetails.opponentScore > matchupDetails.teamScore
                      ? 'text-emerald-400'
                      : matchupDetails.opponentScore < matchupDetails.teamScore
                      ? 'text-rose-400'
                      : 'text-slate-200'
                  }`}>
                    {matchupDetails.opponentScore || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      <FantasyTeamRosterModal
        isOpen={Boolean(rosterTeamName && teamIdByName[rosterTeamName])}
        onClose={() => setRosterTeamName(null)}
        fantasyTeamId={rosterTeamName ? teamIdByName[rosterTeamName] ?? null : null}
        teamName={rosterTeamName ?? ''}
      />
    </>
  );
};

export default SeasonWLTChart;