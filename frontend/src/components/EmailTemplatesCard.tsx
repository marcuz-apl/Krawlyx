import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

import { api, type EmailTemplate, type EmailTemplatesOut } from '@/lib/api/client';

const META: Record<string, { title: string; hint: string }> = {
  access_received: {
    title: 'Access request — acknowledgement',
    hint: 'Sent when a request is submitted. Placeholders: {name}, {request_id}',
  },
  access_granted: {
    title: 'Access request — granted',
    hint: 'Placeholders: {name}, {request_id}, {note_block}',
  },
  access_rejected: {
    title: 'Access request — declined',
    hint: 'Placeholders: {name}, {request_id}, {note_block}',
  },
  access_pending: {
    title: 'Access request — reopened as pending',
    hint: 'Sent when a decided request is set back to pending. Placeholders: {name}, {request_id}, {note_block}',
  },
  welcome: {
    title: 'New user — welcome credentials',
    hint: 'Sent when an admin creates an account. Placeholders: {username}, {password}, {email}',
  },
  new_request_admin: {
    title: 'Admin — new request notice',
    hint: 'Sent to the admin inbox. Placeholders: {request_id}, {name}, {email}, {message}',
  },
};

const QUERY_KEY = ['email-templates'] as const;

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none';

export function EmailTemplatesCard() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: api.settings.emailTemplates,
  });
  const [edited, setEdited] = useState<Record<string, EmailTemplate> | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const draft = edited ?? data?.templates ?? null;

  const save = useMutation({
    mutationFn: () => {
      const isDefaults = JSON.stringify(draft) === JSON.stringify(data?.defaults);
      return api.settings.saveEmailTemplates(isDefaults ? null : draft ?? {});
    },
    onSuccess: (res: EmailTemplatesOut) => {
      qc.setQueryData(QUERY_KEY, res);
      setEdited(null);
      setStatus({ ok: true, text: 'Templates saved. New emails use these immediately.' });
    },
    onError: (e: any) =>
      setStatus({ ok: false, text: e.response?.data?.detail || e.message || 'Save failed' }),
  });

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading templates…</p>;
  if (isError || !data || !draft) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        Could not load email templates.
      </p>
    );
  }

  const update = (key: string, patch: Partial<EmailTemplate>) =>
    setEdited((prev) => {
      const base = prev ?? data.templates;
      return {
        ...base,
        [key]: { ...(base[key] ?? { subject: '', body: '' }), ...patch },
      };
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Subject and body for every transactional email. Bodies support basic Markdown —
          **bold**, *italic*, `code`, &quot;- &quot; lists, [links](https://example.com) — and are sent
          as styled HTML with a plain-text fallback. The Krawlyx Team signature (email + web) is
          appended automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEdited(data.defaults);
              setStatus({ ok: true, text: 'Defaults loaded — click Save to apply them.' });
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore defaults
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setStatus(null);
              save.mutate();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save templates'}
          </button>
        </div>
      </div>

      {status && (
        <div
          role="status"
          className={`flex items-center gap-1.5 rounded-lg border p-2.5 text-xs ${
            status.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
          }`}
        >
          {status.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{status.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {Object.keys(draft).map((key) => {
          const meta = META[key] ?? { title: key, hint: '' };
          const template = draft[key];
          return (
            <fieldset
              key={key}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <legend className="px-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                {meta.title}
              </legend>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{meta.hint}</p>
              <label className="mt-2 block text-xs font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Subject</span>
                <input
                  value={template.subject}
                  maxLength={200}
                  onChange={(e) => update(key, { subject: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="mt-2 block text-xs font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Body</span>
                <textarea
                  rows={6}
                  value={template.body}
                  maxLength={5000}
                  onChange={(e) => update(key, { body: e.target.value })}
                  className={`${inputClass} font-mono leading-relaxed`}
                />
              </label>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}