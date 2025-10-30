import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LeagueProvider } from './context/LeagueContext';
import { AuthProvider } from './context/AuthContext';
import { FEATURE_FLAGS } from './utils/supabase';
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
import Welcome from './pages/Welcome';
import MyLeagues from './pages/MyLeagues';
import CreateLeague from './pages/CreateLeague';
import InviteRedeem from './pages/InviteRedeem';
import LeagueDashboard from './pages/LeagueDashboard';
import BQBLTest from './pages/BQBLTest';

function App() {
  // Choose the home route based on feature flag
  const HomeComponent = FEATURE_FLAGS.ENABLE_MULTI_LEAGUE ? Welcome : Home;

  return (
    <AuthProvider>
      <LeagueProvider>
        <Router>
          <div className="min-h-screen bg-dark-bg text-white">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={
                FEATURE_FLAGS.ENABLE_MULTI_LEAGUE ? <Welcome /> : (
                  <Layout>
                    <Home />
                  </Layout>
                )
              } />

              {/* Routes that need Layout wrapper */}
              <Route path="/rosters" element={<Layout><Rosters /></Layout>} />
              <Route path="/scores" element={<Layout><EnterScores /></Layout>} />
              <Route path="/rules" element={<Layout><Rules /></Layout>} />

              {/* Hidden Test Route - Not in navigation, no layout */}
              <Route path="/bqbl-test" element={<BQBLTest />} />

              {/* Multi-League Routes (feature flagged) */}
              {FEATURE_FLAGS.ENABLE_MULTI_LEAGUE && (
                <>
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/invite/:code" element={<Layout><InviteRedeem /></Layout>} />
                  <Route path="/my-leagues" element={
                    <Layout>
                      <ProtectedRoute>
                        <MyLeagues />
                      </ProtectedRoute>
                    </Layout>
                  } />
                  <Route path="/leagues/new" element={
                    <Layout>
                      <ProtectedRoute>
                        <CreateLeague />
                      </ProtectedRoute>
                    </Layout>
                  } />
                  {/* League-specific routes */}
                  <Route path="/leagues/:leagueId" element={
                    <Layout>
                      <ProtectedRoute>
                        <LeagueDashboard />
                      </ProtectedRoute>
                    </Layout>
                  } />
                  <Route path="/leagues/:leagueId/*" element={
                    <Layout>
                      <ProtectedRoute>
                        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                          <p className="text-white">League Pages - Coming Soon</p>
                        </div>
                      </ProtectedRoute>
                    </Layout>
                  } />
                </>
              )}

              {/* Protected Admin Routes (legacy single-league) */}
              <Route path="/admin" element={
                <Layout>
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/admin/lineups" element={
                <Layout>
                  <ProtectedRoute>
                    <AdminLineups />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/admin/import" element={
                <Layout>
                  <ProtectedRoute>
                    <AdminImport />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/admin/migration" element={
                <Layout>
                  <ProtectedRoute>
                    <AdminMigration />
                  </ProtectedRoute>
                </Layout>
              } />
            </Routes>
          </div>
        </Router>
      </LeagueProvider>
    </AuthProvider>
  );
}

export default App;
