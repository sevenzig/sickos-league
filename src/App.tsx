import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LeagueProvider } from './context/LeagueContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Home from './pages/Home';
import Rosters from './pages/Rosters';
import Rules from './pages/Rules';
import AdminDashboard from './pages/AdminDashboard';
import AdminImport from './pages/AdminImport';
import AdminMigration from './pages/AdminMigration';
import Welcome from './pages/Welcome';
import MyLeagues from './pages/MyLeagues';
import CreateLeague from './pages/CreateLeague';
import InviteRedeem from './pages/InviteRedeem';
import LeagueView from './pages/LeagueView';
import LeagueAdmin from './pages/LeagueAdmin';
import LeagueLineups from './pages/LeagueLineups';
import LeagueDraft from './pages/LeagueDraft';
import LeagueSchedule from './pages/LeagueSchedule';
import LeagueStandingsPage from './pages/LeagueStandingsPage';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/EditProfile';
import BQBLTest from './pages/BQBLTest';
import FeatDraftSandbox from './pages/dev/FeatDraftSandbox';
import DevOnly from './pages/dev/DevOnly';

function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <div className="min-h-screen bg-dark-bg text-white">
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/rules" element={<Layout><Rules /></Layout>} />
              <Route path="/bqbl-test" element={<BQBLTest />} />
              <Route path="/dev/feat_draft" element={<FeatDraftSandbox />} />

              {/* Dev mirrors of league pages — full UUID in path, DEV builds only */}
              <Route path="/dev/leagues/:leagueId" element={
                <DevOnly>
                  <Layout>
                    <ProtectedRoute>
                      <LeagueView />
                    </ProtectedRoute>
                  </Layout>
                </DevOnly>
              }>
                <Route path="week/:week/:team1/:team2" element={null} />
              </Route>
              <Route path="/dev/leagues/:leagueId/draft" element={
                <DevOnly>
                  <ProtectedRoute>
                    <LeagueDraft />
                  </ProtectedRoute>
                </DevOnly>
              } />
              <Route path="/dev/leagues/:leagueId/lineups" element={
                <DevOnly>
                  <Layout>
                    <ProtectedRoute>
                      <LeagueLineups />
                    </ProtectedRoute>
                  </Layout>
                </DevOnly>
              } />
              <Route path="/dev/leagues/:leagueId/schedule" element={
                <DevOnly>
                  <Layout>
                    <ProtectedRoute>
                      <LeagueSchedule />
                    </ProtectedRoute>
                  </Layout>
                </DevOnly>
              } />
              <Route path="/dev/leagues/:leagueId/standings" element={
                <DevOnly>
                  <Layout>
                    <ProtectedRoute>
                      <LeagueStandingsPage />
                    </ProtectedRoute>
                  </Layout>
                </DevOnly>
              } />
              <Route path="/dev/leagues/:leagueId/admin" element={
                <DevOnly>
                  <Layout>
                    <ProtectedRoute>
                      <LeagueAdmin />
                    </ProtectedRoute>
                  </Layout>
                </DevOnly>
              } />
              <Route path="/dev/leagues/:leagueId/*" element={
                <DevOnly>
                  <Layout>
                    <ProtectedRoute>
                      <LeagueView />
                    </ProtectedRoute>
                  </Layout>
                </DevOnly>
              } />

              {/* Legacy single-league archive (read-only; requires sign-in because /api/db requires auth) */}
              <Route path="/archive" element={
                <Layout>
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/rosters" element={
                <Layout>
                  <ProtectedRoute>
                    <Rosters />
                  </ProtectedRoute>
                </Layout>
              } />

              <Route path="/invite" element={<Layout><InviteRedeem /></Layout>} />
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
              <Route path="/profile" element={
                <Layout>
                  <ProtectedRoute>
                    <UserProfile />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/profile/edit" element={
                <Layout>
                  <ProtectedRoute>
                    <EditProfile />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/leagues/:leagueId" element={
                <Layout>
                  <ProtectedRoute>
                    <LeagueView />
                  </ProtectedRoute>
                </Layout>
              }>
                <Route path="week/:week/:team1/:team2" element={null} />
              </Route>
              <Route path="/leagues/:leagueId/draft" element={
                <ProtectedRoute>
                  <LeagueDraft />
                </ProtectedRoute>
              } />
              <Route path="/leagues/:leagueId/admin" element={
                <Layout>
                  <ProtectedRoute>
                    <LeagueAdmin />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/leagues/:leagueId/schedule" element={
                <Layout>
                  <ProtectedRoute>
                    <LeagueSchedule />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/leagues/:leagueId/standings" element={
                <Layout>
                  <ProtectedRoute>
                    <LeagueStandingsPage />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/leagues/:leagueId/lineups" element={
                <Layout>
                  <ProtectedRoute>
                    <LeagueLineups />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/leagues/:leagueId/*" element={
                <Layout>
                  <ProtectedRoute>
                    <LeagueView />
                  </ProtectedRoute>
                </Layout>
              } />

              {/* Platform-admin routes */}
              <Route path="/admin" element={
                <Layout>
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                </Layout>
              } />
              <Route path="/admin/import" element={
                <Layout>
                  <AdminRoute>
                    <AdminImport />
                  </AdminRoute>
                </Layout>
              } />
              <Route path="/admin/migration" element={
                <Layout>
                  <AdminRoute>
                    <AdminMigration />
                  </AdminRoute>
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
