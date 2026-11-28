import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { useLogin } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";

interface AccessDialogProps {
  dialog: RefObject<HTMLDialogElement | null>;
  isOpen: boolean;
  onClose: () => void;
}

interface LocationState {
  from?: { pathname: string; search?: string; hash?: string };
}

const ACCOUNT_ACCESS_SUBJECT = "Krawlyx account access";
const fieldClass = "mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700";
const submitClass = "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 disabled:opacity-60";
const linkClass = "inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-brand-300";

export function AccessDialog({ dialog, isOpen, onClose }: AccessDialogProps) {
  const [requestMode, setRequestMode] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const request = useMutation({ mutationFn: api.messages.submit });

  useEffect(() => {
    if (isOpen) firstInput.current?.focus();
  }, [isOpen, requestMode]);

  function resetForm() {
    form.current?.reset();
    login.reset();
    request.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);

    if (requestMode) {
      request.mutate({
        name: String(fields.get("name")).trim(),
        email: String(fields.get("email")).trim(),
        subject: ACCOUNT_ACCESS_SUBJECT,
        message: String(fields.get("reason")).trim(),
      });
      return;
    }

    login.mutate(
      { username: String(fields.get("username")).trim(), password: String(fields.get("password")) },
      {
        onSuccess: () => {
          const destination = (location.state as LocationState | null)?.from ?? "/";
          navigate(destination, { replace: true });
        },
      },
    );
  }

  const pending = requestMode ? request.isPending : login.isPending;
  const submitText = requestMode ? "Send request" : "Sign in";
  const pendingText = requestMode ? "Submitting…" : "Signing in…";
  const error = requestMode
    ? request.isError && "Your request could not be submitted. Please try again."
    : login.isError && "Invalid username or password. Please check your credentials.";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="access-dialog-title"
      aria-describedby="access-dialog-description"
      onClose={() => {
        resetForm();
        setRequestMode(false);
        onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/80 dark:bg-slate-900 dark:text-white"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h2 id="access-dialog-title" className="pt-2 text-2xl font-bold tracking-tight">
            {requestMode ? "Request access" : "Log in to Krawlyx"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <p id="access-dialog-description" className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {requestMode
            ? "Tell us how you plan to use Krawlyx. An administrator will review your request and contact you."
            : "Sign in to manage your crawls, datasets, and exports."}
        </p>

        {requestMode && request.isSuccess ? (
          <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Request submitted for administrator review.
          </p>
        ) : (
          <form key={String(requestMode)} ref={form} onSubmit={submit} className="mt-6 space-y-4 text-sm font-medium">
            {requestMode ? (
              <>
                <label className="block">
                  Name
                  <input ref={firstInput} name="name" autoComplete="name" required maxLength={120} className={fieldClass} />
                </label>
                <label className="block">
                  Email
                  <input name="email" type="email" autoComplete="email" required maxLength={200} className={fieldClass} />
                </label>
                <label className="block">
                  Why do you need access?
                  <textarea name="reason" required maxLength={5000} rows={3} className={fieldClass} />
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  Username
                  <input ref={firstInput} name="username" autoComplete="username" required className={fieldClass} />
                </label>
                <label className="block">
                  Password
                  <input name="password" type="password" autoComplete="current-password" required className={fieldClass} />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>
            )}
            <button type="submit" disabled={pending} className={submitClass}>
              {pending ? pendingText : submitText}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-2 border-t border-slate-200 pt-2 dark:border-slate-700">
          {!requestMode && <span className="text-sm text-slate-600 dark:text-slate-300">Need an account?</span>}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              resetForm();
              setRequestMode(!requestMode);
            }}
            className={linkClass}
          >
            {requestMode && <ArrowLeft aria-hidden="true" className="h-4 w-4" />}
            {requestMode ? "Back to sign in" : "Request access"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
