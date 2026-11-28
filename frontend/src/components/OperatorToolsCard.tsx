import { Terminal } from 'lucide-react';

const OTHER_COMMANDS = [
  {
    label: 'Reset a password (prompts for the new one; restores SuperAdmin for “admin”)',
    command: 'cd backend\npython ./scripts/reset_admin_password.py --username admin',
  },
  {
    label: 'Clear MFA for any other account',
    command: 'cd backend\npython ./scripts/reset_mfa.py --username <name>',
  },
];

const commandClass =
  'mt-1 block select-all whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';

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

          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Admin lost the phone with the authenticator? (break-glass MFA reset)
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <li>
                On the host, run:
                <code className={commandClass}>cd backend{'\n'}python ./scripts/reset_mfa.py --username admin</code>
              </li>
              <li>
                The script prints <span className="font-mono">MFA cleared for 'admin'</span> — the
                account continues with password-only sign-in.
              </li>
              <li>
                Sign in with the admin username and password, then optionally re-enable the
                authenticator from the header shield icon.
              </li>
            </ol>
            <p className="mt-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              Locked out of both the phone and the password? Run the password reset below first — it
              prompts for a new password and re-asserts SuperAdmin.
            </p>
          </div>

          <ul className="mt-3 space-y-2.5">
            {OTHER_COMMANDS.map(({ label, command }) => (
              <li key={command}>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</p>
                <code className={commandClass}>{command}</code>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Running in Docker? Run the same scripts inside the container
            </p>
            <code className={commandClass}>
              docker compose exec krawlyx python ./scripts/reset_mfa.py --username admin
            </code>
            <code className={commandClass}>
              docker compose exec -it krawlyx python ./scripts/reset_admin_password.py --username admin
            </code>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              The database lives in the mounted <code className="font-mono">./data</code> volume, so
              nothing else is needed and the service does not have to be restarted.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}