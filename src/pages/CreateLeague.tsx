import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';
import AuthCheck from '../components/auth/AuthCheck';
import LeagueNameInput from '../components/league/LeagueNameInput';
import PlayerCountInfo from '../components/league/PlayerCountInfo';
import WeeklyTeamSelector from '../components/league/WeeklyTeamSelector';
import DraftSetupFields, {
  DraftMode,
  PickSeconds,
  fromDatetimeLocalValue,
} from '../components/league/DraftSetupFields';

const CreateLeague: React.FC = () => {
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState('');
  const [teamsPerWeek, setTeamsPerWeek] = useState(2);
  const [draftMode, setDraftMode] = useState<DraftMode>('async');
  const [draftAtLocal, setDraftAtLocal] = useState('');
  const [draftPickSeconds, setDraftPickSeconds] = useState<PickSeconds>(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [draftAtError, setDraftAtError] = useState<string | null>(null);

  const validateForm = () => {
    if (!leagueName.trim()) {
      setNameError('League name is required');
      return false;
    }
    if (leagueName.trim().length < 3) {
      setNameError('League name must be at least 3 characters');
      return false;
    }
    if (draftMode === 'live') {
      if (!draftAtLocal) {
        setDraftAtError('Live drafts require a scheduled draft time');
        return false;
      }
      if (new Date(draftAtLocal).getTime() <= Date.now()) {
        setDraftAtError('Scheduled draft time must be in the future');
        return false;
      }
    }
    setNameError(null);
    setDraftAtError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const leagueId = await MultiLeagueApi.createLeague(
        leagueName.trim(),
        2025,
        teamsPerWeek,
        {
          draftMode,
          draftAt: draftMode === 'live' ? fromDatetimeLocalValue(draftAtLocal) : null,
          draftPickSeconds,
        }
      );

      navigate(getLeagueUrl(leagueId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (value: string) => {
    setLeagueName(value);
    if (nameError) {
      setNameError(null);
    }
  };

  const handleDraftAtChange = (value: string) => {
    setDraftAtLocal(value);
    if (draftAtError) {
      setDraftAtError(null);
    }
  };

  return (
    <AuthCheck message="You need to be signed in to create a league.">
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-3xl mx-auto px-8 py-24">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-light text-white mb-4 leading-tight">
              Create Your League
            </h1>
            <p className="text-slate-400 leading-relaxed font-light max-w-2xl mx-auto">
              Set up your Bad QB League with custom settings and invite your friends
              to compete for the worst quarterback performances.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            <LeagueNameInput
              value={leagueName}
              onChange={handleNameChange}
              error={nameError ?? undefined}
            />

            <PlayerCountInfo />

            <WeeklyTeamSelector
              value={teamsPerWeek}
              onChange={setTeamsPerWeek}
            />

            <div className="bg-white/5 border border-slate-700 rounded-lg p-6">
              <DraftSetupFields
                draftMode={draftMode}
                draftAtLocal={draftAtLocal}
                draftPickSeconds={draftPickSeconds}
                onDraftModeChange={setDraftMode}
                onDraftAtChange={handleDraftAtChange}
                onPickSecondsChange={setDraftPickSeconds}
                error={draftAtError ?? undefined}
                showHint
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => navigate('/my-leagues')}
                className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Creating...' : 'Create League'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AuthCheck>
  );
};

export default CreateLeague;
