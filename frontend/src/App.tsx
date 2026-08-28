import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppNav } from '@/components/AppNav';
import { RequireAuth } from '@/components/RequireAuth';
import { JobHistoryPage } from '@/pages/JobHistoryPage';
import { JobProgressPage } from '@/pages/JobProgressPage';
import { JobResultDetailPage } from '@/pages/JobResultDetailPage';
import { JobResultsPage } from '@/pages/JobResultsPage';
import { LoginPage } from '@/pages/LoginPage';
import { RunnerPage } from '@/pages/RunnerPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: (
          <div className="min-h-screen bg-slate-50 p-6">
            <AppNav />
            <Outlet />
          </div>
        ),
        children: [
          { path: '/', element: <RunnerPage /> },
          { path: '/history', element: <JobHistoryPage /> },
          { path: '/jobs/:id', element: <JobProgressPage /> },
          { path: '/jobs/:id/results', element: <JobResultsPage /> },
          { path: '/jobs/:id/results/:rid', element: <JobResultDetailPage /> },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

import { Outlet } from 'react-router-dom';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
