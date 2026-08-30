interface Props {
  value: string;
  onChange: (value: string) => void;
  errors?: Array<{ line: number; reason: string }>;
}

export function UrlTextarea({ value, onChange, errors }: Props) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder={"https://example.com\nhttps://news.example.org/posts"}
        className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-brand-400 transition"
      />
      {errors && errors.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {errors.map((e, i) => (
            <li key={i}>
              Line {e.line}: {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
