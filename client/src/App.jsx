import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import AuthGuard from './components/auth/AuthGuard';
import { Toaster } from 'react-hot-toast';

// ─── Lazy-loaded pages (route-level code splitting) ───────────────────────────
// Auth
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));

// Meta (Facebook Pages + Instagram)
const MetaAdsPage = lazy(() => import('./pages/dashboard/MetaAdsPage'));

// Public
const LandingPage = lazy(() => import('./pages/public/LandingPage'));
// Both legal pages are required for Meta App Review
const PrivacyPolicy = lazy(() => import('./pages/public/PrivacyPolicy'));
const TermsPage = lazy(() => import('./pages/public/TermsPage'));
// Meta App Dashboard -> Settings -> Basic -> Data Deletion Instructions URL
const DataDeletionPage = lazy(() => import('./pages/public/DataDeletionPage'));

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Toaster position="top-right" reverseOrder={false} />
        <Suspense fallback={null}>
          <Routes>
            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            {/* Meta dashboard — also the OAuth return target
                (see META_RETURN_PATH in server/src/routes/social/metaRoutes.js) */}
            <Route path="/socialdashboad" element={
              <AuthGuard>
                <MetaAdsPage />
              </AuthGuard>
            } />

            {/* Legal — linked from the Meta app dashboard */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-policy" element={<TermsPage />} />
            <Route path="/data-deletion" element={<DataDeletionPage />} />

            {/* Landing */}
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
