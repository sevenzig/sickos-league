import React from 'react';

interface LeagueNameInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const LeagueNameInput: React.FC<LeagueNameInputProps> = ({ value, onChange, error }) => {
  return (
    <div className="mb-8">
      <label htmlFor="leagueName" className="block text-lg font-medium text-white mb-3">
        League Name
      </label>
      <input
        type="text"
        id="leagueName"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your league name"
        className={`w-full px-4 py-3 bg-white/5 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
          error ? 'border-red-500' : 'border-slate-600'
        }`}
        maxLength={50}
      />
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
      <p className="mt-2 text-sm text-slate-400">
        Choose a memorable name for your league (up to 50 characters)
      </p>
    </div>
  );
};

export default LeagueNameInput;