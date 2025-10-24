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
    <div className="space-y-6">
      <div className="bg-dark-surface rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-2">Team Rosters</h2>
        <p className="text-gray-400">Each team drafted 4 NFL team QBs for the season</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {leagueData.teams.map((team, index) => (
          <div key={team.name} className="bg-dark-card rounded-lg p-4 hover:bg-gray-600 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <TeamLogo teamName={team.name} size="md" showName={true} />
              <span className="text-sm text-gray-400">#{index + 1}</span>
            </div>
            
            <div className="space-y-2">
              {team.rosters.map((qb, qbIndex) => {
                const startCount = getStartCount(team.name, qb);
                return (
                  <div key={qbIndex} className="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
                    <TeamLogo teamName={qb} size="sm" showName={true} />
                    <span className="text-xs text-gray-400">
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
