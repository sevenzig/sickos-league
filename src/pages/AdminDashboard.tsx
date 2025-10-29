import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();

  const adminLinks = [
    {
      to: '/admin/lineups',
      title: 'Manage Lineups',
      description: 'Set and finalize weekly team lineups',
      icon: '👥',
      color: 'emerald'
    },
    {
      to: '/admin/import',
      title: 'Import Data',
      description: 'Import weekly scoring data from CSV files',
      icon: '📊',
      color: 'blue'
    },
    {
      to: '/admin/migration',
      title: 'Data Migration',
      description: 'Migrate data between storage systems',
      icon: '🔄',
      color: 'purple'
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30';
      case 'blue':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30';
      case 'purple':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30 hover:bg-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-50 tracking-tight">Admin Dashboard</h1>
            <p className="text-slate-400 mt-2">
              Welcome back, {user?.email?.split('@')[0] || 'Admin'}
            </p>
          </div>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-slate-800/90 hover:bg-slate-700/50 text-slate-200 rounded-lg transition-all duration-200 font-medium border border-slate-600/50 hover:border-slate-500/50"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`
              block p-6 rounded-2xl border-2 transition-all duration-200
              hover:scale-[1.02] hover:shadow-lg
              ${getColorClasses(link.color)}
            `}
          >
            <div className="text-3xl mb-4">{link.icon}</div>
            <h3 className="text-lg font-bold mb-2">{link.title}</h3>
            <p className="text-sm opacity-80">{link.description}</p>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6 md:p-8">
        <h2 className="text-xl font-black text-slate-50 tracking-tight mb-6">Admin Tools</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/30">
            <div className="text-sm text-slate-400 uppercase tracking-wider font-bold">Lineups</div>
            <div className="text-2xl font-bold text-slate-200 mt-1">Manage</div>
          </div>

          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/30">
            <div className="text-sm text-slate-400 uppercase tracking-wider font-bold">Data</div>
            <div className="text-2xl font-bold text-slate-200 mt-1">Import</div>
          </div>

          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/30">
            <div className="text-sm text-slate-400 uppercase tracking-wider font-bold">Settings</div>
            <div className="text-2xl font-bold text-slate-200 mt-1">Configure</div>
          </div>

          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/30">
            <div className="text-sm text-slate-400 uppercase tracking-wider font-bold">Status</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">Active</div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-700/30">
          <p className="text-sm text-slate-400">
            You have administrative access to all league management functions.
            Use the tools above to manage lineups, import data, and configure league settings.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;