import React from 'react';
import TeamLogo from '../../TeamLogo';

interface MatchupCardProps {
  matchup: any;
  matchupData: any;
  selectedWeek: number;
  leagueData: any;
  isWeekLocked: (week: number) => boolean;
  openMatchupModal: (matchup: any, week: number) => void;
}

const MatchupCard: React.FC<MatchupCardProps> = React.memo(({
  matchup,
  matchupData,
  selectedWeek,
  leagueData,
  isWeekLocked,
  openMatchupModal
}) => {
  const team1Score = matchupData?.team1Score || 0;
  const team2Score = matchupData?.team2Score || 0;
  const team1Breakdown = matchupData?.team1Breakdown || [];
  const team2Breakdown = matchupData?.team2Breakdown || [];
  const hasData = !!matchupData &&
    (team1Breakdown.length > 0 || team2Breakdown.length > 0) &&
    (team1Breakdown.some((item: any) => item.breakdown !== null && item.breakdown !== undefined) ||
     team2Breakdown.some((item: any) => item.breakdown !== null && item.breakdown !== undefined));

  // Determine winner/loser
  const team1Wins = hasData && team1Score > team2Score;
  const team2Wins = hasData && team2Score > team1Score;
  const isTie = hasData && team1Score === team2Score;

  const handleClick = React.useCallback(() => {
    openMatchupModal(matchup, selectedWeek);
  }, [matchup, selectedWeek, openMatchupModal]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return (
    <div
      className="bg-gradient-to-br from-[#1a2942] to-[#0f1d31] rounded-2xl border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden cursor-pointer hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:scale-[1.02] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1d31]"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {/* SCORE STRIP */}
      <div className="flex bg-black/20">
        {/* Team 1 Score Half */}
        <div className={`flex-1 px-5 py-6 text-center relative ${
          hasData && team2Wins ? 'bg-gradient-to-b from-rose-500/15 to-rose-500/8 border-t-2 border-rose-500/30' :
          hasData && team1Wins ? 'bg-gradient-to-b from-emerald-500/15 to-emerald-500/7 border-t-2 border-emerald-500/35' :
          'bg-gradient-to-b from-slate-800/20 to-slate-800/10 border-t-2 border-slate-700/20'
        }`}>
          {team1Wins && (
            <div className="absolute top-2 right-2 text-xl">🏆</div>
          )}
          <div className="text-slate-200 text-sm font-semibold mb-1">{matchup.team1}</div>
          <div className={`text-6xl font-black leading-none mb-3 tabular-nums ${
            hasData && team1Score < 0 ? 'text-rose-400' :
            hasData && team1Score > 0 ? 'text-emerald-400' :
            'text-slate-200'
          }`}>{team1Score}</div>
        </div>

        {/* Center Divider */}
        <div className="w-px bg-white/10"></div>

        {/* Team 2 Score Half */}
        <div className={`flex-1 px-5 py-6 text-center relative ${
          hasData && team1Wins ? 'bg-gradient-to-b from-rose-500/15 to-rose-500/8 border-t-2 border-rose-500/30' :
          hasData && team2Wins ? 'bg-gradient-to-b from-emerald-500/15 to-emerald-500/7 border-t-2 border-emerald-500/35' :
          'bg-gradient-to-b from-slate-800/20 to-slate-800/10 border-t-2 border-slate-700/20'
        }`}>
          {team2Wins && (
            <div className="absolute top-2 right-2 text-xl">🏆</div>
          )}
          <div className="text-slate-200 text-sm font-semibold mb-1">{matchup.team2}</div>
          <div className={`text-6xl font-black leading-none mb-3 tabular-nums ${
            hasData && team2Score < 0 ? 'text-rose-400' :
            hasData && team2Score > 0 ? 'text-emerald-400' :
            'text-slate-200'
          }`}>{team2Score}</div>
        </div>
      </div>

      {/* BOTTOM SECTION */}
      <div className="flex relative py-6">
        {/* Bottom Divider */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>

        {/* VS Badge */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#1a2942] text-[#64748b] px-4 py-1.5 rounded-lg text-xs font-bold z-10 border border-white/10">
          VS
        </div>

        {/* Team 1 Side */}
        <div
          className="flex-1 px-6 flex flex-col items-center gap-4 relative"
          style={team1Wins ? { background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.06) 0%, transparent 70%)' } : undefined}
        >
          <div className="flex gap-4 items-center">
            {hasData ? (
              team1Breakdown.map(({ qb, breakdown }: { qb: string; breakdown: any }, idx: number) => (
                <div key={qb} className="flex flex-col items-center gap-1.5 relative group">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${
                    breakdown && breakdown.finalScore > 0 ? 'text-emerald-400' :
                    breakdown && breakdown.finalScore < 0 ? 'text-rose-400' :
                    'text-slate-400'
                  }`}>
                    {breakdown ? breakdown.finalScore : '--'}
                  </div>
                </div>
              ))
            ) : team1Breakdown.length > 0 ? (
              team1Breakdown.map(({ qb }: { qb: string }, idx: number) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg border-2 border-dashed border-slate-600/50 flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className="text-xs text-slate-500">--</div>
                </div>
              ))
            ) : (
              [1, 2].map((_, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-600 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center">
                    <div className="text-gray-400 text-xs">?</div>
                  </div>
                  <div className="text-xs text-gray-400">--</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team 2 Side */}
        <div
          className="flex-1 px-6 flex flex-col items-center gap-4 relative"
          style={team2Wins ? { background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.06) 0%, transparent 70%)' } : undefined}
        >
          <div className="flex gap-4 items-center">
            {hasData ? (
              team2Breakdown.map(({ qb, breakdown }: { qb: string; breakdown: any }, idx: number) => (
                <div key={qb} className="flex flex-col items-center gap-1.5 relative group">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${
                    breakdown && breakdown.finalScore > 0 ? 'text-emerald-400' :
                    breakdown && breakdown.finalScore < 0 ? 'text-rose-400' :
                    'text-slate-400'
                  }`}>
                    {breakdown ? breakdown.finalScore : '--'}
                  </div>
                </div>
              ))
            ) : team2Breakdown.length > 0 ? (
              team2Breakdown.map(({ qb }: { qb: string }, idx: number) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg border-2 border-dashed border-slate-600/50 flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className="text-xs text-slate-500">--</div>
                </div>
              ))
            ) : (
              [1, 2].map((_, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-600 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center">
                    <div className="text-gray-400 text-xs">?</div>
                  </div>
                  <div className="text-xs text-gray-400">--</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

MatchupCard.displayName = 'MatchupCard';

export default MatchupCard;