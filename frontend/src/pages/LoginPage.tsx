import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLogin } from '@/hooks/useAuth';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    // Reset credentials on mount so previous user is never pre-filled
    setUsername('');
    setPassword('');
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          const state = (location.state as LocationState | null) ?? {};
          navigate(state.from?.pathname ?? '/', { replace: true });
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <form
        onSubmit={onSubmit}
        autoComplete="off"
        className="w-full max-w-sm bg-white shadow rounded-lg p-6 space-y-4"
      >
        <h1 className="text-2xl font-semibold text-slate-900">MyKrawl</h1>
        <p className="text-sm text-slate-500">Sign in to your account</p>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
            placeholder="Enter username"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Enter password"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
          />
        </label>

        {login.isError && (
          <p className="text-sm text-red-600">Invalid username or password.</p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-brand-600 text-white py-2 font-medium hover:bg-brand-700 disabled:opacity-60"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
