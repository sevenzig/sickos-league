import React from 'react';
import { SCORING_EVENTS } from '../utils/scoring';
import { PageChrome, Panel } from '@/components/ui';

const Rules: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageChrome title="Bad QB League Scoring Rules" />

      {/* 4-Column Grid for Scoring Tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pass Yards Scoring */}
        <Panel padding="none" className="p-4">
          <h3 className="text-label font-bold text-slate-50 mb-3 tracking-tight">Pass Yards</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Yards</th>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">≤ 100</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+25</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">101-150</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+12</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">151-200</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+6</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">201-299</td><td className="px-3 py-2 text-label text-slate-400 tabular-nums">0</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">300-349</td><td className="px-3 py-2 text-label text-rose-400 font-bold tabular-nums">-6</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">350-399</td><td className="px-3 py-2 text-label text-rose-400 font-bold tabular-nums">-9</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">≥ 400</td><td className="px-3 py-2 text-label text-rose-400 font-bold tabular-nums">-12</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Touchdowns Scoring */}
        <Panel padding="none" className="p-4">
          <h3 className="text-label font-bold text-slate-50 mb-3 tracking-tight">Touchdowns</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Touchdowns</th>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">0</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+10</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">1</td><td className="px-3 py-2 text-label text-slate-400 tabular-nums">0</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">2</td><td className="px-3 py-2 text-label text-slate-400 tabular-nums">0</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">3</td><td className="px-3 py-2 text-label text-rose-400 font-bold tabular-nums">-5</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">4</td><td className="px-3 py-2 text-label text-rose-400 font-bold tabular-nums">-10</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">≥ 5</td><td className="px-3 py-2 text-label text-rose-400 font-bold tabular-nums">-20</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Completion % Scoring */}
        <Panel padding="none" className="p-4">
          <h3 className="text-label font-bold text-slate-50 mb-3 tracking-tight">Completion %</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Completion %</th>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">≤ 30%</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+25</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">31-40%</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+15</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">41-50%</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+5</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">&gt; 50%</td><td className="px-3 py-2 text-label text-slate-400 tabular-nums">0</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Turnovers Scoring */}
        <Panel padding="none" className="p-4">
          <h3 className="text-label font-bold text-slate-50 mb-3 tracking-tight">Turnovers</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Turnovers</th>
                  <th className="px-2 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">3</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+12</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">4</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+16</td></tr>
                <tr className="bg-slate-800/20 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">5</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+24</td></tr>
                <tr className="bg-slate-800/40 hover:bg-slate-700/20 transition-colors"><td className="px-3 py-2 text-label text-slate-200">≥ 6</td><td className="px-3 py-2 text-label text-emerald-400 font-bold tabular-nums">+50</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Events + League Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel padding="none" className="p-4">
          <h3 className="text-label font-bold text-slate-50 mb-3 tracking-tight">Special Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                <tr>
                  <th className="px-3 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Event</th>
                  <th className="px-3 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Points</th>
                  <th className="px-3 py-2 text-left text-caption font-bold text-slate-400 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {SCORING_EVENTS.map((event, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'} hover:bg-slate-700/20 transition-colors`}>
                    <td className="px-3 py-2 text-label font-medium text-slate-200">{event.name}</td>
                    <td className={`px-3 py-2 text-label font-bold tabular-nums ${event.points > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {event.points > 0 ? '+' : ''}{event.points}
                    </td>
                    <td className="px-3 py-2 text-caption text-slate-400">{event.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-label font-bold text-slate-50 mb-4 tracking-tight">League Rules</h3>
          <div className="space-y-3 text-label text-slate-200">
            {[
              ['Teams', '8 teams, each with 4 NFL team QBs'],
              ['Lineups', 'Each team starts exactly 2 QBs per week'],
              ['Scoring', 'Team score = sum of both QB scores'],
              ['Matchups', 'Higher total score wins the matchup'],
              ['Regular season', '14 weeks. Every team plays once each week'],
              ['Playoffs', 'Start week 15. The commissioner picks a field of 4, 5, 6, or 8. No consolation games'],
              ['Standings', 'The commissioner picks the tiebreaker: wins then points, or points then wins'],
              ['QB Tracking', 'Teams draft NFL franchises (e.g., "Chicago"), all QB stats for that team combine'],
              ['Minimum Starts', 'All teams must be started for at least 4 games each season'],
            ].map(([title, body]) => (
              <div key={title} className="py-1.5 border-b border-slate-700/30 last:border-b-0">
                <strong className="text-slate-50 font-bold">{title}:</strong> {body}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default Rules;
