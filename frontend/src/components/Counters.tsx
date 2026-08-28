import type { JobCounts } from '@/lib/api/client';

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

interface Props {
  counts: JobCounts;
  status: string;
  elapsedS: number;
}

export function Counters({ counts, status, elapsedS }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
        {status}
      </span>
      <span className="text-slate-700">
        <strong className="text-emerald-700">{counts.done}</strong> done
      </span>
      <span className="text-slate-700">
        <strong className="text-amber-700">{counts.fetching}</strong> running
      </span>
      <span className="text-slate-700">
        <strong className="text-slate-500">{counts.pending}</strong> pending
      </span>
      {counts.error > 0 && (
        <span className="text-slate-700">
          <strong className="text-red-700">{counts.error}</strong> errors
        </span>
      )}
      {counts.skipped > 0 && (
        <span className="text-slate-700">
          <strong className="text-slate-500">{counts.skipped}</strong> skipped
        </span>
      )}
      <span className="ml-auto font-mono text-slate-500">
        elapsed {fmtElapsed(elapsedS)}
      </span>
    </div>
  );
}
