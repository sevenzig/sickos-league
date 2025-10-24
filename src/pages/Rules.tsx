import React from 'react';
import { SCORING_EVENTS } from '../utils/scoring';

const Rules: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="bg-dark-surface rounded-lg p-2">
        <h2 className="text-lg font-semibold mb-1">Bad QB League Scoring Rules</h2>
        <p className="text-gray-400 text-sm">Higher scores are better - poor performance earns more points!</p>
      </div>

      {/* 4-Column Grid for Scoring Tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Pass Yards Scoring */}
        <div className="bg-dark-card rounded-lg p-2">
          <h3 className="text-base font-semibold mb-2">Pass Yards</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Yards</th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                <tr><td className="px-2 py-1 text-sm">≤ 100</td><td className="px-2 py-1 text-sm text-green-400">+25</td></tr>
                <tr><td className="px-2 py-1 text-sm">101-150</td><td className="px-2 py-1 text-sm text-green-400">+12</td></tr>
                <tr><td className="px-2 py-1 text-sm">151-200</td><td className="px-2 py-1 text-sm text-green-400">+6</td></tr>
                <tr><td className="px-2 py-1 text-sm">201-299</td><td className="px-2 py-1 text-sm">0</td></tr>
                <tr><td className="px-2 py-1 text-sm">300-349</td><td className="px-2 py-1 text-sm text-red-400">-6</td></tr>
                <tr><td className="px-2 py-1 text-sm">350-399</td><td className="px-2 py-1 text-sm text-red-400">-9</td></tr>
                <tr><td className="px-2 py-1 text-sm">≥ 400</td><td className="px-2 py-1 text-sm text-red-400">-12</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Touchdowns Scoring */}
        <div className="bg-dark-card rounded-lg p-2">
          <h3 className="text-base font-semibold mb-2">Touchdowns</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Touchdowns</th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                <tr><td className="px-2 py-1 text-sm">0</td><td className="px-2 py-1 text-sm text-green-400">+10</td></tr>
                <tr><td className="px-2 py-1 text-sm">1</td><td className="px-2 py-1 text-sm">0</td></tr>
                <tr><td className="px-2 py-1 text-sm">2</td><td className="px-2 py-1 text-sm">0</td></tr>
                <tr><td className="px-2 py-1 text-sm">3</td><td className="px-2 py-1 text-sm text-red-400">-5</td></tr>
                <tr><td className="px-2 py-1 text-sm">4</td><td className="px-2 py-1 text-sm text-red-400">-10</td></tr>
                <tr><td className="px-2 py-1 text-sm">≥ 5</td><td className="px-2 py-1 text-sm text-red-400">-20</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Completion % Scoring */}
        <div className="bg-dark-card rounded-lg p-2">
          <h3 className="text-base font-semibold mb-2">Completion %</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Completion %</th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                <tr><td className="px-2 py-1 text-sm">≤ 30%</td><td className="px-2 py-1 text-sm text-green-400">+25</td></tr>
                <tr><td className="px-2 py-1 text-sm">31-40%</td><td className="px-2 py-1 text-sm text-green-400">+15</td></tr>
                <tr><td className="px-2 py-1 text-sm">41-50%</td><td className="px-2 py-1 text-sm text-green-400">+5</td></tr>
                <tr><td className="px-2 py-1 text-sm">&gt; 50%</td><td className="px-2 py-1 text-sm">0</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Turnovers Scoring */}
        <div className="bg-dark-card rounded-lg p-2">
          <h3 className="text-base font-semibold mb-2">Turnovers</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Turnovers</th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                <tr><td className="px-2 py-1 text-sm">3</td><td className="px-2 py-1 text-sm text-green-400">+12</td></tr>
                <tr><td className="px-2 py-1 text-sm">4</td><td className="px-2 py-1 text-sm text-green-400">+16</td></tr>
                <tr><td className="px-2 py-1 text-sm">5</td><td className="px-2 py-1 text-sm text-green-400">+24</td></tr>
                <tr><td className="px-2 py-1 text-sm">≥ 6</td><td className="px-2 py-1 text-sm text-green-400">+50</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Events Scoring and League Rules - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Events Scoring */}
        <div className="bg-dark-card rounded-lg p-2">
          <h3 className="text-base font-semibold mb-2">Special Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Event</th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Points</th>
                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-300">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                {SCORING_EVENTS.map((event, index) => (
                  <tr key={index}>
                    <td className="px-2 py-1 text-sm font-medium">{event.name}</td>
                    <td className={`px-2 py-1 text-sm ${event.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {event.points > 0 ? '+' : ''}{event.points}
                    </td>
                    <td className="px-2 py-1 text-xs text-gray-400">{event.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* League Rules */}
        <div className="bg-dark-card rounded-lg p-2">
          <h3 className="text-base font-semibold mb-2">League Rules</h3>
          <div className="space-y-1.5 text-xs text-gray-300">
            <div>
              <strong>Teams:</strong> 8 teams, each with 4 NFL team QBs
            </div>
            <div>
              <strong>Lineups:</strong> Each team starts exactly 2 QBs per week
            </div>
            <div>
              <strong>Scoring:</strong> Team score = sum of both QB scores
            </div>
            <div>
              <strong>Matchups:</strong> Higher total score wins the matchup
            </div>
            <div>
              <strong>Standings:</strong> Sorted by wins, then total points
            </div>
            <div>
              <strong>QB Tracking:</strong> Teams draft NFL franchises (e.g., "Chicago"), all QB stats for that team combine
            </div>
            <div>
              <strong>Minimum Starts:</strong> All teams must be started for at least 4 games each season
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Rules;
