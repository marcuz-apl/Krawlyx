import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Server, FolderUp, Inbox, Settings as SettingsIcon, Users, type LucideIcon } from 'lucide-react';
import { useMe } from '@/hooks/useAuth';
import { AdminEnginesTable } from '@/components/AdminEnginesTable';
import { EmailTemplatesCard } from '@/components/EmailTemplatesCard';
import { ExportTargetsTable } from '@/components/ExportTargetsTable';
import { OperatorToolsCard } from '@/components/OperatorToolsCard';
import { SettingsReadOnlyCard } from '@/components/SettingsReadOnlyCard';
import { UsersTable } from '@/components/UsersTable';
import { DatabaseBrowser } from '@/components/DatabaseBrowser';
import { api } from '@/lib/api/client';

type Tab = 'engines' | 'exports' | 'settings' | 'users' | 'database' | 'access-requests';

const accessRequestKey = ['access-requests'] as const;

function formatRequestDate(timestamp: string): string {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp);
  return new Date(hasTimezone ? timestamp : `${timestamp}Z`).toLocaleString();
}

export function AdminPanelPage() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>('engines');
  const queryClient = useQueryClient();

  const isSuperAdmin = me?.role === 'superadmin' || me?.username === 'admin';
  const canReview = me?.role === 'superadmin';
  const accessRequests = useQuery({
    queryKey: accessRequestKey,
    queryFn: api.messages.accessRequests,
    enabled: canReview,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const review = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: number;
      status: 'pending' | 'granted' | 'rejected';
      note?: string;
    }) => api.messages.reviewAccessRequest(id, status, note),
    onSuccess: (data, variables) => {
      setNotifyResult((prev) => ({ ...prev, [variables.id]: data.requester_notified }));
      setNotes((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: accessRequestKey });
    },
  });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [notifyResult, setNotifyResult] = useState<Record<number, boolean>>({});
  const requests = accessRequests.data ?? [];
  const pending = requests.filter((request) => request.status === 'pending').length;

  const tabList: Array<{ key: Tab; label: string; icon: LucideIcon; superadminOnly?: boolean }> = [
    { key: 'engines', label: 'Engines', icon: Server },
    { key: 'exports', label: 'Export Targets', icon: FolderUp },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
    { key: 'users', label: 'Users', icon: Users },
    ...(canReview ? [{ key: 'access-requests' as const, label: 'Access Requests', icon: Inbox }] : []),
    ...(isSuperAdmin ? [{ key: 'database' as Tab, label: 'Database Browser', icon: Database, superadminOnly: true }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Panel</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage crawler engines, export pipelines, user accounts, and system configuration.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 pb-px">
        {tabList.map(({ key, label, icon: Icon, superadminOnly }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            aria-description={key === 'access-requests' ? `${pending} pending` : undefined}
            onClick={() => setTab(key)}
            className={`px-3.5 py-2 text-sm font-semibold transition-all flex items-center gap-2 ${
              tab === key
                ? "border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-t-lg shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-t-lg"
            }`}
          >
            <Icon className={`w-4 h-4 ${superadminOnly ? 'text-amber-500 dark:text-amber-400' : ''}`} />
            <span>{label}</span>
            {key === 'access-requests' && pending > 0 && (
              <span aria-hidden="true" className="rounded-full bg-indigo-100 px-2 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {pending}
              </span>
            )}
            {superadminOnly && (
              <span className="px-1.5 py-0.2 rounded text-[0.7rem] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                Super
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'engines' && <AdminEnginesTable />}
      {tab === 'exports' && <ExportTargetsTable />}
      {tab === 'settings' && (
        <div className="space-y-4">
          {isSuperAdmin && <OperatorToolsCard />}
          <SettingsReadOnlyCard />
        </div>
      )}
      {tab === 'users' && <UsersTable />}
      {tab === 'database' && isSuperAdmin && <DatabaseBrowser />}
      {tab === 'access-requests' && canReview && (
        <section aria-labelledby="access-requests-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="access-requests-heading" className="text-lg font-semibold">Access Requests</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Review each request and set its status: Access Granted, Request Rejected, or Request Pending.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('users')}
              className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Go to Users
            </button>
          </div>
          {accessRequests.isLoading && <p role="status">Loading access requests…</p>}
          {accessRequests.isError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">Could not load access requests.</p>
          )}
          {accessRequests.isSuccess && requests.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">No access requests yet.</p>
          )}
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {requests.map((request) => {
              const busy = review.isPending && review.variables?.id === request.id;
              const decide = (status: 'pending' | 'granted' | 'rejected') =>
                review.mutate({
                  id: request.id,
                  status,
                  note: notes[request.id]?.trim() || undefined,
                });
              const statusBadge =
                request.status === 'granted' ? (
                  <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Access Granted
                  </span>
                ) : request.status === 'rejected' ? (
                  <span className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    Request Rejected
                  </span>
                ) : (
                  <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Request Pending
                  </span>
                );
              return (
                <li key={request.id} className="py-4 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <h3 className="font-semibold">{request.name}</h3>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{request.email}</p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Submitted <time dateTime={request.created_at}>{formatRequestDate(request.created_at)}</time>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge}
                      {request.status !== 'granted' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => decide('granted')}
                          className="min-h-11 rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          {busy ? 'Saving…' : 'Grant Access'}
                        </button>
                      )}
                      {request.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => decide('rejected')}
                          className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          {busy ? 'Saving…' : 'Reject Request'}
                        </button>
                      )}
                      {request.status !== 'pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => decide('pending')}
                          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {busy ? 'Saving…' : 'Reset to Pending'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{request.message}</p>
                  <label className="mt-3 block text-xs font-semibold">
                    <span className="text-slate-600 dark:text-slate-400">
                      Note to requester (optional, included in the status email)
                    </span>
                    <textarea
                      rows={2}
                      value={notes[request.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
                      placeholder="e.g. Could you tell us more about the dataset you need access for?"
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </label>
                  {notifyResult[request.id] !== undefined && !review.isPending && (
                    <p
                      className={`mt-2 text-xs ${
                        notifyResult[request.id]
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {notifyResult[request.id]
                        ? 'Requester notified by email.'
                        : 'Status saved, but the requester was not emailed (check SMTP settings).'}
                    </p>
                  )}
                  {review.isError && review.variables?.id === request.id && (
                    <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">Could not update the request status. Please try again.</p>
                  )}
                </li>
              );
            })}
          </ul>

          <details className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Email templates — acknowledgement, decisions, admin notice, welcome
            </summary>
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <EmailTemplatesCard />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
