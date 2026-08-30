import { useState } from 'react';

import { AdminEnginesTable } from '@/components/AdminEnginesTable';
import { ExportTargetsTable } from '@/components/ExportTargetsTable';
import { SettingsReadOnlyCard } from '@/components/SettingsReadOnlyCard';
import { UsersTable } from '@/components/UsersTable';

type Tab = 'engines' | 'exports' | 'settings' | 'users';

export function AdminPanelPage() {
  const [tab, setTab] = useState<Tab>('engines');
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold tracking-tight text-slate-900 dark:text-white">Admin panel</h1>
      <nav className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(
          [
            ['engines', 'Engines'],
            ['exports', 'Export targets'],
            ['settings', 'Settings'],
            ['users', 'Users'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-2 text-sm font-semibold transition-all ${
              tab === key
                ? "border-b-2 border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-300 bg-brand-50/50 dark:bg-brand-950/30 rounded-t-lg"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-t-lg"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'engines' && <AdminEnginesTable />}
      {tab === 'exports' && <ExportTargetsTable />}
      {tab === 'settings' && <SettingsReadOnlyCard />}
      {tab === 'users' && <UsersTable />}
    </div>
  );
}
