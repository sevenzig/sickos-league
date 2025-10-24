import React, { useState, useEffect } from 'react';
import { migrateHistoricalData, checkMigrationStatus } from '../services/migration';

interface MigrationStatus {
  isMigrated: boolean;
  teamsCount: number;
  lineupsCount: number;
  matchupsCount: number;
  gameStatsCount: number;
}

export default function AdminMigration() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMigrationStatus();
  }, []);

  const loadMigrationStatus = async () => {
    try {
      setIsLoading(true);
      const status = await checkMigrationStatus();
      setMigrationStatus(status);
    } catch (error) {
      console.error('Failed to load migration status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMigration = async () => {
    if (!confirm('This will migrate all historical data to the database. Are you sure you want to continue?')) {
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const result = await migrateHistoricalData();
      setMigrationResult(result);
      
      if (result.success) {
        // Refresh migration status
        await loadMigrationStatus();
      }
    } catch (error) {
      console.error('Migration failed:', error);
      setMigrationResult({
        success: false,
        errors: [`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading migration status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin - Data Migration</h1>
      
      {/* Migration Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Migration Status</h2>
        
        {migrationStatus && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{migrationStatus.teamsCount}</div>
              <div className="text-sm text-gray-600">Teams</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{migrationStatus.lineupsCount}</div>
              <div className="text-sm text-gray-600">Lineups</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{migrationStatus.matchupsCount}</div>
              <div className="text-sm text-gray-600">Matchups</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{migrationStatus.gameStatsCount}</div>
              <div className="text-sm text-gray-600">Game Stats</div>
            </div>
          </div>
        )}

        <div className={`p-4 rounded-md ${
          migrationStatus?.isMigrated 
            ? 'bg-green-100 text-green-800' 
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          <div className="flex items-center">
            <span className="text-lg mr-2">
              {migrationStatus?.isMigrated ? '✅' : '⚠️'}
            </span>
            <span className="font-semibold">
              {migrationStatus?.isMigrated 
                ? 'Data has been migrated to the database' 
                : 'Historical data needs to be migrated to the database'
              }
            </span>
          </div>
        </div>
      </div>

      {/* Migration Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Migration Actions</h2>
        
        {!migrationStatus?.isMigrated ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              This will migrate all historical data from the initial data files to the Supabase database.
              This includes:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>8 teams with their rosters</li>
              <li>Historical lineups for weeks 1-7</li>
              <li>All matchups for the season</li>
              <li>Week 1 game statistics</li>
              <li>League settings and configuration</li>
            </ul>
            
            <button
              onClick={handleMigration}
              disabled={isMigrating}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isMigrating ? 'Migrating Data...' : 'Start Migration'}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Data has already been migrated. If you need to re-migrate, please contact the administrator.
            </p>
            <button
              onClick={loadMigrationStatus}
              className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
            >
              Refresh Status
            </button>
          </div>
        )}

        {migrationResult && (
          <div className={`mt-6 p-4 rounded-md ${
            migrationResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <h3 className="font-semibold mb-2">
              {migrationResult.success ? 'Migration Successful' : 'Migration Failed'}
            </h3>
            
            {migrationResult.success && (
              <div className="space-y-1 text-sm">
                <p>Teams imported: {migrationResult.teamsImported}</p>
                <p>Lineups imported: {migrationResult.lineupsImported}</p>
                <p>Matchups imported: {migrationResult.matchupsImported}</p>
                <p>Game stats imported: {migrationResult.gameStatsImported}</p>
              </div>
            )}
            
            {migrationResult.errors && migrationResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold">Errors:</p>
                <ul className="list-disc list-inside text-sm">
                  {migrationResult.errors.map((error: string, index: number) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
