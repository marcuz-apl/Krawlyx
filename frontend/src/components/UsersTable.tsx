import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, ShieldOff, User as UserIcon, Crown, KeyRound, Trash2, UserPlus, AlertCircle } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { api, type UserOut } from '@/lib/api/client';
import { useMe } from '@/hooks/useAuth';

export function UsersTable() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.users.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const [mfaErr, setMfaErr] = useState<string | null>(null);
  const enforceMfa = useMutation({
    mutationFn: ({ id, required }: { id: number; required: boolean }) =>
      api.users.patch(id, { mfa_required: required }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: any) =>
      setMfaErr(e.response?.data?.detail || e.message || 'Could not update the MFA requirement'),
  });

  const [creating, setCreating] = useState(false);
  const [pwFor, setPwFor] = useState<UserOut | null>(null);
  const [roleEditFor, setRoleEditFor] = useState<UserOut | null>(null);
  const [resetMfaFor, setResetMfaFor] = useState<UserOut | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserOut | null>(null);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading users…</p>;
  const users: UserOut[] = data ?? [];

  const isSuperAdmin = me?.role === 'superadmin' || me?.username === 'admin';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {users.length} Registered Account{users.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isSuperAdmin ? 'SuperAdmin access: You can manage all user roles and permissions.' : 'Admin access: You can manage standard runner accounts.'}
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {creating ? 'Cancel' : 'New User'}
        </button>
      </div>

      {mfaErr && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-2.5 text-xs text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{mfaErr}</span>
        </div>
      )}

      {creating && (
        <CreateUserForm
          isSuperAdmin={isSuperAdmin}
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}
      {pwFor && (
        <ChangePasswordForm
          user={pwFor}
          onDone={() => {
            setPwFor(null);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}
      {resetMfaFor && (
        <ResetMfaForm
          user={resetMfaFor}
          onDone={() => {
            setResetMfaFor(null);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}
      {roleEditFor && (
        <ChangeRoleForm
          user={roleEditFor}
          isSuperAdmin={isSuperAdmin}
          onDone={() => {
            setRoleEditFor(null);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-950 uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Access Tier / Role</th>
              <th className="px-4 py-3">MFA</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const isTargetSuper = u.role === 'superadmin' || u.username === 'admin';
              const canModify = isSuperAdmin || !isTargetSuper;

              return (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    {isTargetSuper ? (
                      <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : u.role === 'admin' ? (
                      <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span>{u.username}</span>
                    {u.username === me?.username && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                        (You)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    {u.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isTargetSuper ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <Crown className="w-3 h-3" />
                        SuperAdmin
                      </span>
                    ) : u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                        <ShieldCheck className="w-3 h-3" />
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <UserIcon className="w-3 h-3" />
                        Runner
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.mfa_enabled ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <ShieldCheck className="w-3 h-3" />
                        MFA enabled
                      </span>
                    ) : u.mfa_required ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <ShieldAlert className="w-3 h-3" />
                        Enrollment pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <ShieldOff className="w-3 h-3" />
                        MFA off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {canModify && (
                        <>
                          {u.mfa_enabled && u.id !== me?.id && (
                            <button
                              onClick={() => setResetMfaFor(u)}
                              className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                              title="Clear this user's enrolled authenticator (requires your password)"
                            >
                              Reset MFA
                            </button>
                          )}
                          {!u.mfa_enabled && (
                            <button
                              onClick={() => {
                                setMfaErr(null);
                                enforceMfa.mutate({ id: u.id, required: !u.mfa_required });
                              }}
                              disabled={enforceMfa.isPending && enforceMfa.variables?.id === u.id}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-60 ${
                                u.mfa_required
                                  ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                              title={
                                u.mfa_required
                                  ? 'Clear the MFA enrollment requirement for this user'
                                  : 'Require this user to set up authenticator-app MFA at next sign-in'
                              }
                            >
                              {enforceMfa.isPending && enforceMfa.variables?.id === u.id
                                ? 'Saving…'
                                : u.mfa_required
                                ? 'Clear Requirement'
                                : 'Enforce MFA'}
                            </button>
                          )}
                          <button
                            onClick={() => setRoleEditFor(u)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            title="Change User Access Role"
                          >
                            Change Role
                          </button>
                          <button
                            onClick={() => setPwFor(u)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1"
                          >
                            <KeyRound className="w-3 h-3 text-slate-400" />
                            Password
                          </button>
                          <button
                            onClick={() => setDeleteUser(u)}
                            className="rounded-lg border border-rose-200 dark:border-rose-900/60 px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={deleteUser !== null}
        title={`Delete User "${deleteUser?.username}"?`}
        message="Are you sure you want to permanently delete this user account? This action cannot be undone."
        confirmText="Delete User"
        cancelText="Cancel"
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (deleteUser) {
            remove.mutate(deleteUser.id);
            setDeleteUser(null);
          }
        }}
        onCancel={() => setDeleteUser(null)}
      />
    </div>
  );
}

function CreateUserForm({ isSuperAdmin, onDone }: { isSuperAdmin: boolean; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'runner' | 'admin' | 'superadmin'>('runner');
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; email: string; sent: boolean } | null>(
    null
  );

  const create = useMutation({
    mutationFn: () => api.users.create({ username, password, role, email: email.trim() }),
    onSuccess: (user) =>
      setCreated({
        username: user.username,
        email: user.email ?? email.trim(),
        sent: user.welcome_email_sent,
      }),
    onError: (e: any) => setErr(e.response?.data?.detail || e.message || 'Creation failed'),
  });

  if (created) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-4 shadow-sm">
        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
          Account created for "{created.username}" ({created.email})
        </p>
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {created.sent
            ? 'The username and password were emailed to the user.'
            : 'Welcome email was not sent — SMTP is not configured. Share the password with the user manually.'}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        create.mutate();
      }}
      className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Username</span>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. john_doe"
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. requester@example.com"
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Password (min 8 chars)</span>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            placeholder="••••••••"
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Role / Access Tier</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="runner">Runner (Standard crawl runner)</option>
            <option value="admin">Admin (Engines, exports, settings)</option>
            {isSuperAdmin && <option value="superadmin">SuperAdmin (Full SQLite DB browser & user admin)</option>}
          </select>
        </label>
      </div>

      {err && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create User'}
        </button>
      </div>
    </form>
  );
}

function ResetMfaForm({ user, onDone }: { user: UserOut; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => api.users.resetMfa(user.id, password),
    onSuccess: onDone,
    onError: (e: any) => setErr(e.response?.data?.detail || e.message || 'Reset failed'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        reset.mutate();
      }}
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20"
    >
      <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
        Reset MFA for: <span className="font-mono">{user.username}</span>
      </p>
      <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        This removes their authenticator. If MFA is required for the account, they will be asked to
        enroll again at the next sign-in.
      </p>
      <label className="block text-xs font-semibold">
        <span className="text-slate-700 dark:text-slate-300">Your admin password</span>
        <input
          required
          autoFocus
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </label>

      {err && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={reset.isPending}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-500 shadow-md shadow-amber-600/20 disabled:opacity-50"
        >
          {reset.isPending ? 'Resetting…' : 'Reset MFA'}
        </button>
      </div>
    </form>
  );
}

function ChangeRoleForm({
  user,
  isSuperAdmin,
  onDone,
}: {
  user: UserOut;
  isSuperAdmin: boolean;
  onDone: () => void;
}) {
  const [role, setRole] = useState<'runner' | 'admin' | 'superadmin'>(user.role as any || 'runner');
  const [err, setErr] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: () => api.users.patch(user.id, { role }),
    onSuccess: onDone,
    onError: (e: any) => setErr(e.response?.data?.detail || e.message || 'Update failed'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        patch.mutate();
      }}
      className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 shadow-sm"
    >
      <p className="text-xs font-bold text-slate-900 dark:text-white">
        Change Access Role for: <span className="font-mono text-indigo-600 dark:text-indigo-400">{user.username}</span>
      </p>
      <label className="block text-xs font-semibold">
        <span className="text-slate-700 dark:text-slate-300">Select Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="runner">Runner (Standard crawl runner)</option>
          <option value="admin">Admin (Engines, exports, settings)</option>
          {isSuperAdmin && <option value="superadmin">SuperAdmin (Full SQLite DB browser & user admin)</option>}
        </select>
      </label>

      {err && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={patch.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {patch.isPending ? 'Updating…' : 'Update Role'}
        </button>
      </div>
    </form>
  );
}

function ChangePasswordForm({
  user,
  onDone,
}: {
  user: UserOut;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: () => api.users.patch(user.id, { password }),
    onSuccess: onDone,
    onError: (e: any) => setErr(e.response?.data?.detail || e.message || 'Password update failed'),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        patch.mutate();
      }}
      className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 shadow-sm"
    >
      <p className="text-xs font-bold text-slate-900 dark:text-white">
        Change Password for: <span className="font-mono text-indigo-600 dark:text-indigo-400">{user.username}</span>
      </p>
      <label className="block text-xs font-semibold">
        <span className="text-slate-700 dark:text-slate-300">New Password (min 8 chars)</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </label>

      {err && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={patch.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {patch.isPending ? 'Saving…' : 'Save New Password'}
        </button>
      </div>
    </form>
  );
}
