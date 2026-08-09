import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { NFL_TEAMS, type NFLTeam } from '../../types';
import { getTeamAbbr, getTeamLogo } from '../../utils/teamLogos';
import DevOnly from './DevOnly';

const TAKEN = new Set<NFLTeam>(NFL_TEAMS.slice(0, 14));

type OptId = 1 | 2 | 3 | 4 | 5;

interface PhoneProps {
  id: OptId;
  title: string;
  blurb: string;
  children: (ctx: {
    selected: NFLTeam;
    setSelected: (t: NFLTeam) => void;
    taken: boolean;
    Board: React.FC<{ cols: 4 | 8 }>;
  }) => React.ReactNode;
}

function TeamBoard({
  selected,
  setSelected,
  cols,
}: {
  selected: NFLTeam;
  setSelected: (t: NFLTeam) => void;
  cols: 4 | 8;
}) {
  return (
    <div
      className={`h-full min-h-0 grid gap-1.5 ${
        cols === 4 ? 'grid-cols-4 grid-rows-8' : 'grid-cols-8 grid-rows-4'
      }`}
    >
      {NFL_TEAMS.map((team, i) => {
        const abbr = getTeamAbbr(team);
        const logo = getTeamLogo(team);
        const isTaken = TAKEN.has(team);
        const isSel = selected === team;
        return (
          <button
            key={team}
            type="button"
            onClick={() => setSelected(team)}
            title={team}
            className={`relative min-h-0 min-w-0 rounded-lg border flex items-center justify-center overflow-hidden ${
              isTaken
                ? 'bg-slate-950 border-slate-800 opacity-45'
                : isSel
                  ? 'bg-emerald-950/50 border-emerald-400 ring-1 ring-emerald-400/50'
                  : 'bg-slate-800/90 border-slate-700 hover:border-slate-500'
            }`}
          >
            {logo ? (
              <img
                src={logo}
                alt=""
                className={`w-[62%] h-[62%] object-contain pointer-events-none ${isTaken ? 'grayscale' : ''}`}
                draggable={false}
              />
            ) : (
              <span className="text-[10px] font-bold text-slate-300">{abbr}</span>
            )}
            {isTaken && (
              <span className="absolute top-0.5 right-0.5 text-[9px] text-slate-500 font-mono">
                {i + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3.5 py-3 border-b border-slate-700/80">
      <p className="flex-1 min-w-0 text-label font-semibold text-white truncate">jscott's pick</p>
      <span className="text-[10px] font-bold tracking-wide bg-emerald-500 text-emerald-950 px-1.5 py-0.5 rounded">
        YOU
      </span>
      <span className="font-mono tabular-nums text-label font-bold text-amber-400">0:47</span>
    </div>
  );
}

function HeroLogo({ team, dim }: { team: string; dim?: boolean }) {
  const logo = getTeamLogo(team);
  const abbr = getTeamAbbr(team);
  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-slate-800 ${
        dim
          ? 'border-[3px] border-slate-600 opacity-70'
          : 'border-[3px] border-emerald-400 shadow-[0_0_0_6px_rgba(34,197,94,0.18)]'
      }`}
    >
      {logo ? (
        <img src={logo} alt="" className={`w-[72%] h-[72%] object-contain ${dim ? 'grayscale' : ''}`} draggable={false} />
      ) : (
        <span className="text-3xl font-black text-white">{abbr}</span>
      )}
    </div>
  );
}

function DraftCta({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`w-[calc(100%-2rem)] mx-4 h-12 rounded-xl text-label font-bold ${
        disabled
          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
          : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
      }`}
    >
      {disabled ? 'Taken' : 'Draft this team'}
    </button>
  );
}

function PhoneShell({ id, title, blurb, children }: PhoneProps) {
  const [selected, setSelected] = useState<NFLTeam>('San Francisco');
  const taken = TAKEN.has(selected);
  const Board: React.FC<{ cols: 4 | 8 }> = ({ cols }) => (
    <TeamBoard selected={selected} setSelected={setSelected} cols={cols} />
  );

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/80 overflow-hidden">
      <header className="px-3.5 py-3 border-b border-slate-700/80 flex items-baseline justify-between gap-2">
        <h2 className="text-label font-semibold text-white m-0">
          {id}. {title}
        </h2>
        <span className="text-caption text-slate-500 text-right">{blurb}</span>
      </header>
      <div className="py-4 flex justify-center">
        <div className="w-[min(100%,390px)] h-[720px] rounded-3xl border border-slate-700 bg-[#0b1220] overflow-hidden flex flex-col shadow-2xl shadow-black/50">
          {children({ selected, setSelected, taken, Board })}
        </div>
      </div>
    </section>
  );
}

const DraftLayoutOptions: React.FC = () => {
  return (
    <DevOnly>
      <div className="min-h-screen bg-[#060a12] text-white">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <Link to="/dev/feat_draft" className="text-caption text-slate-400 hover:text-slate-200">
              ← Dev draft tools
            </Link>
          </div>
          <h1 className="text-heading font-semibold m-0 mb-1">Draft layout options</h1>
          <p className="text-caption text-slate-400 max-w-2xl mb-6 leading-relaxed">
            Live mocks with real logos. Tap tiles to change the selected team. Pick a layout, then
            tell the agent which number to implement in LeagueDraft.
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <PhoneShell id={1} title="Stack — hero / CTA / 4×8" blurb="Closest to your mock + grid">
              {({ selected, taken, Board }) => (
                <>
                  <TopBar />
                  <div className="flex-shrink-0 flex flex-col items-center gap-2 px-4 pt-4 pb-2">
                    <div className="w-28 h-28 rounded-[22px] overflow-hidden">
                      <HeroLogo team={selected} dim={taken} />
                    </div>
                    <p className="text-heading font-bold text-center m-0">{selected}</p>
                    <p className="text-caption text-slate-400 m-0">{taken ? 'Already drafted' : 'Available'}</p>
                  </div>
                  <DraftCta disabled={taken} />
                  <div className="flex-1 min-h-0 p-2.5 pt-1">
                    <Board cols={4} />
                  </div>
                </>
              )}
            </PhoneShell>

            <PhoneShell id={2} title="Wide board — 8×4" blurb="Same stack; denser grid">
              {({ selected, taken, Board }) => (
                <>
                  <TopBar />
                  <div className="flex-shrink-0 flex flex-col items-center gap-2 px-4 pt-4 pb-2">
                    <div className="w-28 h-28 rounded-[22px] overflow-hidden">
                      <HeroLogo team={selected} dim={taken} />
                    </div>
                    <p className="text-heading font-bold text-center m-0">{selected}</p>
                    <p className="text-caption text-slate-400 m-0">{taken ? 'Already drafted' : 'Available'}</p>
                  </div>
                  <DraftCta disabled={taken} />
                  <div className="flex-1 min-h-0 p-2.5 pt-1">
                    <Board cols={8} />
                  </div>
                </>
              )}
            </PhoneShell>

            <PhoneShell id={3} title="Compact hero — board owns fold" blurb="Smaller icon, bigger tiles">
              {({ selected, taken, Board }) => (
                <>
                  <TopBar />
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex-shrink-0 flex flex-col items-center gap-1.5 px-4 pt-2.5 pb-1">
                      <div className="w-[88px] h-[88px] rounded-[18px] overflow-hidden">
                        <HeroLogo team={selected} dim={taken} />
                      </div>
                      <p className="text-label font-bold text-center m-0">{selected}</p>
                      <p className="text-caption text-slate-400 m-0">{taken ? 'Already drafted' : 'Available'}</p>
                    </div>
                    <DraftCta disabled={taken} />
                    <div className="flex-1 min-h-0 border-t border-slate-700/80 bg-slate-900/60 p-2.5 flex flex-col">
                      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 px-0.5">
                        All teams
                      </p>
                      <div className="flex-1 min-h-0">
                        <Board cols={4} />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </PhoneShell>

            <PhoneShell id={4} title="Inline select + history dock" blurb="Horizontal bar + bottom dock">
              {({ selected, taken, Board }) => (
                <>
                  <TopBar />
                  <div className="flex-shrink-0 flex items-center gap-3 px-3.5 py-3">
                    <div className="w-[72px] h-[72px] rounded-[14px] overflow-hidden flex-shrink-0">
                      <HeroLogo team={selected} dim={taken} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-label font-bold m-0 truncate">{selected}</p>
                      <p className="text-caption text-slate-400 m-0">{taken ? 'Already drafted' : 'Available'}</p>
                    </div>
                  </div>
                  <DraftCta disabled={taken} />
                  <div className="flex-1 min-h-0 p-2.5 pb-14 relative">
                    <Board cols={4} />
                    <div className="absolute left-3 right-3 bottom-3 h-11 rounded-xl bg-slate-800 flex items-center justify-center text-label text-slate-200">
                      ▾ Draft history (10 picks)
                    </div>
                  </div>
                </>
              )}
            </PhoneShell>

            <PhoneShell id={5} title="Staged card + labeled board" blurb="Selected team in a panel">
              {({ selected, taken, Board }) => (
                <>
                  <div className="flex-shrink-0 flex items-center gap-2 px-3.5 py-3">
                    <p className="flex-1 min-w-0 text-label font-semibold text-white truncate">jscott's pick</p>
                    <span className="text-[10px] font-bold tracking-wide bg-emerald-500 text-emerald-950 px-1.5 py-0.5 rounded">
                      YOU
                    </span>
                    <span className="font-mono tabular-nums text-label font-bold text-amber-400">0:47</span>
                  </div>
                  <div className="flex-shrink-0 mx-3 mb-2 rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-800/80 to-slate-900 p-3.5 flex flex-col items-center gap-2">
                    <div className="w-28 h-28 rounded-[22px] overflow-hidden">
                      <HeroLogo team={selected} dim={taken} />
                    </div>
                    <p className="text-heading font-bold text-center m-0">{selected}</p>
                    <p className="text-caption text-slate-400 m-0">{taken ? 'Already drafted' : 'Available'}</p>
                    <button
                      type="button"
                      disabled={taken}
                      className={`w-full h-11 rounded-xl text-label font-bold mt-1 ${
                        taken
                          ? 'bg-slate-700 text-slate-400'
                          : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                      }`}
                    >
                      {taken ? 'Taken' : 'Draft this team'}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col px-2.5 pb-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 px-1">
                      Tap to select
                    </p>
                    <div className="flex-1 min-h-0">
                      <Board cols={4} />
                    </div>
                  </div>
                </>
              )}
            </PhoneShell>
          </div>
        </div>
      </div>
    </DevOnly>
  );
};

export default DraftLayoutOptions;
