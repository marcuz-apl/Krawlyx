import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type UserOut } from '@/lib/api/client';

export function UsersTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.users.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const [creating, setCreating] = useState(false);
  const [pwFor, setPwFor] = useState<UserOut | null>(null);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  const users: UserOut[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {users.length} user{users.length === 1 ? '' : 's'}.
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {creating ? 'Cancel' : 'New user'}
        </button>
      </div>

      {creating && (
        <CreateUserForm
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

      <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 w-1/3">Username</th>
              <th className="px-3 py-2 w-1/3">Role</th>
              <th className="px-3 py-2 w-1/3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">
                  No users.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-3 py-2 w-1/3 font-medium text-slate-900 dark:text-white">{u.username}</td>
                <td className="px-3 py-2 w-1/3 text-slate-600 dark:text-slate-300">{u.role}</td>
                <td className="px-3 py-2 w-1/3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setPwFor(u)}
                      className="rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Change password
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete user ${u.username}?`)) remove.mutate(u.id);
                      }}
                      className="rounded border border-red-300 dark:border-red-800 px-2 py-0.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'runner' | 'admin'>('runner');
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.users.create({ username, password, role }),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        create.mutate();
      }}
      className="space-y-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4"
    >
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">Username</span>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">Password (min 8)</span>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'runner' | 'admin')}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
          >
            <option value="runner">runner</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create'}
      </button>
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
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        patch.mutate();
      }}
      className="space-y-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4"
    >
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Change password for {user.username}
      </p>
      <label className="block text-sm">
        <span className="text-slate-700 dark:text-slate-300">New password (min 8)</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
        />
      </label>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={patch.isPending}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {patch.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
