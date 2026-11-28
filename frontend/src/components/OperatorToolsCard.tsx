import { Terminal } from 'lucide-react';

const COMMANDS = [
  {
    label: 'Reset a password (restores SuperAdmin for “admin”)',
    command: 'cd backend\npython ./scripts/reset_admin_password.py --username admin',
  },
  {
    label: 'Clear MFA for one account (lost device / lockout)',
    command: 'cd backend\npython ./scripts/reset_mfa.py --username <name>',
  },
];

export function OperatorToolsCard() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Terminal className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Operator scripts (server console)
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            One-off recovery commands for the host. Activate the backend virtual environment first
            (<code className="font-mono">source .venv/bin/activate</code>); the scripts also switch
            to <code className="font-mono">backend/.venv</code> automatically when it exists. These
            are deliberate operator actions, not persistent settings.
          </p>
          <ul className="mt-3 space-y-2.5">
            {COMMANDS.map(({ label, command }) => (
              <li key={command}>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</p>
                <code className="mt-1 block select-all whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {command}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}