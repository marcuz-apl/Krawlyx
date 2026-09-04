import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FolderDown,
  Download,
  Trash2,
  Search,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  HardDrive,
  Clock,
  Layers,
} from 'lucide-react';

import { api } from '@/lib/api/client';
import { useMe } from '@/hooks/useAuth';
import { ConfirmModal } from '@/components/ConfirmModal';

export function ExportedFilesPage() {
  const qc = useQueryClient();
  const me = useMe();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: files = [], isLoading, isFetching } = useQuery({
    queryKey: ['exported-files'],
    queryFn: () => api.exports.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => api.exports.delete(filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exported-files'] });
      setDeleteTarget(null);
    },
  });

  const filtered = files.filter((f) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      f.filename.toLowerCase().includes(term) ||
      (f.job_id && f.job_id.toString().includes(term)) ||
      f.format.toLowerCase().includes(term)
    );
  });

  const totalBytes = files.reduce((acc, f) => acc + f.size_bytes, 0);
  const totalHuman = (totalBytes / (1024 * 1024)).toFixed(1) + ' MB';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FolderDown className="w-5 h-5" />
            </div>
            <span>Exported Files</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Completed crawl CSV & XLSX files stored on the server from manual and overnight scheduled runs. Download straight to your computer anytime.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['exported-files'] })}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">{files.length}</div>
            <div className="text-xs text-slate-500">Available Export Files</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">{totalHuman}</div>
            <div className="text-xs text-slate-500">Total Storage Used</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
              {files[0] ? new Date(files[0].modified_at).toLocaleString() : 'No exports yet'}
            </div>
            <div className="text-xs text-slate-500">Latest Export Created</div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by filename, job ID, or format…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
        <div className="text-xs text-slate-500">
          Showing {filtered.length} of {files.length} file(s)
        </div>
      </div>

      {/* Files Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500 animate-pulse">
            Loading exported files from server…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                <FolderDown className="w-6 h-6" />
              </div>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'No files match your search filter' : 'No exported files saved on server yet'}
            </div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When a crawl runs with a folder export target (e.g. <code>Server Exports</code>), completed CSV/XLSX parts are saved here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Filename</th>
                  <th className="px-4 py-3.5">Format</th>
                  <th className="px-4 py-3.5">Size</th>
                  <th className="px-4 py-3.5">Extracted Rows</th>
                  <th className="px-4 py-3.5">Saved At</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((f) => (
                  <tr
                    key={f.filename}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2.5">
                        {f.format === 'csv' ? (
                          <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        <span className="font-mono text-xs">{f.filename}</span>
                        {f.job_id && (
                          <Link
                            to={`/jobs/${f.job_id}/results`}
                            className="rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900/60 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition"
                            title={`View Job #${f.job_id} Results`}
                          >
                            Job #{f.job_id}
                          </Link>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex uppercase font-bold text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {f.format}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {f.size_human}
                    </td>

                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {f.row_count !== null && f.row_count !== undefined ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {f.row_count.toLocaleString()} rows
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(f.modified_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={api.exports.downloadUrl(f.filename)}
                          download={f.filename}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition cursor-pointer"
                          title="Download file to this computer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>

                        {(me.data?.role === 'admin' || me.data?.role === 'superadmin') && (
                          <button
                            onClick={() => setDeleteTarget(f.filename)}
                            className="rounded-xl p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                            title="Delete file from server"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={`Delete "${deleteTarget}"?`}
        message="Are you sure you want to delete this export file from the server? This action permanently frees disk space on the server."
        confirmText="Delete File"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
