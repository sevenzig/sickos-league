import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import LeagueHeader from '../components/league/LeagueHeader';
import WeekNavigation from '../components/navigation/WeekNavigation';
import MatchupCards from '../components/league/MatchupCards';

// Phase 5.3: full-season schedule page - week-by-week matchups.
const LeagueSchedule: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [fullLeagueId, setFullLeagueId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!leagueId) return;
      try {
        const resolved = await MultiLeagueApi.resolveLeagueId(leagueId);
        setFullLeagueId(resolved);

        // Current week = first week after the latest finalized one
        const schedule = await MultiLeagueApi.getLeagueSchedule(resolved).catch(() => []);
        const completedWeeks = schedule.filter(m => m.is_complete).map(m => m.week);
        const week = completedWeeks.length > 0 ? Math.min(18, Math.max(...completedWeeks) + 1) : 1;
        setCurrentWeek(week);
        setSelectedWeek(week);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      }
    };
    load();
  }, [leagueId]);

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeagueHeader leagueId={leagueId!} active="schedule" />

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          <WeekNavigation
            selectedWeek={selectedWeek}
            currentWeek={currentWeek}
            onWeekChange={setSelectedWeek}
            onGoToCurrentWeek={() => setSelectedWeek(currentWeek)}
          />

          {fullLeagueId && <MatchupCards leagueId={fullLeagueId} week={selectedWeek} />}
        </div>
      </div>
    </div>
  );
};

export default LeagueSchedule;
