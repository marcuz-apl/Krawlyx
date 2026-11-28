import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter, RouterProvider } from "react-router-dom";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RequireAuth } from "@/components/RequireAuth";
import { SecurityGate } from "@/components/SecurityGate";
import { useMe } from "@/hooks/useAuth";
import { AdminPanelPage } from "@/pages/AdminPanelPage";
import { DatasetDetailPage } from "@/pages/DatasetDetailPage";
import { DatasetsPage } from "@/pages/DatasetsPage";
import { ExportedFilesPage } from "@/pages/ExportedFilesPage";
import { JobHistoryPage } from "@/pages/JobHistoryPage";
import { JobProgressPage } from "@/pages/JobProgressPage";
import { JobResultDetailPage } from "@/pages/JobResultDetailPage";
import { JobResultsPage } from "@/pages/JobResultsPage";
import { LoginPage } from "@/pages/LoginPage";
import { ContactPage } from "@/pages/ContactPage";
import { MergedResultsPage } from "@/pages/MergedResultsPage";
import { RunnerPage } from "@/pages/RunnerPage";
import { SchedulesPage } from "@/pages/SchedulesPage";

function RootLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-150">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children ?? <Outlet />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function RootRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <p className="p-6 text-slate-500">Loading…</p>;
  if (!user) return <LoginPage />;
  return (
    <SecurityGate user={user}>
      <RootLayout>
        <RunnerPage />
      </RootLayout>
    </SecurityGate>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <RootRoute /> },
  { path: "/login", element: <Navigate to="/" replace /> },
  { path: "/contact", element: <ContactPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RootLayout />,
        children: [
          { path: "/history", element: <JobHistoryPage /> },
          { path: "/datasets", element: <DatasetsPage /> },
          { path: "/datasets/:id", element: <DatasetDetailPage /> },
          { path: "/exports", element: <ExportedFilesPage /> },
          { path: "/jobs/merge", element: <MergedResultsPage /> },
          { path: "/schedules", element: <SchedulesPage /> },
          { path: "/admin", element: <AdminPanelPage /> },
          { path: "/jobs/:id", element: <JobProgressPage /> },
          { path: "/jobs/:id/results", element: <JobResultsPage /> },
          { path: "/jobs/:id/results/:rid", element: <JobResultDetailPage /> },
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
