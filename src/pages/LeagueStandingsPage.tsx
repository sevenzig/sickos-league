import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import LeagueHeader from '../components/league/LeagueHeader';
import StandingsTable from '../components/league/StandingsTable';
import RecordTable from '../components/league/RecordTable';

// Phase 5.3: standings page - ranked standings plus the sortable records table.
const LeagueStandingsPage: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [fullLeagueId, setFullLeagueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    MultiLeagueApi.resolveLeagueId(leagueId)
      .then(setFullLeagueId)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load league'));
  }, [leagueId]);

  return (
    <div className="space-y-8">
      <LeagueHeader leagueId={leagueId!} active="standings" />

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {fullLeagueId && (
        <div className="space-y-6">
          <StandingsTable leagueId={fullLeagueId} />
          <RecordTable leagueId={fullLeagueId} />
        </div>
      )}
    </div>
  );
};

export default LeagueStandingsPage;
