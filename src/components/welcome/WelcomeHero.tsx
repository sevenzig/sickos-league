import React from 'react';
import { Link } from 'react-router-dom';

const WelcomeHero: React.FC = () => {
  return (
    <section className="text-center py-24 px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-light tracking-wide text-white mb-8 leading-tight">
          Bad QB League
        </h1>
        <p className="text-lg md:text-xl leading-relaxed text-slate-400 mb-12 max-w-2xl mx-auto font-light">
          The fantasy football league where the worst quarterbacks win.
          Join leagues, manage lineups, and compete for the title of worst QB manager.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link
            to="/rules"
            className="inline-flex items-center px-8 py-4 text-base font-medium text-white bg-blue-600 rounded-md"
          >
            Learn the Rules
          </Link>
          <Link
            to="/archive"
            className="inline-flex items-center px-8 py-4 text-base font-medium text-slate-400 border border-slate-600 rounded-md"
          >
            View Archive
          </Link>
        </div>
      </div>
    </section>
  );
};

export default WelcomeHero;