import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

import { AuthGuard } from '@/features/auth';

// ─── Lazy-loaded pages (route-level code splitting) ───────────────────────────
const LoginPage        = lazy(() => import('@/features/auth/pages/LoginPage'));
const SignupPage       = lazy(() => import('@/features/auth/pages/SignupPage'));
const MetaAdsPage      = lazy(() => import('@/features/meta/pages/MetaAdsPage'));
const LandingPage      = lazy(() => import('@/features/marketing/pages/LandingPage'));
const PrivacyPolicy    = lazy(() => import('@/features/legal/pages/PrivacyPolicy'));
const TermsPage        = lazy(() => import('@/features/legal/pages/TermsPage'));
const DataDeletionPage = lazy(() => import('@/features/legal/pages/DataDeletionPage'));

const guarded = (element) => <AuthGuard>{element}</AuthGuard>;

/**
 * Route table, grouped by feature. A new feature adds its block here and
 * nothing else in `app/` changes.
 */
export const routes = [
  // Auth
  { path: '/login',  element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },

  // Meta dashboard — also the OAuth return target
  // (see META_RETURN_PATH in server/src/modules/meta/meta.routes.js)
  { path: '/socialdashboad', element: guarded(<MetaAdsPage />) },

  // Legal — linked from the Meta app dashboard; both are required for Meta App Review
  { path: '/privacy-policy', element: <PrivacyPolicy /> },
  { path: '/terms-policy',   element: <TermsPage /> },
  { path: '/data-deletion',  element: <DataDeletionPage /> },

  // Marketing
  { path: '/', element: <LandingPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export default routes;
