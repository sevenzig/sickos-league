import React, { useState, useEffect } from 'react';
import { importWeeklyCSV, getImportHistory } from '../services/csvImporter';
import { useLeagueData } from '../context/LeagueContext';

interface ImportResult {
  success: boolean;
  recordsImported: number;
  errors: string[];
  week: number;
  newCurrentWeek?: number;
}

interface ImportHistoryItem {
  week: number;
  season: number;
  recordsCount: number;
  importedAt: string;
}

export default function AdminImport() {
  const { syncFromDatabase } = useLeagueData();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);

  // Auto-load history on component mount and set next week
  useEffect(() => {
    const initializeWeekSelection = async () => {
      if (hasLoadedHistory) return;

      try {
        const history = await getImportHistory();
        setImportHistory(history);
        setHasLoadedHistory(true);

        // Find the highest week that has been imported
        if (history.length > 0) {
          const maxWeek = Math.max(...history.map(item => item.week));
          const nextWeek = Math.min(18, maxWeek + 1); // Don't go beyond week 18

          console.log(`📊 Found imports up to Week ${maxWeek}, setting default to Week ${nextWeek}`);
          setSelectedWeek(nextWeek);
          setShowHistory(true); // Auto-show history since we have data
        } else {
          console.log('📊 No import history found, defaulting to Week 1');
          setSelectedWeek(1);
        }
      } catch (error) {
        console.error('Failed to load import history for week selection:', error);
        // Keep default week 1 if we can't load history
      }
    };

    initializeWeekSelection();
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
    if (!selectedFile) {
      alert('Please select a CSV file');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const csvData = await selectedFile.text();
      const result = await importWeeklyCSV(csvData, selectedWeek);
      setImportResult(result);
      
      if (result.success) {
        // Refresh import history
        const history = await getImportHistory();
        setImportHistory(history);
        setSelectedFile(null);
        // Reset file input
        const fileInput = document.getElementById('csv-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        // Auto-increment to next week after successful import
        const nextWeek = Math.min(18, selectedWeek + 1);
        if (nextWeek <= 18) {
          setSelectedWeek(nextWeek);
          console.log(`📈 Import successful, auto-incremented to Week ${nextWeek}`);
        }

        // If week was auto-advanced, refresh the league data
        if (result.newCurrentWeek) {
          try {
            await syncFromDatabase();
          } catch (error) {
            console.warn('Failed to refresh league data after week advancement:', error);
          }
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult({
        success: false,
        recordsImported: 0,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        week: selectedWeek
      });
    } finally {
      setIsImporting(false);
    }
  };


  const loadHistory = async () => {
    try {
      const history = await getImportHistory();
      setImportHistory(history);
      setShowHistory(true);
      setHasLoadedHistory(true);
    } catch (error) {
      console.error('Failed to load import history:', error);
      alert('Failed to load import history');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] px-8 py-6">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-50 tracking-tight">Admin - CSV Import</h1>
        <p className="text-slate-400 mt-2">Import weekly scoring data and manage historical imports</p>
      </div>

      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6 md:p-8">
        <h2 className="text-xl font-black text-slate-50 tracking-tight mb-6">Import Weekly Data</h2>

        <div className="space-y-6">
          <div>
            <label htmlFor="week-select" className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">
              Week
            </label>
            <select
              id="week-select"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-slate-800/60 border border-slate-600/50 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                <option key={week} value={week} className="bg-slate-800">Week {week}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-file" className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">
              CSV File
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-4 py-3 bg-slate-800/60 border border-slate-600/50 rounded-lg text-slate-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-500/20 file:text-blue-400 file:font-medium hover:file:bg-blue-500/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-emerald-400 font-medium">
                ✓ Selected: {selectedFile.name}
              </p>
            )}
          </div>

          <button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-6 rounded-lg font-bold transition-all duration-200 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg hover:shadow-xl"
          >
            {isImporting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Importing...
              </span>
            ) : (
              'Import CSV'
            )}
          </button>
        </div>

        {importResult && (
          <div className={`mt-6 p-4 rounded-lg border ${
            importResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <h3 className="font-bold text-lg mb-2">
              {importResult.success ? '✅ Import Successful' : '❌ Import Failed'}
            </h3>
            <p className="text-slate-200">Records imported: <span className="font-bold">{importResult.recordsImported}</span></p>
            {importResult.weekAdvanced && importResult.newCurrentWeek && (
              <p className="text-blue-400 font-medium mt-1">
                🔄 Current week automatically advanced to Week {importResult.newCurrentWeek}
              </p>
            )}
            {importResult.weekAdvanceError && (
              <p className="text-yellow-400 font-medium mt-1">
                ⚠️ Week advancement failed: {importResult.weekAdvanceError}
              </p>
            )}
            {importResult.errors.length > 0 && (
              <div className="mt-3">
                <p className="font-bold text-slate-200">Errors:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                  {importResult.errors.map((error, index) => (
                    <li key={index} className="text-rose-300">{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h2 className="text-xl font-black text-slate-50 tracking-tight">Import History</h2>
          <button
            onClick={loadHistory}
            className="px-4 py-2 bg-slate-800/90 hover:bg-slate-700/50 text-slate-200 rounded-lg transition-all duration-200 font-medium border border-slate-600/50 hover:border-slate-500/50"
          >
            {showHistory ? 'Refresh History' : 'Load History'}
          </button>
        </div>

        {showHistory && (
          <div className="bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Week
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Season
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Records
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Imported At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {importHistory.map((item, index) => (
                    <tr key={index} className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                      index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                    }`}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-200 tabular-nums">
                        Week {item.week}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-300 tabular-nums">
                        {item.season}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-emerald-400 tabular-nums">
                        {item.recordsCount}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-300">
                        {new Date(item.importedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importHistory.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400 text-lg">No import history found</p>
                <p className="text-slate-500 text-sm mt-1">Import some data to see history here</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
