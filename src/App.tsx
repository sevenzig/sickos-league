import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LeagueProvider } from './context/LeagueContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Rosters from './pages/Rosters';
import SetLineups from './pages/SetLineups';
import EnterScores from './pages/EnterScores';
import Rules from './pages/Rules';
import Admin from './pages/Admin';
import AdminImport from './pages/AdminImport';
import AdminMigration from './pages/AdminMigration';

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
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/import" element={<AdminImport />} />
              <Route path="/admin/migration" element={<AdminMigration />} />
            </Routes>
          </Layout>
        </div>
      </Router>
    </LeagueProvider>
  );
}

export default App;
