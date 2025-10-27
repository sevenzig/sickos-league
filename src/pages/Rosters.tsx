import React from 'react';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';

const Rosters: React.FC = () => {
  const { leagueData } = useLeagueData();

  // Helper function to calculate how many times a QB has been started
  const getStartCount = (teamName: string, qbName: string): number => {
    return leagueData.lineups
      .filter(lineup => lineup.teamName === teamName)
      .reduce((count, lineup) => {
        return count + (lineup.activeQBs.includes(qbName) ? 1 : 0);
      }, 0);
  };

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] py-6 px-8">
        <h2 className="text-2xl font-black text-slate-50 tracking-tight mb-2">Team Rosters</h2>
        <p className="text-sm text-slate-400">Each team drafted 4 NFL team QBs for the season</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {leagueData.teams.map((team, index) => (
          <div key={team.name} className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 hover:bg-slate-700/20 transition-all duration-200 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] py-6 px-6">
            <div className="flex items-center justify-between mb-4">
              <TeamLogo teamName={team.name} size="md" showName={true} />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">#{index + 1}</span>
            </div>
            
            <div className="space-y-2">
              {team.rosters.map((qb, qbIndex) => {
                const startCount = getStartCount(team.name, qb);
                return (
                  <div key={qbIndex} className="flex items-center justify-between bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/30 hover:bg-slate-700/20 transition-colors duration-150 px-4 py-3">
                    <TeamLogo teamName={qb} size="sm" showName={true} />
                    <span className="text-xs font-medium text-slate-400 tabular-nums">
                      {startCount} {startCount === 1 ? 'start' : 'starts'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default Rosters;
