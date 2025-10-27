import React, { useState } from 'react';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';

const SetLineups: React.FC = () => {
  const { leagueData, setLineup, lockWeek, lockTeamLineup, isWeekLocked, isTeamLineupLocked } = useLeagueData();
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // Initialize with current week if data is available, otherwise default to 1
    return leagueData.currentWeek || 1;
  });
  const [lineups, setLineups] = useState<{ [teamName: string]: string[] }>({});
  const [hasManuallyNavigated, setHasManuallyNavigated] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(false);

  // Sync selectedWeek with leagueData.currentWeek on initial load (only if user hasn't manually navigated)
  React.useEffect(() => {
    if (!hasManuallyNavigated && leagueData.currentWeek && leagueData.currentWeek !== selectedWeek) {
      setSelectedWeek(leagueData.currentWeek);
    }
  }, [leagueData.currentWeek, hasManuallyNavigated, selectedWeek]);

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

  const handleLockTeam = async (teamName: string) => {
    const teamLineup = lineups[teamName] || [];
    if (teamLineup.length !== 2) {
      alert(`${teamName} needs 2 QBs selected before locking`);
      return;
    }

    try {
      // Save the lineup first
      await setLineup(teamName, selectedWeek, teamLineup);
      
      // Then lock it
      await lockTeamLineup(teamName, selectedWeek);
      
      alert(`${teamName} lineup locked successfully!`);
    } catch (error) {
      console.error('Failed to lock team lineup:', error);
      alert(`Failed to lock ${teamName} lineup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const finalizeWeeklyLineups = async () => {
    const incompleteTeams: string[] = [];
    const unlockedTeams: string[] = [];
    
    // Check all teams have 2 QBs selected (only for unlocked teams)
    leagueData.teams.forEach(team => {
      const isLocked = isTeamLineupLocked(team.name, selectedWeek);
      
      if (!isLocked) {
        unlockedTeams.push(team.name);
        // For unlocked teams, check the local lineups state
        const teamLineup = lineups[team.name] || [];
        if (teamLineup.length !== 2) {
          incompleteTeams.push(team.name);
        }
      }
    });

    if (incompleteTeams.length > 0) {
      alert(`The following teams need 2 QBs selected: ${incompleteTeams.join(', ')}`);
      return;
    }

    if (unlockedTeams.length === 0) {
      // Check if week is already locked
      if (isWeekLocked(selectedWeek)) {
        alert(`Week ${selectedWeek} has already been finalized and locked. All teams are locked and no further changes can be made.`);
      } else {
        alert(`All teams are already locked for week ${selectedWeek}. The week can now be finalized.`);
      }
      return;
    }

    try {
      // Save and lock all unlocked lineups
      for (const teamName of unlockedTeams) {
        const teamLineup = lineups[teamName] || [];
        await setLineup(teamName, selectedWeek, teamLineup);
        await lockTeamLineup(teamName, selectedWeek);
      }

      // Lock the week globally
      await lockWeek(selectedWeek);
      
      const weekAlreadyLocked = isWeekLocked(selectedWeek);
      if (weekAlreadyLocked) {
        alert(`All ${unlockedTeams.length} remaining lineups locked! Week ${selectedWeek} was already finalized.`);
      } else {
        alert(`All ${unlockedTeams.length} remaining lineups locked and week ${selectedWeek} finalized!`);
      }
    } catch (error) {
      console.error('Failed to finalize weekly lineups:', error);
      
      // Provide more specific error messages based on the error type
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.message.includes('Failed to lock week')) {
          errorMessage = `Failed to finalize week ${selectedWeek}. The week may already be locked or there was a database error. Please try refreshing the page and checking if the week is already finalized.`;
        } else if (error.message.includes('Team') && error.message.includes('not found')) {
          errorMessage = `Database error: ${error.message}. Please check your connection and try again.`;
        } else {
          errorMessage = `Failed to finalize lineups: ${error.message}`;
        }
      }
      
      alert(errorMessage);
    }
  };

  const saveLineups = async () => {
    const failedTeams: string[] = [];
    
    try {
      // Save all current lineup selections without locking them
      for (const teamName of leagueData.teams.map(team => team.name)) {
        const teamLineup = lineups[teamName] || [];
        if (teamLineup.length === 2) {
          try {
            await setLineup(teamName, selectedWeek, teamLineup);
          } catch (error) {
            console.error(`Failed to save ${teamName} lineup:`, error);
            failedTeams.push(teamName);
          }
        }
      }
      
      if (failedTeams.length > 0) {
        alert(`Failed to save lineups for: ${failedTeams.join(', ')}`);
      } else {
        alert('Lineups saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save lineups:', error);
      alert(`Failed to save lineups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const canEditWeek = selectedWeek >= leagueData.currentWeek && !isWeekLocked(selectedWeek);
  
  const getUnlockedTeamsCount = () => {
    return leagueData.teams.filter(team => !isTeamLineupLocked(team.name, selectedWeek)).length;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4">
      {/* Week Selection and Finalize Section */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] py-6 px-8">
        {/* Mobile Layout */}
        <div className="sm:hidden">
          {/* Top row: Title and Info button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-slate-50 tracking-tight">Finalize Lineups</h2>
            <button
              onClick={() => setShowMobileInfo(!showMobileInfo)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/20 rounded-lg transition-all duration-200"
              title="Show lineup status"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
          
          {/* Collapsible info section */}
          {showMobileInfo && (
            <div className="mb-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span>{Object.values(lineups).filter(qbs => qbs.length === 2).length} of {leagueData.teams.length} teams complete</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>{leagueData.teams.filter(team => isTeamLineupLocked(team.name, selectedWeek)).length} teams locked</span>
              </div>
              {!canEditWeek && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg border border-yellow-500/30 text-sm font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  Lineups locked
                </div>
              )}
            </div>
          )}
          
          {/* Main controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Week:</label>
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(Number(e.target.value));
                  setHasManuallyNavigated(true);
                }}
                className="bg-slate-800/90 text-slate-200 border border-slate-700/50 rounded-lg px-3 py-2 text-sm hover:bg-slate-700/50 transition-colors focus-ring"
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </div>
            
            {canEditWeek && (
              <div className="flex items-center gap-2">
                <button
                  onClick={saveLineups}
                  className="px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg text-xs font-medium transition-all duration-200 focus-ring"
                >
                  Save
                </button>
                <button
                  onClick={finalizeWeeklyLineups}
                  className="px-3 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg text-xs font-medium transition-all duration-200 focus-ring"
                >
                  Finalize ({getUnlockedTeamsCount()})
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-black text-slate-50 tracking-tight">Finalize Lineups</h2>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span>{Object.values(lineups).filter(qbs => qbs.length === 2).length} of {leagueData.teams.length} teams complete</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>{leagueData.teams.filter(team => isTeamLineupLocked(team.name, selectedWeek)).length} teams locked</span>
            </div>
            {!canEditWeek && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg border border-yellow-500/30 text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Lineups locked
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Week:</label>
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(Number(e.target.value));
                  setHasManuallyNavigated(true);
                }}
                className="bg-slate-800/90 text-slate-200 border border-slate-700/50 rounded-lg px-4 py-2 text-sm hover:bg-slate-700/50 transition-colors focus-ring"
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </div>
            
            {canEditWeek && (
              <>
                <button
                  onClick={saveLineups}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg text-sm font-medium transition-all duration-200 focus-ring"
                >
                  Save Lineups
                </button>
                <button
                  onClick={finalizeWeeklyLineups}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg text-sm font-medium transition-all duration-200 focus-ring"
                >
                  Finalize Weekly Lineups ({getUnlockedTeamsCount()} remaining)
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Team Lineups - Responsive Grid Layout */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {leagueData.teams.map(team => {
          const teamLineup = lineups[team.name] || [];
          const isComplete = teamLineup.length === 2;
          const isLocked = isTeamLineupLocked(team.name, selectedWeek);
          const canEdit = canEditWeek && !isLocked;
          
          return (
            <div key={team.name} className={`bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] flex flex-col hover:bg-slate-700/20 transition-all duration-200 ${
              isLocked ? 'border-emerald-500/50 shadow-[0_15px_40px_-10px_rgba(16,185,129,0.2)]' : ''
            }`}>
              {/* Team Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700/30">
                <TeamLogo teamName={team.name} size="sm" showName={true} className="text-sm" />
                <div className="flex items-center gap-2">
                  {isLocked ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Locked
                    </span>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-lg font-bold tabular-nums ${
                      isComplete ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                    }`}>
                      {teamLineup.length}/2
                    </span>
                  )}
                  {isComplete && !isLocked && canEditWeek && (
                    <button
                      onClick={() => handleLockTeam(team.name)}
                      className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg transition-all duration-200 font-medium"
                    >
                      Lock
                    </button>
                  )}
                </div>
              </div>
              
              {/* QB Grid - 2x2 within each team card */}
              <div className="grid grid-cols-2 gap-3 flex-1 p-4">
                {team.rosters.map(qb => {
                  const isSelected = teamLineup.includes(qb);
                  const canSelect = !isSelected && teamLineup.length < 2;
                  
                  return (
                    <button
                      key={qb}
                      onClick={() => canEdit && handleQBSelection(team.name, qb, !isSelected)}
                      disabled={!canEdit || (!isSelected && !canSelect)}
                      className={`rounded-lg text-left transition-all duration-200 flex flex-col items-center justify-center w-24 h-24 md:w-32 md:h-32 border ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                          : canSelect
                          ? 'bg-slate-800/40 text-slate-200 border-slate-700/30 hover:bg-slate-700/40 hover:border-slate-600/50'
                          : 'bg-slate-800/20 text-slate-500 border-slate-700/20 cursor-not-allowed'
                      }`}
                    >
                      <TeamLogo teamName={qb} size="sm" className="mb-2" />
                      <span className="text-xs font-medium text-center leading-tight">{qb}</span>
                      {isSelected && (
                        <span className="text-emerald-400 text-xs mt-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
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
