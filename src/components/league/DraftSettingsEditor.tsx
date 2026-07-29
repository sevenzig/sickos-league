import React, { useState } from 'react';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import DraftSetupFields, {
  DraftMode,
  PickSeconds,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
} from './DraftSetupFields';

interface DraftSettingsEditorProps {
  leagueId: string;
  draftStatus: 'pending' | 'in_progress' | 'complete';
  draftMode: DraftMode;
  draftAt?: string | null;
  draftPickSeconds: number;
  onSaved: () => void;
}

const DraftSettingsEditor: React.FC<DraftSettingsEditorProps> = ({
  leagueId,
  draftStatus,
  draftMode: initialMode,
  draftAt,
  draftPickSeconds: initialSecs,
  onSaved,
}) => {
  const [draftMode, setDraftMode] = useState<DraftMode>(initialMode || 'async');
  const [draftAtLocal, setDraftAtLocal] = useState(toDatetimeLocalValue(draftAt));
  const [draftPickSeconds, setDraftPickSeconds] = useState<PickSeconds>(
    (initialSecs === 30 || initialSecs === 60 || initialSecs === 90 ? initialSecs : 90) as PickSeconds
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canEdit = draftStatus === 'pending';

  const handleSave = async () => {
    if (!canEdit) return;
    if (draftMode === 'live' && !draftAtLocal) {
      setError('Live drafts require a scheduled draft time');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await MultiLeagueApi.updateLeagueDraftSettings(leagueId, {
        draftMode,
        draftAt: draftMode === 'live' ? fromDatetimeLocalValue(draftAtLocal) : null,
        draftPickSeconds,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <h2 className="text-xl font-semibold text-white mb-2">Draft Settings</h2>
      <p className="text-slate-400 text-sm mb-4">
        {canEdit
          ? 'Choose async or live. Settings lock once the draft starts.'
          : 'Draft settings are locked after the draft starts.'}
      </p>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {saved && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-3 mb-4">
          <p className="text-green-400 text-sm">Draft settings saved.</p>
        </div>
      )}

      <DraftSetupFields
        draftMode={draftMode}
        draftAtLocal={draftAtLocal}
        draftPickSeconds={draftPickSeconds}
        onDraftModeChange={setDraftMode}
        onDraftAtChange={setDraftAtLocal}
        onPickSecondsChange={setDraftPickSeconds}
        disabled={!canEdit || saving}
      />

      {canEdit && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save Draft Settings'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DraftSettingsEditor;
