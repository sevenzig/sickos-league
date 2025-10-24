import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LeagueData } from '../types';
import { loadLeagueData, saveLeagueData } from '../utils/storage';
import { calculateTeamRecords } from '../utils/scoring';
import { getAvailableWeeks } from '../utils/csvLoader';

interface LeagueContextType {
  leagueData: LeagueData;
  updateLeagueData: (data: LeagueData) => void;
  setCurrentWeek: (week: number) => void;
  addGameStats: (teamName: string, week: number, qbStats: any) => void;
  setLineup: (teamName: string, week: number, activeQBs: string[]) => void;
  addMatchup: (week: number, team1: string, team2: string) => void;
  updateMatchupScores: (week: number, team1: string, team2: string, team1Score: number, team2Score: number) => void;
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
  const [leagueData, setLeagueData] = useState<LeagueData>(() => loadLeagueData());

  // Auto-detect current week based on available CSV data
  useEffect(() => {
    const availableWeeks = getAvailableWeeks();
    if (availableWeeks.length > 0) {
      const lastAvailableWeek = Math.max(...availableWeeks);
      const nextWeek = lastAvailableWeek + 1;
      
      // Only update if the calculated week is different from current
      if (nextWeek !== leagueData.currentWeek) {
        setLeagueData(prev => ({ ...prev, currentWeek: nextWeek }));
      }
    }
  }, []); // Run once on mount

  // Save to localStorage whenever data changes
  useEffect(() => {
    saveLeagueData(leagueData);
  }, [leagueData]);

  // Recalculate records when matchups change
  useEffect(() => {
    const calculatedRecords = calculateTeamRecords(leagueData.matchups, leagueData.teams);
    // Only update if records are different to avoid infinite loop
    const recordsChanged = JSON.stringify(calculatedRecords) !== JSON.stringify(leagueData.records);
    if (recordsChanged) {
      setLeagueData(prev => ({ ...prev, records: calculatedRecords }));
    }
  }, [leagueData.matchups, leagueData.records]);

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

  const setLineup = (teamName: string, week: number, activeQBs: string[]) => {
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

  const updateMatchupScores = (week: number, team1: string, team2: string, team1Score: number, team2Score: number) => {
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
  };

  const value: LeagueContextType = {
    leagueData,
    updateLeagueData,
    setCurrentWeek,
    addGameStats,
    setLineup,
    addMatchup,
    updateMatchupScores
  };

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
}
