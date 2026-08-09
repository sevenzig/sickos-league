import React from 'react';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';
import { PageChrome, Panel } from '../components/ui';

const Rosters: React.FC = () => {
  const { leagueData } = useLeagueData();

  const getStartCount = (teamName: string, qbName: string): number =>
    leagueData.lineups
      .filter((lineup) => lineup.teamName === teamName)
      .reduce((count, lineup) => count + (lineup.activeQBs.includes(qbName) ? 1 : 0), 0);

  return (
    <div className="space-y-6">
      <PageChrome title="Team Rosters" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {leagueData.teams.map((team, index) => (
          <Panel key={team.name} className="hover:shadow-panel-hover transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <TeamLogo teamName={team.name} size="md" showName />
              <span className="text-caption font-bold text-slate-500 uppercase tracking-wider">
                #{index + 1}
              </span>
            </div>
            <div className="space-y-2">
              {team.rosters.map((qb, qbIndex) => {
                const startCount = getStartCount(team.name, qb);
                return (
                  <div
                    key={qbIndex}
                    className="flex items-center justify-between bg-slate-800/40 rounded-md border border-slate-700/30 hover:bg-slate-700/20 transition-colors px-3 py-2"
                  >
                    <TeamLogo teamName={qb} size="sm" showName />
                    <span className="text-caption text-slate-400 tabular-nums">
                      {startCount} {startCount === 1 ? 'start' : 'starts'}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
};

export default Rosters;
