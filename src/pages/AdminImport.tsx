import React, { useState, useEffect } from 'react';
import {
  importWeeklyCSV,
  getImportHistory,
  platformFinalizeWeek,
  ImportResult,
} from '../services/csvImporter';
import type { PlatformFinalizeWeekResult } from '../utils/multiLeagueApi';
import { CURRENT_SEASON } from '../utils/currentSeason';
import {
  PageChrome,
  Panel,
  Button,
  Alert,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from '../components/ui';

interface ImportHistoryItem {
  week: number;
  season: number;
  recordsCount: number;
  importedAt: string;
}

function FinalizeSummary({
  result,
}: {
  result: Pick<
    ImportResult,
    | 'matchupsFinalized'
    | 'leaguesProcessed'
    | 'leaguesFailed'
    | 'autoFilled'
    | 'leagueErrors'
    | 'finalizeError'
  >;
}) {
  return (
    <>
      {result.matchupsFinalized !== undefined && (
        <p className="text-caption mt-1">
          League matchups finalized: <strong>{result.matchupsFinalized}</strong>
          {result.leaguesProcessed !== undefined && (
            <> · leagues locked: <strong>{result.leaguesProcessed}</strong></>
          )}
          {result.autoFilled !== undefined && result.autoFilled > 0 && (
            <> · lineups auto-filled: <strong>{result.autoFilled}</strong></>
          )}
        </p>
      )}
      {result.finalizeError && (
        <p className="text-caption text-yellow-400 mt-1">{result.finalizeError}</p>
      )}
      {result.leagueErrors && result.leagueErrors.length > 0 && (
        <ul className="list-disc list-inside mt-2 space-y-0.5 text-caption text-yellow-300">
          {result.leagueErrors.map((e, i) => (
            <li key={i}>
              {e.league_id.slice(0, 8)}… — {e.error}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AdminImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedSeason, setSelectedSeason] = useState<number>(CURRENT_SEASON);
  const [finalizeWeek, setFinalizeWeek] = useState<number>(1);
  const [isImporting, setIsImporting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<PlatformFinalizeWeekResult | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (hasLoadedHistory) return;
      try {
        const history = await getImportHistory();
        setImportHistory(history);
        setHasLoadedHistory(true);
        if (history.length > 0) {
          const maxWeek = Math.max(...history.map((item) => item.week));
          const next = Math.min(18, maxWeek + 1);
          setSelectedWeek(next);
          setFinalizeWeek(maxWeek);
          setShowHistory(true);
        }
      } catch {
        // keep default
      }
    };
    init();
  }, [hasLoadedHistory]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
    } else {
      alert('Please select a CSV file');
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setImportResult(null);
    setFinalizeResult(null);
    setFinalizeError(null);
    try {
      const csvData = await selectedFile.text();
      const result = await importWeeklyCSV(csvData, selectedWeek, selectedSeason);
      setImportResult(result);
      if (result.success) {
        const history = await getImportHistory();
        setImportHistory(history);
        setSelectedFile(null);
        const fileInput = document.getElementById('csv-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        setFinalizeWeek(selectedWeek);
        setSelectedWeek(Math.min(18, selectedWeek + 1));
      }
    } catch (error) {
      setImportResult({
        success: false,
        recordsImported: 0,
        errors: [
          `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        week: selectedWeek,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFinalize = async () => {
    setIsFinalizing(true);
    setFinalizeResult(null);
    setFinalizeError(null);
    try {
      const result = await platformFinalizeWeek(finalizeWeek, selectedSeason);
      setFinalizeResult(result);
    } catch (error) {
      setFinalizeError(error instanceof Error ? error.message : 'Finalize failed');
    } finally {
      setIsFinalizing(false);
    }
  };

  const loadHistory = async () => {
    try {
      const history = await getImportHistory();
      setImportHistory(history);
      setShowHistory(true);
      setHasLoadedHistory(true);
    } catch {
      alert('Failed to load import history');
    }
  };

  return (
    <div className="space-y-6">
      <PageChrome title="CSV Import" />

      <Panel>
        <h2 className="text-heading text-slate-50 mb-2">Import Weekly Data</h2>
        <p className="text-caption text-slate-400 mb-5">
          Uploading a CSV writes game stats and immediately locks lineups / persists
          matchup scores for every league in the selected season. CSV SeasonID must
          match the season below or import aborts. Standings and the W/L/T chart
          update from that finalize step.
        </p>
        <div className="space-y-5">
          <div>
            <label
              htmlFor="season-input"
              className="block text-caption font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Season
            </label>
            <input
              id="season-input"
              type="number"
              min={2020}
              max={2100}
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(parseInt(e.target.value, 10) || CURRENT_SEASON)}
              className="flex h-11 w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-label text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="week-select"
              className="block text-caption font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Week
            </label>
            <select
              id="week-select"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              className="flex h-11 w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-label text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                <option key={week} value={week} className="bg-slate-800">
                  Week {week}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="csv-file"
              className="block text-caption font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              CSV File
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-md text-slate-100 text-body file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-700 file:text-slate-200 file:text-caption file:font-medium hover:file:bg-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {selectedFile && (
              <p className="mt-1.5 text-caption text-emerald-400">
                ✓ {selectedFile.name}
              </p>
            )}
          </div>

          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            className="w-full"
          >
            {isImporting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Importing…
              </span>
            ) : (
              'Import CSV & Finalize Week'
            )}
          </Button>
        </div>

        {importResult && (
          <Alert
            variant={importResult.success ? 'success' : 'error'}
            className="mt-5"
          >
            <p className="font-bold mb-1">
              {importResult.success ? 'Import Successful' : 'Import Failed'}
            </p>
            <p className="text-caption">
              Records imported: <strong>{importResult.recordsImported}</strong>
            </p>
            <FinalizeSummary result={importResult} />
            {importResult.errors.length > 0 && (
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-caption">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </Panel>

      <Panel>
        <h2 className="text-heading text-slate-50 mb-2">Finalize Week</h2>
        <p className="text-caption text-slate-400 mb-5">
          Re-run lock + score persist for a week that already has CSV data (e.g. after
          a prior import that did not finalize, or after fixing lineups). Idempotent.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="finalize-week-select"
              className="block text-caption font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Week
            </label>
            <select
              id="finalize-week-select"
              value={finalizeWeek}
              onChange={(e) => setFinalizeWeek(parseInt(e.target.value))}
              className="flex h-11 w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-label text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                <option key={week} value={week} className="bg-slate-800">
                  Week {week}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleFinalize} disabled={isFinalizing || isImporting}>
            {isFinalizing ? 'Finalizing…' : `Finalize Week ${finalizeWeek}`}
          </Button>
        </div>

        {finalizeError && (
          <Alert variant="error" className="mt-5">
            <p className="font-bold mb-1">Finalize Failed</p>
            <p className="text-caption">{finalizeError}</p>
          </Alert>
        )}
        {finalizeResult && !finalizeError && (
          <Alert variant="success" className="mt-5">
            <p className="font-bold mb-1">Week {finalizeResult.week} Finalized</p>
            <FinalizeSummary
              result={{
                matchupsFinalized: finalizeResult.matchups_finalized,
                leaguesProcessed: finalizeResult.leagues_processed,
                leaguesFailed: finalizeResult.leagues_failed,
                autoFilled: finalizeResult.auto_filled,
                leagueErrors: finalizeResult.league_errors,
                finalizeError:
                  finalizeResult.leagues_failed > 0
                    ? `${finalizeResult.leagues_failed} league(s) failed to lock lineups`
                    : undefined,
              }}
            />
          </Alert>
        )}
      </Panel>

      <Panel>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-heading text-slate-50">Import History</h2>
          <Button variant="secondary" size="sm" onClick={loadHistory}>
            {showHistory ? 'Refresh' : 'Load History'}
          </Button>
        </div>

        {showHistory && (
          importHistory.length === 0 ? (
            <EmptyState
              title="No import history"
              description="Import some data to see history here"
            />
          ) : (
            <div className="rounded-lg overflow-hidden border border-slate-700/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Season</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Imported At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importHistory.map((item, i) => (
                    <TableRow
                      key={i}
                      className={i % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'}
                    >
                      <TableCell className="font-bold text-slate-200 tabular-nums">
                        Week {item.week}
                      </TableCell>
                      <TableCell className="tabular-nums">{item.season}</TableCell>
                      <TableCell className="font-bold text-emerald-400 tabular-nums">
                        {item.recordsCount}
                      </TableCell>
                      <TableCell>{new Date(item.importedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </Panel>
    </div>
  );
}
