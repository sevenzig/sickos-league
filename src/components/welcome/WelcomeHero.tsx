import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const WelcomeHero: React.FC = () => {
  return (
    <section className="text-center py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-display md:text-5xl font-bold text-white mb-8">Bad QB League</h1>
        <p className="text-heading md:text-xl leading-relaxed text-slate-400 mb-12 max-w-2xl mx-auto font-normal">
          The fantasy football league where the worst quarterbacks win. Join leagues, manage
          lineups, and compete for the title of worst QB manager.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Button asChild size="lg">
            <Link to="/leagues/new">Create a League</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link to="/invite">Join with Code</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default WelcomeHero;
