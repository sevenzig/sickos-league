import React, { useState } from 'react';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';

const SetLineups: React.FC = () => {
  const { leagueData, setLineup, lockWeek, isWeekLocked } = useLeagueData();
  const [selectedWeek, setSelectedWeek] = useState(leagueData.currentWeek);
  const [lineups, setLineups] = useState<{ [teamName: string]: string[] }>({});

  // Initialize lineups state with existing data
  React.useEffect(() => {
    const existingLineups = leagueData.lineups.filter(l => l.week === selectedWeek);
    const initialLineups: { [teamName: string]: string[] } = {};
    existingLineups.forEach(lineup => {
      initialLineups[lineup.teamName] = lineup.activeQBs;
    });
    setLineups(initialLineups);
  }, [selectedWeek, leagueData.lineups]);

  const handleQBSelection = (teamName: string, qb: string, isSelected: boolean) => {
    setLineups(prev => {
      const currentQBs = prev[teamName] || [];
      let newQBs;
      
      if (isSelected) {
        if (currentQBs.length >= 2) return prev; // Max 2 QBs
        newQBs = [...currentQBs, qb];
      } else {
        newQBs = currentQBs.filter(q => q !== qb);
      }
      
      return { ...prev, [teamName]: newQBs };
    });
  };

  const saveLineups = () => {
    const incompleteTeams: string[] = [];
    
    // Check all teams have 2 QBs selected
    leagueData.teams.forEach(team => {
      const teamLineup = lineups[team.name] || [];
      if (teamLineup.length !== 2) {
        incompleteTeams.push(team.name);
      }
    });

    if (incompleteTeams.length > 0) {
      alert(`The following teams need 2 QBs selected: ${incompleteTeams.join(', ')}`);
      return;
    }

    // Save all lineups
    Object.entries(lineups).forEach(([teamName, activeQBs]) => {
      setLineup(teamName, selectedWeek, activeQBs);
    });

    // Lock the week
    lockWeek(selectedWeek);
    alert('All lineups saved and week locked successfully!');
  };

  const canEditWeek = selectedWeek >= leagueData.currentWeek && !isWeekLocked(selectedWeek);

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4">
      {/* Week Selection and Finalize Section */}
      <div className="bg-dark-surface rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">Finalize Lineups</h2>
            <div className="text-sm text-gray-400">
              {Object.values(lineups).filter(qbs => qbs.length === 2).length} of {leagueData.teams.length} teams complete
            </div>
            {!canEditWeek && (
              <div className="px-3 py-1 bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded text-yellow-200 text-sm">
                Lineups locked
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Week:</label>
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(Number(e.target.value));
                }}
                className="bg-gray-700 text-white rounded px-2 py-1 text-sm focus-ring"
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </div>
            
            {canEditWeek && (
              <button
                onClick={saveLineups}
                className="px-4 py-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded text-sm transition-colors focus-ring"
              >
                Save All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Team Lineups - 2x4 Grid Layout */}
      <div className="grid grid-cols-4 gap-6">
        {leagueData.teams.map(team => {
          const teamLineup = lineups[team.name] || [];
          const isComplete = teamLineup.length === 2;
          
          return (
            <div key={team.name} className="bg-gray-800 rounded-lg flex flex-col">
              {/* Team Header */}
              <div className="flex items-center justify-between p-2 border-b border-gray-700">
                <TeamLogo teamName={team.name} size="sm" showName={true} className="text-sm" />
                <div className="flex items-center space-x-1">
                  <span className={`text-xs px-1 py-1 rounded ${
                    isComplete ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}>
                    {teamLineup.length}/2
                  </span>
                </div>
              </div>
              
              {/* QB Grid - 2x2 within each team card */}
              <div className="grid grid-cols-2 gap-2 flex-1 p-3">
                {team.rosters.map(qb => {
                  const isSelected = teamLineup.includes(qb);
                  const canSelect = !isSelected && teamLineup.length < 2;
                  
                  return (
                    <button
                      key={qb}
                      onClick={() => canEditWeek && handleQBSelection(team.name, qb, !isSelected)}
                      disabled={!canEditWeek || (!isSelected && !canSelect)}
                      className={`rounded text-left transition-colors flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-green-600 text-white'
                          : canSelect
                          ? 'bg-gray-600 hover:bg-gray-500 text-white'
                          : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      }`}
                      style={{width: '128px', height: '128px', minWidth: '128px', minHeight: '128px'}}
                    >
                      <TeamLogo teamName={qb} size="sm" className="mb-1" />
                      <span className="text-xs font-medium text-center leading-tight">{qb}</span>
                      {isSelected && <span className="text-green-200 text-xs mt-1">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default SetLineups;
