import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';
import AuthCheck from '../components/auth/AuthCheck';
import LeagueNameInput from '../components/league/LeagueNameInput';
import PlayerCountInfo from '../components/league/PlayerCountInfo';
import WeeklyTeamSelector from '../components/league/WeeklyTeamSelector';

const CreateLeague: React.FC = () => {
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState('');
  const [teamsPerWeek, setTeamsPerWeek] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const validateForm = () => {
    if (!leagueName.trim()) {
      setNameError('League name is required');
      return false;
    }
    if (leagueName.trim().length < 3) {
      setNameError('League name must be at least 3 characters');
      return false;
    }
    setNameError(null);
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
        2025, // Current season
        teamsPerWeek
      );

      // Redirect to the new league dashboard using 8-character ID
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

  return (
    <AuthCheck>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-3xl mx-auto px-8 py-24">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-light text-white mb-4 leading-tight">
              Create Your League
            </h1>
            <p className="text-slate-400 leading-relaxed font-light max-w-2xl mx-auto">
              Set up your Bad QB League with custom settings and invite your friends
              to compete for the worst quarterback performances.
            </p>
          </div>

          {/* Form */}
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

            {/* Submit Buttons */}
            <div className="flex items-center justify-between pt-8 border-t border-slate-700">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 text-slate-400 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-blue-600 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                    Creating League...
                  </span>
                ) : (
                  'Create League'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AuthCheck>
  );
};

export default CreateLeague;