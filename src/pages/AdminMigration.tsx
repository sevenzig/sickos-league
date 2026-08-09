import React, { useState, useEffect } from 'react';
import { migrateHistoricalData, checkMigrationStatus } from '../services/migration';
import { PageChrome, Panel, Button, Alert, LoadingBlock } from '../components/ui';

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
    if (
      !confirm(
        'This will migrate all historical data to the database. Are you sure you want to continue?'
      )
    )
      return;

    setIsMigrating(true);
    setMigrationResult(null);
    try {
      const result = await migrateHistoricalData();
      setMigrationResult(result);
      if (result.success) await loadMigrationStatus();
    } catch (error) {
      setMigrationResult({
        success: false,
        errors: [
          `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageChrome title="Data Migration" />
        <LoadingBlock message="Loading migration status…" />
      </div>
    );
  }

  const statusStats = migrationStatus
    ? [
        { label: 'Teams', value: migrationStatus.teamsCount },
        { label: 'Lineups', value: migrationStatus.lineupsCount },
        { label: 'Matchups', value: migrationStatus.matchupsCount },
        { label: 'Game Stats', value: migrationStatus.gameStatsCount },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageChrome title="Data Migration" />

      {/* Status panel */}
      <Panel>
        <h2 className="text-heading text-slate-50 mb-5">Migration Status</h2>

        {statusStats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {statusStats.map(({ label, value }) => (
              <div key={label} className="bg-slate-800/60 rounded-lg p-4">
                <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
                <p className="text-caption text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        )}

        <Alert variant={migrationStatus?.isMigrated ? 'success' : 'warning'} className="mt-0">
          {migrationStatus?.isMigrated
            ? 'Data has been migrated to the database.'
            : 'Historical data needs to be migrated to the database.'}
        </Alert>
      </Panel>

      {/* Actions panel */}
      <Panel>
        <h2 className="text-heading text-slate-50 mb-5">Migration Actions</h2>

        {!migrationStatus?.isMigrated ? (
          <div className="space-y-4">
            <p className="text-body text-slate-400">
              This will migrate all historical data from the initial data files to the database.
              This includes:
            </p>
            <ul className="list-disc list-inside text-body text-slate-400 space-y-1">
              <li>8 teams with their rosters</li>
              <li>Historical lineups for weeks 1–7</li>
              <li>All matchups for the season</li>
              <li>Week 1 game statistics</li>
              <li>League settings and configuration</li>
            </ul>
            <Button onClick={handleMigration} disabled={isMigrating} className="w-full">
              {isMigrating ? 'Migrating Data…' : 'Start Migration'}
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-body text-slate-400">
              Data has already been migrated. Contact an administrator to re-migrate.
            </p>
            <Button variant="secondary" onClick={loadMigrationStatus}>
              Refresh Status
            </Button>
          </div>
        )}

        {migrationResult && (
          <Alert
            variant={migrationResult.success ? 'success' : 'error'}
            className="mt-5"
          >
            <p className="font-bold mb-1">
              {migrationResult.success ? 'Migration Successful' : 'Migration Failed'}
            </p>
            {migrationResult.success && (
              <div className="space-y-0.5 text-caption">
                <p>Teams imported: {migrationResult.teamsImported}</p>
                <p>Lineups imported: {migrationResult.lineupsImported}</p>
                <p>Matchups imported: {migrationResult.matchupsImported}</p>
                <p>Game stats imported: {migrationResult.gameStatsImported}</p>
              </div>
            )}
            {migrationResult.errors?.length > 0 && (
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-caption">
                {migrationResult.errors.map((err: string, i: number) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </Panel>
    </div>
  );
}
