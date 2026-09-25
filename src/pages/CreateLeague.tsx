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
  DraftFormat,
  PickSeconds,
  fromDatetimeLocalValue,
} from '../components/league/DraftSetupFields';
import { Panel, Button, Input, Select } from '@/components/ui';

const CreateLeague: React.FC = () => {
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState('');
  const [teamsPerWeek, setTeamsPerWeek] = useState(2);
  const [draftMode, setDraftMode] = useState<DraftMode>('async');
  const [draftFormat, setDraftFormat] = useState<DraftFormat>('snake');
  const [draftAtLocal, setDraftAtLocal] = useState('');
  const [draftPickSeconds, setDraftPickSeconds] = useState<PickSeconds>(90);
  const [playoffTeams, setPlayoffTeams] = useState<4 | 5 | 6 | 8>(4);
  const [standingsTiebreaker, setStandingsTiebreaker] = useState<'record_then_points' | 'points_then_record'>('record_then_points');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinPasswordConfirm, setJoinPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [draftAtError, setDraftAtError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validateForm = () => {
    let ok = true;
    if (!leagueName.trim()) {
      setNameError('League name is required');
      ok = false;
    } else if (leagueName.trim().length < 3) {
      setNameError('League name must be at least 3 characters');
      ok = false;
    } else {
      setNameError(null);
    }

    if (draftMode === 'live') {
      if (!draftAtLocal) {
        setDraftAtError('Live drafts require a scheduled draft time');
        ok = false;
      } else if (new Date(draftAtLocal).getTime() <= Date.now()) {
        setDraftAtError('Scheduled draft time must be in the future');
        ok = false;
      } else {
        setDraftAtError(null);
      }
    } else {
      setDraftAtError(null);
    }

    if (joinPassword.length < 6) {
      setPasswordError('Join password must be at least 6 characters');
      ok = false;
    } else if (joinPassword !== joinPasswordConfirm) {
      setPasswordError('Passwords do not match');
      ok = false;
    } else {
      setPasswordError(null);
    }

    return ok;
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
          draftFormat,
          draftAt: draftMode === 'live' ? fromDatetimeLocalValue(draftAtLocal) : null,
          draftPickSeconds,
          playoffTeams,
          standingsTiebreaker,
        }
      );

      await MultiLeagueApi.setLeagueJoinPassword(leagueId, joinPassword);
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
      <div className="max-w-3xl mx-auto py-12">
        <div className="text-center mb-10">
          <h1 className="text-display text-slate-50 mb-3">
            Create Your League
          </h1>
          <p className="text-body text-slate-400 max-w-2xl mx-auto">
            Set up your Bad QB League with custom settings and share a join link
            and password with your friends.
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

          <Panel size="md">
            <DraftSetupFields
              draftMode={draftMode}
              draftFormat={draftFormat}
              draftAtLocal={draftAtLocal}
              draftPickSeconds={draftPickSeconds}
              onDraftModeChange={setDraftMode}
              onDraftFormatChange={setDraftFormat}
              onDraftAtChange={handleDraftAtChange}
              onPickSecondsChange={setDraftPickSeconds}
              error={draftAtError ?? undefined}
              showHint
            />
          </Panel>

          <Panel size="md">
            <h2 className="text-heading text-slate-50 mb-2">Season</h2>
            <p className="text-label text-slate-400 mb-4">
              Weeks 1–14 are the regular season. Playoffs start in week 15. You can change these until the bracket is created.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="playoffTeams" className="text-label font-medium text-slate-300">
                  Playoff teams
                </label>
                <Select
                  id="playoffTeams"
                  value={playoffTeams}
                  onChange={(e) => setPlayoffTeams(Number(e.target.value) as 4 | 5 | 6 | 8)}
                >
                  <option value={4}>4 teams (ends week 16)</option>
                  <option value={5}>5 teams (ends week 17)</option>
                  <option value={6}>6 teams (ends week 17)</option>
                  <option value={8}>8 teams (ends week 17)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tiebreaker" className="text-label font-medium text-slate-300">
                  Standings tiebreaker
                </label>
                <Select
                  id="tiebreaker"
                  value={standingsTiebreaker}
                  onChange={(e) => setStandingsTiebreaker(e.target.value as 'record_then_points' | 'points_then_record')}
                >
                  <option value="record_then_points">Wins, then points</option>
                  <option value="points_then_record">Points, then wins</option>
                </Select>
              </div>
            </div>
          </Panel>

          <Panel size="md">
            <h2 className="text-heading text-slate-50 mb-2">Join Password</h2>
            <p className="text-label text-slate-400 mb-4">
              Friends use this password once on your join link. You can rotate it later in League Admin.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="joinPassword" className="text-label font-medium text-slate-300">
                  Password
                </label>
                <Input
                  type="password"
                  id="joinPassword"
                  value={joinPassword}
                  onChange={(e) => {
                    setJoinPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="joinPasswordConfirm" className="text-label font-medium text-slate-300">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  id="joinPasswordConfirm"
                  value={joinPasswordConfirm}
                  onChange={(e) => {
                    setJoinPasswordConfirm(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="Re-enter password"
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>
            {passwordError && (
              <p className="text-caption text-red-400 mt-2">{passwordError}</p>
            )}
          </Panel>

          <div className="flex items-center justify-between pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/my-leagues')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create League'}
            </Button>
          </div>
        </form>
      </div>
    </AuthCheck>
  );
};

export default CreateLeague;
