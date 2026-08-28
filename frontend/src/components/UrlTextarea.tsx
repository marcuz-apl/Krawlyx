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
        placeholder={'https://example.com\nhttps://news.example.org/posts'}
        className="block w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
      />
      {errors && errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-600">
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
