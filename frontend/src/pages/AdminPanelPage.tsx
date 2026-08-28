import { useState } from 'react';

import { ExportTargetsTable } from '@/components/ExportTargetsTable';

type Tab = 'engines' | 'exports' | 'settings' | 'users';

export function AdminPanelPage() {
  const [tab, setTab] = useState<Tab>('exports');
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Admin panel</h1>
      <nav className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ['exports', 'Export targets'],
            ['engines', 'Engines'],
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
      {tab === 'exports' && <ExportTargetsTable />}
      {tab === 'engines' && (
        <p className="text-slate-600">
          Engine CRUD lives in the API. A richer UI ships in M5.
        </p>
      )}
      {tab === 'settings' && (
        <p className="text-slate-600">
          Global settings (rate limits, robots toggle, SSRF guard) are
          scheduled for M5.
        </p>
      )}
      {tab === 'users' && (
        <p className="text-slate-600">User management is scheduled for M5.</p>
      )}
    </div>
  );
}
