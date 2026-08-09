import React, { useState } from 'react';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import DraftSetupFields, {
  DraftMode,
  DraftFormat,
  PickSeconds,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
} from './DraftSetupFields';
import { Panel, Button, Alert } from '@/components/ui';

interface DraftSettingsEditorProps {
  leagueId: string;
  draftStatus: 'pending' | 'in_progress' | 'complete';
  draftMode: DraftMode;
  draftFormat: DraftFormat;
  draftAt?: string | null;
  draftPickSeconds: number;
  onSaved: () => void;
}

const DraftSettingsEditor: React.FC<DraftSettingsEditorProps> = ({
  leagueId,
  draftStatus,
  draftMode: initialMode,
  draftFormat: initialFormat,
  draftAt,
  draftPickSeconds: initialSecs,
  onSaved,
}) => {
  const [draftMode, setDraftMode] = useState<DraftMode>(initialMode || 'async');
  const [draftFormat, setDraftFormat] = useState<DraftFormat>(initialFormat || 'snake');
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
        draftFormat,
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
    <Panel>
      <h2 className="text-heading text-slate-50 mb-1">Draft Settings</h2>
      <p className="text-label text-slate-400 mb-4">
        {canEdit
          ? 'Choose pick order and timing. Settings lock once the draft starts.'
          : 'Draft settings are locked after the draft starts.'}
      </p>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {saved && <Alert variant="success" className="mb-4">Draft settings saved.</Alert>}

      <DraftSetupFields
        draftMode={draftMode}
        draftFormat={draftFormat}
        draftAtLocal={draftAtLocal}
        draftPickSeconds={draftPickSeconds}
        onDraftModeChange={setDraftMode}
        onDraftFormatChange={setDraftFormat}
        onDraftAtChange={setDraftAtLocal}
        onPickSecondsChange={setDraftPickSeconds}
        disabled={!canEdit || saving}
      />

      {canEdit && (
        <div className="mt-6">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Draft Settings'}
          </Button>
        </div>
      )}
    </Panel>
  );
};

export default DraftSettingsEditor;
