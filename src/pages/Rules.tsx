import React from 'react';
import { SCORING_EVENTS } from '../utils/scoring';

const Rules: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] h-[74px] px-8 flex items-center">
        <h2 className="text-2xl font-black text-slate-50 tracking-tight">Bad QB League Scoring Rules</h2>
      </div>

      {/* 4-Column Grid for Scoring Tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pass Yards Scoring */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-4">
          <h3 className="text-base font-bold text-slate-50 mb-3 tracking-tight">Pass Yards</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Yards</th>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">≤ 100</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+25</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">101-150</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+12</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">151-200</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+6</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">201-299</td><td className="px-3 py-2 text-sm text-slate-400 tabular-nums">0</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">300-349</td><td className="px-3 py-2 text-sm text-rose-400 font-bold tabular-nums">-6</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">350-399</td><td className="px-3 py-2 text-sm text-rose-400 font-bold tabular-nums">-9</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">≥ 400</td><td className="px-3 py-2 text-sm text-rose-400 font-bold tabular-nums">-12</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Touchdowns Scoring */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-4">
          <h3 className="text-base font-bold text-slate-50 mb-3 tracking-tight">Touchdowns</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Touchdowns</th>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">0</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+10</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">1</td><td className="px-3 py-2 text-sm text-slate-400 tabular-nums">0</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">2</td><td className="px-3 py-2 text-sm text-slate-400 tabular-nums">0</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">3</td><td className="px-3 py-2 text-sm text-rose-400 font-bold tabular-nums">-5</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">4</td><td className="px-3 py-2 text-sm text-rose-400 font-bold tabular-nums">-10</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">≥ 5</td><td className="px-3 py-2 text-sm text-rose-400 font-bold tabular-nums">-20</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Completion % Scoring */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-4">
          <h3 className="text-base font-bold text-slate-50 mb-3 tracking-tight">Completion %</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Completion %</th>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">≤ 30%</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+25</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">31-40%</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+15</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">41-50%</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+5</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">&gt; 50%</td><td className="px-3 py-2 text-sm text-slate-400 tabular-nums">0</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Turnovers Scoring */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-4">
          <h3 className="text-base font-bold text-slate-50 mb-3 tracking-tight">Turnovers</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Turnovers</th>
                  <th className="px-2 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">3</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+12</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">4</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+16</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">5</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+24</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-sm text-slate-200">≥ 6</td><td className="px-3 py-2 text-sm text-emerald-400 font-bold tabular-nums">+50</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Events Scoring and League Rules - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events Scoring */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-4">
          <h3 className="text-base font-bold text-slate-50 mb-3 tracking-tight">Special Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Event</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {SCORING_EVENTS.map((event, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'} hover:bg-slate-700/20 transition-colors`}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-200">{event.name}</td>
                    <td className={`px-3 py-2 text-sm font-bold tabular-nums ${event.points > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {event.points > 0 ? '+' : ''}{event.points}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{event.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* League Rules */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6">
          <h3 className="text-base font-bold text-slate-50 mb-4 tracking-tight">League Rules</h3>
          <div className="space-y-3 text-sm text-slate-200">
            <div className="py-1.5 border-b border-slate-700/30">
              <strong className="text-slate-50 font-bold">Teams:</strong> 8 teams, each with 4 NFL team QBs
            </div>
            <div className="py-1.5 border-b border-slate-700/30">
              <strong className="text-slate-50 font-bold">Lineups:</strong> Each team starts exactly 2 QBs per week
            </div>
            <div className="py-1.5 border-b border-slate-700/30">
              <strong className="text-slate-50 font-bold">Scoring:</strong> Team score = sum of both QB scores
            </div>
            <div className="py-1.5 border-b border-slate-700/30">
              <strong className="text-slate-50 font-bold">Matchups:</strong> Higher total score wins the matchup
            </div>
            <div className="py-1.5 border-b border-slate-700/30">
              <strong className="text-slate-50 font-bold">Standings:</strong> Sorted by wins, then total points
            </div>
            <div className="py-1.5 border-b border-slate-700/30">
              <strong className="text-slate-50 font-bold">QB Tracking:</strong> Teams draft NFL franchises (e.g., "Chicago"), all QB stats for that team combine
            </div>
            <div className="py-1.5">
              <strong className="text-slate-50 font-bold">Minimum Starts:</strong> All teams must be started for at least 4 games each season
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Rules;
