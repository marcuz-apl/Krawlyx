import { useState } from 'react';
import { Database, Server, FolderUp, Settings as SettingsIcon, Users } from 'lucide-react';
import { useMe } from '@/hooks/useAuth';
import { AdminEnginesTable } from '@/components/AdminEnginesTable';
import { ExportTargetsTable } from '@/components/ExportTargetsTable';
import { SettingsReadOnlyCard } from '@/components/SettingsReadOnlyCard';
import { UsersTable } from '@/components/UsersTable';
import { DatabaseBrowser } from '@/components/DatabaseBrowser';

type Tab = 'engines' | 'exports' | 'settings' | 'users' | 'database';

export function AdminPanelPage() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>('engines');

  const isSuperAdmin = me?.role === 'superadmin' || me?.username === 'admin';

  const tabList: Array<{ key: Tab; label: string; icon: any; superadminOnly?: boolean }> = [
    { key: 'engines', label: 'Engines', icon: Server },
    { key: 'exports', label: 'Export Targets', icon: FolderUp },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
    { key: 'users', label: 'Users', icon: Users },
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
            onClick={() => setTab(key)}
            className={`px-3.5 py-2 text-sm font-semibold transition-all flex items-center gap-2 ${
              tab === key
                ? "border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-t-lg shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-t-lg"
            }`}
          >
            <Icon className={`w-4 h-4 ${superadminOnly ? 'text-amber-500 dark:text-amber-400' : ''}`} />
            <span>{label}</span>
            {superadminOnly && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                Super
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'engines' && <AdminEnginesTable />}
      {tab === 'exports' && <ExportTargetsTable />}
      {tab === 'settings' && <SettingsReadOnlyCard />}
      {tab === 'users' && <UsersTable />}
      {tab === 'database' && isSuperAdmin && <DatabaseBrowser />}
    </div>
  );
}
