import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

import AppProviders from '@/app/providers/AppProviders';
import { routes } from '@/app/routes';

export default function App() {
  return (
    <AppProviders>
      <Suspense fallback={null}>
        <Routes>
          {routes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Routes>
      </Suspense>
    </AppProviders>
  );
}
