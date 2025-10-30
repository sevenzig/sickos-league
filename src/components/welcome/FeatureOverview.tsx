import React from 'react';

const FeatureOverview: React.FC = () => {
  return (
    <section className="py-24 px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-light text-white mb-6 leading-tight">
          Everything you need to run your Bad QB League
        </h2>
        <p className="text-slate-400 leading-relaxed font-light">
          Create multiple leagues, invite friends, manage lineups, and track standings across
          all your leagues in one place.
        </p>
      </div>

      <div className="max-w-5xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="text-center">
          <div className="w-6 h-6 bg-blue-600 rounded mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-white mb-3">Secure Management</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            Create private leagues with invitation-only access. Each league has its own
            settings, schedule, and standings.
          </p>
        </div>

        <div className="text-center">
          <div className="w-6 h-6 bg-blue-600 rounded mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-white mb-3">Automated Scheduling</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            Generate round-robin schedules automatically for 8-team leagues.
            No more manual scheduling headaches.
          </p>
        </div>

        <div className="text-center">
          <div className="w-6 h-6 bg-blue-600 rounded mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-white mb-3">Lineup Management</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            Set weekly lineups with customizable starter requirements.
            League owners can override lineups when needed.
          </p>
        </div>
      </div>
    </section>
  );
};

export default FeatureOverview;