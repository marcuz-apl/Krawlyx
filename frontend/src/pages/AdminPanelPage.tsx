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
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Admin panel</h1>
      <nav className="mb-4 flex gap-1 border-b border-slate-200">
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
            className={
              tab === key
                ? 'border-b-2 border-brand-600 px-3 py-2 text-sm font-medium text-brand-700'
                : 'px-3 py-2 text-sm text-slate-600 hover:text-slate-900'
            }
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
