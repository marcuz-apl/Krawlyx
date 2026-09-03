import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, Plus, Trash2, Calendar, Layers, Edit2, Sparkles, Search, CheckSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ConfirmModal } from '@/components/ConfirmModal';
import { api } from '@/lib/api/client';

export function DatasetsPage() {
  const qc = useQueryClient();
  const { data: datasets, isLoading, error } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => api.datasets.list(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Delete modal state
  const [datasetToDelete, setDatasetToDelete] = useState<{ id: number; name: string } | null>(null);

  // Edit / Rename state
  const [editingDataset, setEditingDataset] = useState<{ id: number; name: string; description: string } | null>(null);

  // Merge state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [mergeDescription, setMergeDescription] = useState('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered dataset list
  const filteredDatasets = (datasets || []).filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  });

  const selectAllFiltered = () => {
    const ids = filteredDatasets.map((d) => d.id);
    setSelectedIds(Array.from(new Set([...selectedIds, ...ids])));
  };

  const selectAllMakeDatasets = () => {
    // Detect datasets split by make (e.g. contains ' - Dodge', ' - Ford', etc. or description mentions split)
    const makeDatasetIds = (datasets || [])
      .filter((d) =>
        (d.name.includes(' - ') && !d.name.startsWith('Merged')) ||
        (d.description && d.description.toLowerCase().includes('split from dataset'))
      )
      .map((d) => d.id);
    setSelectedIds(makeDatasetIds);
  };

  const createMutation = useMutation({
    mutationFn: () => api.datasets.create({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
    },
  });

  const patchMutation = useMutation({
    mutationFn: () => {
      if (!editingDataset) return Promise.reject();
      return api.datasets.patch(editingDataset.id, {
        name: editingDataset.name,
        description: editingDataset.description,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setEditingDataset(null);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      api.datasets.merge({
        dataset_ids: selectedIds,
        name: mergeName,
        description: mergeDescription,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setMergeOpen(false);
      setSelectedIds([]);
      setMergeName('');
      setMergeDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.datasets.delete(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    },
  });

  const [dedupMsg, setDedupMsg] = useState<string | null>(null);

  const deduplicateMutation = useMutation({
    mutationFn: (id: number) => api.datasets.deduplicate(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setDedupMsg(
        res.removed_count > 0
          ? `Successfully removed ${res.removed_count} duplicate records! (${res.remaining_count} unique records remaining)`
          : `No duplicate records found in dataset.`
      );
      setTimeout(() => setDedupMsg(null), 5000);
    },
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 w-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Database className="h-6 w-6 text-brand-600" />
            Saved Datasets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Permanent database storage for your scraped and merged web datasets.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Empty Dataset
        </button>
      </div>

      {/* Deduplication Notification Alert */}
      {dedupMsg && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 p-4 text-xs font-semibold text-indigo-900 dark:text-indigo-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <span>{dedupMsg}</span>
          </div>
          <button
            onClick={() => setDedupMsg(null)}
            className="text-indigo-500 hover:text-indigo-800 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Selected Merge Banner */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 dark:border-brand-900/60 bg-brand-50 dark:bg-brand-950/40 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-900">
            <Layers className="h-4 w-4 text-brand-600" />
            <span>{selectedIds.length} dataset(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setMergeName(`Merged Dataset (${selectedIds.length} sets)`);
                setMergeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              Merge Selected Datasets ({selectedIds.length}) →
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-500 hover:underline px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Create Dataset Form */}
      {createOpen && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-900/60 bg-brand-50/50 dark:bg-brand-950/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Create New Dataset</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dataset Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Product Catalog Q3"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Extracted from public catalog search"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Save Dataset'}
            </button>
          </div>
        </div>
      )}

      {/* Edit / Rename Dataset Modal */}
      {editingDataset && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Edit2 className="h-4 w-4 text-amber-700" />
            Rename Dataset
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dataset Name *</label>
              <input
                type="text"
                value={editingDataset.name}
                onChange={(e) =>
                  setEditingDataset({ ...editingDataset, name: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <input
                type="text"
                value={editingDataset.description}
                onChange={(e) =>
                  setEditingDataset({ ...editingDataset, description: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditingDataset(null)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              onClick={() => patchMutation.mutate()}
              disabled={!editingDataset.name.trim() || patchMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {patchMutation.isPending ? 'Updating…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Merge Selected Datasets Modal */}
      {mergeOpen && (
        <div className="rounded-xl border border-brand-300 dark:border-brand-900/60 bg-brand-50/75 dark:bg-brand-950/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-brand-600" />
            Merge {selectedIds.length} Saved Datasets
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Merged Dataset Name *</label>
              <input
                type="text"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                placeholder="e.g. Master Consolidated Catalog (Merged)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={mergeDescription}
                onChange={(e) => setMergeDescription(e.target.value)}
                placeholder="Combined from multiple datasets"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMergeOpen(false)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              onClick={() => mergeMutation.mutate()}
              disabled={!mergeName.trim() || mergeMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {mergeMutation.isPending ? 'Merging…' : 'Create Merged Dataset'}
            </button>
          </div>
        </div>
      )}

      {/* Search & Batch Selection Bar */}
      {datasets && datasets.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search datasets by name or description..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-7 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAllMakeDatasets}
              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1.5 font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors shadow-sm"
              title="Select all partitioned sub-datasets"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Select Partitioned Subsets
            </button>
            <button
              type="button"
              onClick={selectAllFiltered}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
            >
              Select All Shown ({filteredDatasets.length})
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs text-rose-600 hover:underline px-2 py-1 font-semibold"
              >
                Deselect All
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-slate-500 animate-pulse">Loading datasets…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-xs text-red-700 dark:text-red-300">
          Failed to load datasets: {String(error)}
        </div>
      ) : !datasets || datasets.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
          <Database className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No saved datasets yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            You can save crawl results or multi-job merged tables directly into permanent database datasets from the Job Results page.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            Start a Crawl Job →
          </Link>
        </div>
      ) : filteredDatasets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
          No datasets match your search query "{searchQuery}".
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDatasets.map((d) => {
            const isSelected = selectedIds.includes(d.id);
            return (
              <div
                key={d.id}
                className={`flex flex-col justify-between rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-sm transition-all ${
                  isSelected ? 'border-brand-500 ring-2 ring-brand-100 dark:ring-brand-950 bg-brand-50/20 dark:bg-brand-950/30' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(d.id)}
                        className="rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-500"
                      />
                      <Link
                        to={`/datasets/${d.id}`}
                        className="font-semibold text-slate-900 dark:text-white hover:text-brand-600 hover:underline truncate"
                      >
                        {d.name}
                      </Link>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300 border border-brand-200/60 dark:border-brand-900/60 flex-shrink-0">
                      <Layers className="h-3 w-3" />
                      {d.row_count} rows
                    </span>
                  </div>
                  {d.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 pl-6">{d.description}</p>
                  )}
                  {d.columns && d.columns.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 pl-6">
                      {d.columns.slice(0, 5).map((col) => (
                        <span
                          key={col}
                          className="rounded border border-slate-200/80 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:text-slate-200"
                        >
                          {col}
                        </span>
                      ))}
                      {d.columns.length > 5 && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium">
                          +{d.columns.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Calendar className="h-3 w-3" />
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => deduplicateMutation.mutate(d.id)}
                      disabled={deduplicateMutation.isPending}
                      className="rounded-lg p-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                      title="Scan & remove duplicate records in this dataset"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        setEditingDataset({
                          id: d.id,
                          name: d.name,
                          description: d.description || '',
                        })
                      }
                      className="rounded-lg p-1.5 text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 hover:bg-slate-200/80 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="Rename / Edit dataset"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={api.datasets.exportCsvUrl(d.id)}
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors shadow-xs"
                      title="Export CSV"
                    >
                      <Download className="h-3 w-3" /> CSV
                    </a>
                    <button
                      onClick={() => setDatasetToDelete({ id: d.id, name: d.name })}
                      disabled={deleteMutation.isPending}
                      className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/60 border border-rose-200/60 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer"
                      title="Delete dataset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={datasetToDelete !== null}
        title={`Delete Dataset "${datasetToDelete?.name}"?`}
        message="This will permanently remove the dataset and its cached table rows from the database. This action cannot be undone."
        confirmText="Delete Dataset"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (datasetToDelete) {
            deleteMutation.mutate(datasetToDelete.id);
            setDatasetToDelete(null);
          }
        }}
        onCancel={() => setDatasetToDelete(null)}
      />
    </div>
  );
}
