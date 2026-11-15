import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './i18n';
import './styles/index.css';
import { router } from './router';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { FarmProvider } from './contexts/FarmContext';
import { CommunityAreaProvider } from './features/community/CommunityAreaContext';
import { AccountDataGuard } from './features/account/AccountDataGuard';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <FarmProvider>
          <CommunityAreaProvider>
            {/* Clears this browser's farm data when the account changes or the user logs out */}
            <AccountDataGuard>
              <RouterProvider router={router} />
            </AccountDataGuard>
          </CommunityAreaProvider>
        </FarmProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
