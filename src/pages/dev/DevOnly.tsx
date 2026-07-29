import React from 'react';

/** Blocks /dev/* league routes outside Vite DEV builds. */
const DevOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!import.meta.env.DEV) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <p className="text-slate-400">Dev league routes are only available in development builds.</p>
      </div>
    );
  }
  return <>{children}</>;
};

export default DevOnly;
