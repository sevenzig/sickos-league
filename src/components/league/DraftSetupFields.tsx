import React from 'react';
import DatetimeLocalPicker from './DatetimeLocalPicker';

export type DraftMode = 'async' | 'live';
export type PickSeconds = 30 | 60 | 90;

interface DraftSetupFieldsProps {
  draftMode: DraftMode;
  draftAtLocal: string; // datetime-local value
  draftPickSeconds: PickSeconds;
  onDraftModeChange: (mode: DraftMode) => void;
  onDraftAtChange: (value: string) => void;
  onPickSecondsChange: (secs: PickSeconds) => void;
  disabled?: boolean;
  /** When true, show that settings can still be edited later (create form). */
  showHint?: boolean;
  error?: string;
}

/** Convert ISO string → value for <input type="datetime-local"> (local tz). */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert datetime-local value → ISO UTC string. */
export function fromDatetimeLocalValue(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const DraftSetupFields: React.FC<DraftSetupFieldsProps> = ({
  draftMode,
  draftAtLocal,
  draftPickSeconds,
  onDraftModeChange,
  onDraftAtChange,
  onPickSecondsChange,
  disabled = false,
  showHint = false,
  error,
}) => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowLocal = toDatetimeLocalValue(new Date().toISOString());

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-3">Draft type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDraftModeChange('async')}
            className={`text-left p-4 rounded-lg border transition-colors ${
              draftMode === 'async'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
            } disabled:opacity-50`}
          >
            <div className="text-white font-medium mb-1">Async draft</div>
            <p className="text-slate-400 text-sm">
              No clock. Managers pick when notified. Commissioner starts when ready.
            </p>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDraftModeChange('live')}
            className={`text-left p-4 rounded-lg border transition-colors ${
              draftMode === 'live'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
            } disabled:opacity-50`}
          >
            <div className="text-white font-medium mb-1">Live draft room</div>
            <p className="text-slate-400 text-sm">
              Opens 1 hour before the scheduled time, auto-starts on the clock, pick timer.
            </p>
          </button>
        </div>
      </div>

      {draftMode === 'live' && (
        <>
          <div>
            <label htmlFor="draft-at" className="block text-sm font-medium text-slate-300 mb-2">
              Scheduled draft time{' '}
              <span className="text-slate-500 font-normal">({timeZone})</span>
            </label>
            <DatetimeLocalPicker
              id="draft-at"
              value={draftAtLocal}
              onChange={onDraftAtChange}
              disabled={disabled}
              min={nowLocal}
              hasError={!!error}
            />
            {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
            <p className="text-xs text-slate-500 mt-1">
              Room opens 1 hour before this time. Draft auto-starts at the scheduled time.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Seconds per pick
            </label>
            <div className="flex gap-2">
              {([30, 60, 90] as PickSeconds[]).map((secs) => (
                <button
                  key={secs}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPickSecondsChange(secs)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    draftPickSeconds === secs
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  } disabled:opacity-50`}
                >
                  {secs}s
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showHint && (
        <p className="text-xs text-slate-500">
          You can change these settings from the admin panel until the draft starts.
        </p>
      )}
    </div>
  );
};

export default DraftSetupFields;
