import React, { useState } from 'react';
import { importWeeklyCSV, getImportHistory, deleteWeekData } from '../services/csvImporter';
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

  const handleDeleteWeek = async (week: number) => {
    if (!confirm(`Are you sure you want to delete all data for week ${week}?`)) {
      return;
    }

    try {
      const success = await deleteWeekData(week);
      if (success) {
        // Refresh import history
        const history = await getImportHistory();
        setImportHistory(history);
        alert(`Week ${week} data deleted successfully`);
      } else {
        alert('Failed to delete week data');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete week data');
    }
  };

  const loadHistory = async () => {
    try {
      const history = await getImportHistory();
      setImportHistory(history);
      setShowHistory(true);
    } catch (error) {
      console.error('Failed to load import history:', error);
      alert('Failed to load import history');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin - CSV Import</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Import Weekly Data</h2>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="week-select" className="block text-sm font-medium text-gray-700 mb-2">
              Week
            </label>
            <select
              id="week-select"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700 mb-2">
              CSV File
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isImporting ? 'Importing...' : 'Import CSV'}
          </button>
        </div>

        {importResult && (
          <div className={`mt-4 p-4 rounded-md ${
            importResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <h3 className="font-semibold">
              {importResult.success ? 'Import Successful' : 'Import Failed'}
            </h3>
            <p>Records imported: {importResult.recordsImported}</p>
            {importResult.newCurrentWeek && (
              <p className="text-blue-600 font-medium">
                Current week automatically advanced to Week {importResult.newCurrentWeek}
              </p>
            )}
            {importResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold">Errors:</p>
                <ul className="list-disc list-inside">
                  {importResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Import History</h2>
          <button
            onClick={loadHistory}
            className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
          >
            {showHistory ? 'Refresh History' : 'Load History'}
          </button>
        </div>

        {showHistory && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Week
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Season
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Records
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Imported At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {importHistory.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Week {item.week}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.season}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.recordsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.importedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => handleDeleteWeek(item.week)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importHistory.length === 0 && (
              <p className="text-center text-gray-500 py-4">No import history found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
