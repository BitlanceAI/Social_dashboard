import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

import AppProviders from '@/app/providers/AppProviders';
import { routes } from '@/app/routes';
import { DashboardLoading } from '@/features/auth/components/AuthGuard';

export default function App() {
  return (
    <AppProviders>
      <Suspense fallback={<DashboardLoading />}>
        <Routes>
          {routes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Routes>
      </Suspense>
    </AppProviders>
  );
}
