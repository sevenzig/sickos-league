import React from 'react';
import { Alert } from '@/components/ui';

/** Shown on league write surfaces when season is before CURRENT_SEASON. */
const ArchivedSeasonBanner: React.FC = () => (
  <Alert variant="warning" className="mb-4">
    <p className="text-caption">
      Archived season — standings and schedules are read-only. Joining and lineup
      changes are disabled for past seasons.
    </p>
  </Alert>
);

export default ArchivedSeasonBanner;
