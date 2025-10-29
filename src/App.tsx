import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LeagueProvider } from './context/LeagueContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Rosters from './pages/Rosters';
import EnterScores from './pages/EnterScores';
import Rules from './pages/Rules';
import AdminDashboard from './pages/AdminDashboard';
import AdminLineups from './pages/AdminLineups';
import AdminImport from './pages/AdminImport';
import AdminMigration from './pages/AdminMigration';

function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <Router>
          <div className="min-h-screen bg-dark-bg text-white">
            <Layout>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/rosters" element={<Rosters />} />
                <Route path="/scores" element={<EnterScores />} />
                <Route path="/rules" element={<Rules />} />

                {/* Protected Admin Routes */}
                <Route path="/admin" element={
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/lineups" element={
                  <ProtectedRoute>
                    <AdminLineups />
                  </ProtectedRoute>
                } />
                <Route path="/admin/import" element={
                  <ProtectedRoute>
                    <AdminImport />
                  </ProtectedRoute>
                } />
                <Route path="/admin/migration" element={
                  <ProtectedRoute>
                    <AdminMigration />
                  </ProtectedRoute>
                } />
              </Routes>
            </Layout>
          </div>
        </Router>
      </LeagueProvider>
    </AuthProvider>
  );
}

export default App;
