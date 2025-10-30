import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';

const CreateLeague: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    season: 2025,
    teamsStartedPerWeek: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('League name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const leagueId = await MultiLeagueApi.createLeague(
        formData.name.trim(),
        formData.season,
        formData.teamsStartedPerWeek
      );

      // Redirect to the new league dashboard
      navigate(`/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'season' || name === 'teamsStartedPerWeek' ? parseInt(value) : value,
    }));
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Create New League</h1>
          <p className="text-slate-400 mt-2">
            Set up your Bad QB League with custom settings
          </p>
        </div>

        {/* Form */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* League Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                League Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your league name"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Choose a unique name for your league (e.g., "Office Bad QB League 2025")
              </p>
            </div>

            {/* Season */}
            <div>
              <label htmlFor="season" className="block text-sm font-medium text-slate-300 mb-2">
                Season
              </label>
              <select
                id="season"
                name="season"
                value={formData.season}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
                <option value={2026}>2026</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                The NFL season for this league
              </p>
            </div>

            {/* Teams Started Per Week */}
            <div>
              <label htmlFor="teamsStartedPerWeek" className="block text-sm font-medium text-slate-300 mb-2">
                Starters Per Week
              </label>
              <select
                id="teamsStartedPerWeek"
                name="teamsStartedPerWeek"
                value={formData.teamsStartedPerWeek}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={1}>1 QB Team</option>
                <option value={2}>2 QB Teams</option>
                <option value={3}>3 QB Teams</option>
                <option value={4}>4 QB Teams</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                How many QB teams each manager must start each week
              </p>
            </div>

            {/* League Info */}
            <div className="bg-slate-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">League Information</h3>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• 8 team slots (fixed)</li>
                <li>• Round-robin scheduling (no playoffs)</li>
                <li>• Invitation-only membership</li>
                <li>• 18-week regular season</li>
                <li>• You will be the league owner with full admin privileges</li>
              </ul>
            </div>

            {/* Submit Buttons */}
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => navigate('/my-leagues')}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md font-medium transition-colors disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </span>
                ) : (
                  'Create League'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <h3 className="text-lg font-medium text-slate-300 mb-4">Need Help?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-800 rounded-lg p-4">
              <h4 className="font-medium text-slate-300 mb-2">Getting Started</h4>
              <p className="text-slate-400">
                After creating your league, you'll need to invite 7 other managers
                and assign QB teams to each slot before generating the schedule.
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <h4 className="font-medium text-slate-300 mb-2">League Rules</h4>
              <p className="text-slate-400">
                Bad QB League follows inverse scoring - the worst performing
                quarterbacks score the most points. Check the rules page for details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateLeague;