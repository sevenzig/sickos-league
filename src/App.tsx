import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LeagueProvider } from './context/LeagueContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Rosters from './pages/Rosters';
import SetLineups from './pages/SetLineups';
import EnterScores from './pages/EnterScores';
import Rules from './pages/Rules';

function App() {
  return (
    <LeagueProvider>
      <Router>
        <div className="min-h-screen bg-dark-bg text-white">
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/rosters" element={<Rosters />} />
              <Route path="/lineups" element={<SetLineups />} />
              <Route path="/scores" element={<EnterScores />} />
              <Route path="/rules" element={<Rules />} />
            </Routes>
          </Layout>
        </div>
      </Router>
    </LeagueProvider>
  );
}

export default App;
