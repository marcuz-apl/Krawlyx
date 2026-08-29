import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppNav } from '@/components/AppNav';
import { RequireAuth } from '@/components/RequireAuth';
import { AdminPanelPage } from '@/pages/AdminPanelPage';
import { DatasetDetailPage } from '@/pages/DatasetDetailPage';
import { DatasetsPage } from '@/pages/DatasetsPage';
import { JobHistoryPage } from '@/pages/JobHistoryPage';
import { JobProgressPage } from '@/pages/JobProgressPage';
import { JobResultDetailPage } from '@/pages/JobResultDetailPage';
import { JobResultsPage } from '@/pages/JobResultsPage';
import { LoginPage } from '@/pages/LoginPage';
import { MergedResultsPage } from '@/pages/MergedResultsPage';
import { RunnerPage } from '@/pages/RunnerPage';
import { SchedulesPage } from '@/pages/SchedulesPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: (
          <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              <AppNav />
              <main>
                <Outlet />
              </main>
            </div>
          </div>
        ),
        children: [
          { path: '/', element: <RunnerPage /> },
          { path: '/history', element: <JobHistoryPage /> },
          { path: '/datasets', element: <DatasetsPage /> },
          { path: '/datasets/:id', element: <DatasetDetailPage /> },
          { path: '/jobs/merge', element: <MergedResultsPage /> },
          { path: '/schedules', element: <SchedulesPage /> },
          { path: '/admin', element: <AdminPanelPage /> },
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
