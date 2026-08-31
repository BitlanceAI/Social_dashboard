import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';

import { AuthProvider } from '@/features/auth';
import { WorkspaceProvider } from '@/features/workspace';
import { ThemeProvider } from '@/shared/context/ThemeContext';

/**
 * Every app-wide context lives here, so adding one never touches App.jsx
 * or the route table.
 */
export default function AppProviders({ children }) {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <Toaster position="top-right" reverseOrder={false} />
            {children}
          </WorkspaceProvider>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
