# Bad QB League - Fantasy Football PWA

A Progressive Web App for managing a fantasy football league where teams draft bad NFL quarterbacks and score points based on poor performance.

## Features

- **Home/Matchups**: View weekly matchups, scores, and league standings
- **Rosters**: See all team rosters (4 QBs per team)
- **Set Lineups**: Select 2 starting QBs per week for each team
- **Enter Scores**: Input game stats with real-time score calculation
- **Rules**: Complete scoring system reference
- **PWA**: Installable on mobile devices, works offline

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router v6
- localStorage for data persistence
- PWA with service worker

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build for Production

```bash
npm run build
npm run preview
```

## Scoring System

Higher scores are better - poor quarterback performance earns more points!

### Pass Yards
- ≤100: +25 | 101-150: +12 | 151-200: +6 | 201-299: 0 | 300-349: -6 | 350-399: -9 | ≥400: -12

### Touchdowns
- 0: +10 | 1-2: 0 | 3: -5 | 4: -10 | ≥5: -20

### Completion %
- ≤30%: +25 | 31-40%: +15 | 41-50%: +5 | >50%: 0

### Turnovers
- 3: +12 | 4: +16 | 5: +24 | ≥6: +50

### Special Events
- Game-ending F Up: +50
- Benching: +35
- Defensive TD: +20
- QB Safety: +15
- No Pass 25+ Yards: +10
- Interception: +5
- Fumble: +4
- ≥75 Rush Yards: -8
- Game-Winning Drive: -12
- GWD by Field Goal: -6

## Data Persistence

All league data is stored in localStorage and persists across sessions.

