import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LeagueData } from '../types';
import { loadLeagueData, saveLeagueData, loadLeagueDataFromLocal, hasPendingChanges, isOnline, syncToDatabase, syncFromDatabase } from '../utils/storage';
import { calculateTeamRecords } from '../utils/scoring';
import { getAvailableWeeks } from '../utils/csvLoader';
import { saveLineup, updateMatchupScores, lockWeek as lockWeekDB, lockTeamLineup as lockTeamLineupDB } from '../services/database';

interface LeagueContextType {
  leagueData: LeagueData;
  updateLeagueData: (data: LeagueData) => void;
  setCurrentWeek: (week: number) => void;
  addGameStats: (teamName: string, week: number, qbStats: any) => void;
  setLineup: (teamName: string, week: number, activeQBs: string[]) => void;
  addMatchup: (week: number, team1: string, team2: string) => void;
  updateMatchupScores: (week: number, team1: string, team2: string, team1Score: number, team2Score: number) => void;
  lockWeek: (week: number) => void;
  lockTeamLineup: (teamName: string, week: number) => void;
  isWeekLocked: (week: number) => boolean;
  isTeamLineupLocked: (teamName: string, week: number) => boolean;
  // Sync status
  isOnline: boolean;
  hasPendingChanges: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncToDatabase: () => Promise<void>;
  syncFromDatabase: () => Promise<void>;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function useLeagueData() {
  const context = useContext(LeagueContext);
  if (context === undefined) {
    throw new Error('useLeagueData must be used within a LeagueProvider');
  }
  return context;
}

interface LeagueProviderProps {
  children: ReactNode;
}

export function LeagueProvider({ children }: LeagueProviderProps) {
  const [leagueData, setLeagueData] = useState<LeagueData>(() => ({
    teams: [],
    lineups: [],
    gameStats: [],
    matchups: [],
    currentWeek: 1,
    records: [],
    lockedWeeks: []
  }));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [isOnlineState, setIsOnlineState] = useState(isOnline());
  const [hasPendingChangesState, setHasPendingChangesState] = useState(hasPendingChanges());

  // Optional: Clear localStorage to force database sync (uncomment for first-time database migration)
  useEffect(() => {
    // Uncomment the line below to clear localStorage and force database sync
    // localStorage.removeItem('bad-qb-league-data');
    // localStorage.removeItem('bad-qb-league-data-last-sync');
    console.log('🔧 localStorage cleanup effect ready (commented out)');
  }, []);

  // Load data from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setSyncStatus('syncing');
        console.log('🔄 Loading data from database...');
        
        const dbData = await loadLeagueData();
        if (dbData && dbData.teams.length > 0) {
          setLeagueData(dbData);
          console.log('✅ Loaded data from database:', {
            teams: dbData.teams.length,
            lineups: dbData.lineups.length,
            matchups: dbData.matchups.length,
            gameStats: dbData.gameStats.length,
            currentWeek: dbData.currentWeek
          });
        } else {
          console.log('⚠️ No database data found, using fallback');
        }
        setSyncStatus('idle');
      } catch (error) {
        console.error('❌ Failed to load from database:', error);
        setSyncStatus('error');
        
        // Only fall back to localStorage if database completely fails
        try {
          const localData = loadLeagueDataFromLocal();
          if (localData && localData.teams.length > 0) {
            setLeagueData(localData);
            console.log('📱 Using localStorage fallback data');
          }
        } catch (localError) {
          console.error('❌ localStorage fallback also failed:', localError);
        }
      }
    };

    loadData();
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnlineState(true);
    const handleOffline = () => setIsOnlineState(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor pending changes
  useEffect(() => {
    setHasPendingChangesState(hasPendingChanges());
  }, [leagueData]);

  // Auto-detect current week based on available CSV data (only if not loaded from database)
  useEffect(() => {
    // Only auto-detect if we're using fallback data (not from database)
    if (leagueData.teams.length === 0) return;
    
    const availableWeeks = getAvailableWeeks();
    if (availableWeeks.length > 0) {
      const lastAvailableWeek = Math.max(...availableWeeks);
      const nextWeek = lastAvailableWeek + 1;
      
      // Only update if the calculated week is different from current
      // and we're not using database data (which should have correct currentWeek)
      if (nextWeek !== leagueData.currentWeek && leagueData.currentWeek === 1) {
        setLeagueData(prev => ({ ...prev, currentWeek: nextWeek }));
      }
    }
  }, []); // Run once on mount

  // Save to localStorage whenever data changes
  useEffect(() => {
    saveLeagueData(leagueData);
  }, [leagueData]);

  // Records are now calculated dynamically, no need to store them in state

  const updateLeagueData = (data: LeagueData) => {
    setLeagueData(data);
  };

  const setCurrentWeek = (week: number) => {
    setLeagueData(prev => ({ ...prev, currentWeek: week }));
  };

  const addGameStats = (teamName: string, week: number, qbStats: any) => {
    setLeagueData(prev => {
      const existingStatsIndex = prev.gameStats.findIndex(
        stats => stats.teamName === teamName && stats.week === week
      );

      const newStats = {
        teamName,
        week,
        qbStats,
        calculatedScore: 0 // Will be calculated by the scoring system
      };

      let newGameStats;
      if (existingStatsIndex >= 0) {
        newGameStats = [...prev.gameStats];
        newGameStats[existingStatsIndex] = newStats;
      } else {
        newGameStats = [...prev.gameStats, newStats];
      }

      return { ...prev, gameStats: newGameStats };
    });
  };

  const setLineup = async (teamName: string, week: number, activeQBs: string[]) => {
    // Update local state immediately
    setLeagueData(prev => {
      const existingLineupIndex = prev.lineups.findIndex(
        lineup => lineup.teamName === teamName && lineup.week === week
      );

      const newLineup = { teamName, week, activeQBs };

      let newLineups;
      if (existingLineupIndex >= 0) {
        newLineups = [...prev.lineups];
        newLineups[existingLineupIndex] = newLineup;
      } else {
        newLineups = [...prev.lineups, newLineup];
      }

      return { ...prev, lineups: newLineups };
    });

    // Try to sync to database
    if (isOnlineState) {
      try {
        await saveLineup(teamName, week, activeQBs);
      } catch (error) {
        console.warn('Failed to sync lineup to database:', error);
      }
    }
  };

  const addMatchup = (week: number, team1: string, team2: string) => {
    setLeagueData(prev => {
      const existingMatchupIndex = prev.matchups.findIndex(
        matchup => matchup.week === week && 
        ((matchup.team1 === team1 && matchup.team2 === team2) || 
         (matchup.team1 === team2 && matchup.team2 === team1))
      );

      if (existingMatchupIndex >= 0) {
        return prev; // Matchup already exists
      }

      const newMatchup = {
        week,
        team1,
        team2,
        team1Score: 0,
        team2Score: 0,
        winner: null
      };

      return { ...prev, matchups: [...prev.matchups, newMatchup] };
    });
  };

  const updateMatchupScores = async (week: number, team1: string, team2: string, team1Score: number, team2Score: number) => {
    // Update local state immediately
    setLeagueData(prev => {
      const matchupIndex = prev.matchups.findIndex(
        matchup => matchup.week === week && 
        ((matchup.team1 === team1 && matchup.team2 === team2) || 
         (matchup.team1 === team2 && matchup.team2 === team1))
      );

      if (matchupIndex >= 0) {
        const newMatchups = [...prev.matchups];
        newMatchups[matchupIndex] = {
          ...newMatchups[matchupIndex],
          team1Score,
          team2Score,
          winner: team1Score > team2Score ? team1 : team2
        };
        
        // Recalculate records based on updated matchups
        const newRecords = calculateTeamRecords(newMatchups, prev.teams);
        
        return { ...prev, matchups: newMatchups, records: newRecords };
      }

      return prev;
    });

    // Try to sync to database
    if (isOnlineState) {
      try {
        await updateMatchupScores(week, team1, team2, team1Score, team2Score);
      } catch (error) {
        console.warn('Failed to sync matchup scores to database:', error);
      }
    }
  };

  const lockTeamLineup = async (teamName: string, week: number) => {
    // Update local state immediately
    setLeagueData(prev => {
      const lineupIndex = prev.lineups.findIndex(
        lineup => lineup.teamName === teamName && lineup.week === week
      );

      let newLineups;
      if (lineupIndex >= 0) {
        // Update existing lineup
        newLineups = [...prev.lineups];
        newLineups[lineupIndex] = { ...newLineups[lineupIndex], isLocked: true };
      } else {
        // Create new lineup entry (this shouldn't happen if setLineup was called first)
        console.warn(`No lineup found for ${teamName} week ${week} when trying to lock`);
        return prev;
      }

      return { ...prev, lineups: newLineups };
    });

    // Try to sync to database
    if (isOnlineState) {
      try {
        await lockTeamLineupDB(teamName, week);
      } catch (error) {
        console.warn('Failed to sync team lineup lock to database:', error);
      }
    }
  };

  const isTeamLineupLocked = (teamName: string, week: number) => {
    const lineup = leagueData.lineups.find(
      l => l.teamName === teamName && l.week === week
    );
    return lineup?.isLocked || false;
  };

  const lockWeek = async (week: number) => {
    // Update local state immediately
    setLeagueData(prev => ({
      ...prev,
      lockedWeeks: [...new Set([...prev.lockedWeeks, week])]
    }));

    // Try to sync to database
    if (isOnlineState) {
      try {
        await lockWeekDB(week);
      } catch (error) {
        console.warn('Failed to sync locked week to database:', error);
      }
    }
  };

  const isWeekLocked = (week: number) => {
    return leagueData.lockedWeeks.includes(week);
  };

  // Sync functions
  const handleSyncToDatabase = async () => {
    try {
      setSyncStatus('syncing');
      await syncToDatabase(leagueData);
      setSyncStatus('idle');
    } catch (error) {
      console.error('Sync to database failed:', error);
      setSyncStatus('error');
    }
  };

  const handleSyncFromDatabase = async () => {
    try {
      setSyncStatus('syncing');
      const dbData = await syncFromDatabase();
      if (dbData) {
        setLeagueData(dbData);
      }
      setSyncStatus('idle');
    } catch (error) {
      console.error('Sync from database failed:', error);
      setSyncStatus('error');
    }
  };

  const value: LeagueContextType = {
    leagueData,
    updateLeagueData,
    setCurrentWeek,
    addGameStats,
    setLineup,
    addMatchup,
    updateMatchupScores,
    lockWeek,
    lockTeamLineup,
    isWeekLocked,
    isTeamLineupLocked,
    // Sync status
    isOnline: isOnlineState,
    hasPendingChanges: hasPendingChangesState,
    syncStatus,
    syncToDatabase: handleSyncToDatabase,
    syncFromDatabase: handleSyncFromDatabase
  };

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
}
