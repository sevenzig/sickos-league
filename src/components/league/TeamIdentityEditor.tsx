import React, { useState, useRef } from 'react';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import FantasyTeamAvatar from './FantasyTeamAvatar';

interface TeamIdentityEditorProps {
  team: FantasyTeam;
  onUpdated: (changes: Partial<FantasyTeam>) => void;
}

// Phase 5.2: team identity - the manager renames their team and uploads a
// logo/avatar. Rendered wherever the "my team" header appears.
const TeamIdentityEditor: React.FC<TeamIdentityEditorProps> = ({ team, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.team_name);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === team.team_name) {
      setEditing(false);
      setName(team.team_name);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await MultiLeagueApi.updateFantasyTeamName(team.id, trimmed);
      onUpdated({ team_name: trimmed });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename team');
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Logo must be under 1MB');
      return;
    }
    try {
      setUploading(true);
      setError(null);
      await MultiLeagueApi.uploadTeamLogo(team.id, file);
      // Server stores the canonical relative path; re-read it for display
      const teams = await MultiLeagueApi.getLeagueFantasyTeams(team.league_id);
      const updated = teams.find(t => t.id === team.id);
      onUpdated({ logo_url: updated?.logo_url ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative group rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Change team logo"
        >
          <FantasyTeamAvatar teamName={team.team_name} logoUrl={team.logo_url} size="lg" />
          <span className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold text-white uppercase">
            {uploading ? '...' : 'Edit'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
        />

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') { setEditing(false); setName(team.team_name); }
              }}
              maxLength={40}
              autoFocus
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={saveName}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-sm font-medium"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setName(team.team_name); }}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-50 tracking-tight">{team.team_name}</h2>
            <button
              onClick={() => { setEditing(true); setName(team.team_name); }}
              className="text-slate-400 hover:text-white transition-colors"
              title="Rename team"
              aria-label="Rename team"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
};

export default TeamIdentityEditor;
