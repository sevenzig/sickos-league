import React from 'react';
import { Link } from 'react-router-dom';

export default function Admin() {
  const adminFeatures = [
    {
      title: 'CSV Import',
      description: 'Import weekly scoring data from CSV files',
      path: '/admin/import',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'Data Migration',
      description: 'Migrate historical data to database',
      path: '/admin/migration',
      gradient: 'from-emerald-500 to-teal-500'
    }
  ];

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] py-6 px-8">
        <h1 className="text-3xl font-black text-slate-50 tracking-tight">Admin Dashboard</h1>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {adminFeatures.map((feature) => (
          <Link
            key={feature.path}
            to={feature.path}
            className="block bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] hover:bg-slate-700/20 transition-all duration-200 overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center text-white mr-4 shadow-lg`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-50">{feature.title}</h2>
                </div>
              </div>
              <p className="text-sm text-slate-300">{feature.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 backdrop-blur-sm rounded-2xl border border-slate-700/30 p-6">
        <div className="flex items-start">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/30 mr-4">
            <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-50 mb-1">Admin Access Required</h3>
            <p className="text-sm text-slate-400">
              These features are for administrators only. Make sure you have the proper permissions before making changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
