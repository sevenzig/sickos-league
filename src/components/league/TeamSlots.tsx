import React, { useState, useEffect } from 'react';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';

interface TeamSlot {
  id?: string;
  team_name?: string;
  manager_email?: string;
  slot_number: number;
  is_filled: boolean;
}

interface TeamSlotsProps {
  leagueId: string;
  isOwner: boolean;
}

const TeamSlots: React.FC<TeamSlotsProps> = ({ leagueId, isOwner }) => {
  const [slots, setSlots] = useState<TeamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeamSlots();
  }, [leagueId]);

  const loadTeamSlots = async () => {
    try {
      setLoading(true);
      const data = await MultiLeagueApi.getTeamSlots(leagueId);

      // Create 8 slots, filling in the ones that exist
      const allSlots: TeamSlot[] = [];
      for (let i = 1; i <= 8; i++) {
        const existingSlot = data.find((slot: any) => slot.slot_number === i);
        allSlots.push({
          id: existingSlot?.id,
          team_name: existingSlot?.team_name,
          manager_email: existingSlot?.manager_email,
          slot_number: i,
          is_filled: !!existingSlot
        });
      }

      setSlots(allSlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team slots');
    } finally {
      setLoading(false);
    }
  };

  const filledSlots = slots.filter(slot => slot.is_filled).length;
  const emptySlots = 8 - filledSlots;

  if (loading) {
    return (
      <div className="bg-white/5 border border-slate-700 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium text-white">Team Slots</h3>
          <p className="text-sm text-slate-400">
            {filledSlots} of 8 slots filled • {emptySlots} remaining
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-xs text-slate-400">Filled</span>
          <div className="w-3 h-3 bg-slate-600 rounded-full ml-3"></div>
          <span className="text-xs text-slate-400">Empty</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {slots.map((slot) => (
          <div
            key={slot.slot_number}
            className={`border rounded-lg p-4 transition-colors ${
              slot.is_filled
                ? 'border-green-600 bg-green-600/10'
                : 'border-slate-600 bg-slate-800/30'
            }`}
          >
            <div className="text-center">
              <div className={`text-xs font-medium mb-2 ${
                slot.is_filled ? 'text-green-400' : 'text-slate-500'
              }`}>
                Slot {slot.slot_number}
              </div>
              {slot.is_filled ? (
                <div>
                  <div className="text-sm font-medium text-white mb-1">
                    {slot.team_name || 'Team'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {slot.manager_email?.split('@')[0] || 'Manager'}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Waiting for player
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* League Status */}
      <div className="border-t border-slate-700 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-slate-300">League Status</h4>
            <p className="text-xs text-slate-400">
              {filledSlots < 8
                ? `Need ${emptySlots} more players to start`
                : 'Ready to begin!'
              }
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            filledSlots >= 8
              ? 'bg-green-600/20 text-green-400'
              : 'bg-yellow-600/20 text-yellow-400'
          }`}>
            {filledSlots >= 8 ? 'Full' : 'Recruiting'}
          </div>
        </div>
      </div>

      {isOwner && filledSlots < 8 && (
        <div className="mt-4 p-4 bg-blue-600/10 border border-blue-600/20 rounded-lg">
          <h4 className="text-sm font-medium text-blue-300 mb-2">Next Steps</h4>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>• Share invite codes with {emptySlots} more friends</li>
            <li>• Once full, you can set up the draft</li>
            <li>• Generate schedule when ready to start</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default TeamSlots;