import { useState, useMemo } from 'react';
import { ExternalLink, ChevronLeft, ChevronRight, Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

interface Props {
  items: Array<Record<string, any>>;
  totalTargets?: number;
}

export function StructuredDatasetTable({ items, totalTargets }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 dark:text-slate-400">
        No structured records found in this dataset.
      </div>
    );
  }

  // Detect schemas
  const firstItem = items[0] || {};
  const isVehicle = 'make' in firstItem || 'model' in firstItem || 'mileage' in firstItem || 'mileage_km' in firstItem;
  const isCustom = !isVehicle && !('name' in firstItem && 'price' in firstItem);

  // Dynamic columns for custom schema
  const customColumns = useMemo(() => {
    if (!isCustom) return [];
    const keys = new Set<string>();
    for (const it of items.slice(0, 100)) {
      for (const k of Object.keys(it)) {
        if (k !== 'type' && k !== 'date_observed' && k !== 'source_url' && k !== 'listing_url') {
          keys.add(k);
        }
      }
    }
    return Array.from(keys);
  }, [items, isCustom]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase().trim();
    return items.filter((it) =>
      Object.values(it).some((val) =>
        val != null && String(val).toLowerCase().includes(term)
      )
    );
  }, [items, searchTerm]);

  // Sort items
  const sortedItems = useMemo(() => {
    if (!sortField) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [filteredItems, sortField, sortAsc]);

  const totalRows = sortedItems.length;
  const effectivePageSize = pageSize === 0 ? totalRows : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / (effectivePageSize || 1)));
  const activePage = Math.min(currentPage, totalPages);

  const startIndex = (activePage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalRows);
  const currentRows = sortedItems.slice(startIndex, endIndex);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search & Grid Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={`Search ${items.length.toLocaleString()} records…`}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Rows per view:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={250}>250 rows</option>
              <option value={0}>All ({items.length})</option>
            </select>
          </div>

          <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
            Showing <strong className="text-slate-900 dark:text-white font-bold">{totalRows === 0 ? 0 : startIndex + 1}–{endIndex}</strong> of <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{totalRows.toLocaleString()}</strong> records
          </div>
        </div>
      </div>

      {/* Structured Table Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto max-h-[680px]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 uppercase tracking-wider text-[11px]">
              {isVehicle ? (
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th
                    onClick={() => handleSort('year')}
                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Year <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort('make')}
                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Make / Model <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </span>
                  </th>
                  <th className="px-3 py-3">Trim</th>
                  <th className="px-3 py-3">Drivetrain</th>
                  <th
                    onClick={() => handleSort('mileage_km')}
                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      Mileage <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort('price')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Price <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </span>
                  </th>
                  <th className="px-3 py-3">Seller</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Observed</th>
                  <th className="px-3 py-3 text-right">Link</th>
                </tr>
              ) : isCustom ? (
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  {customColumns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1 capitalize">
                        {col.replace(/_/g, ' ')} <ArrowUpDown className="h-3 w-3 opacity-60" />
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-3">Observed</th>
                  <th className="px-3 py-3 text-right">Link</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-3 py-3">Product Name</th>
                  <th className="px-3 py-3">Brand</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3">Observed</th>
                  <th className="px-3 py-3 text-right">Link</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {currentRows.map((row, idx) => {
                const globalIndex = startIndex + idx + 1;
                return (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">
                      {globalIndex}
                    </td>

                    {isVehicle ? (
                      <>
                        <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white font-mono">
                          {row.year || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {row.make || ''} {row.model || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                          {row.trim || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                            {row.drivetrain || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700 dark:text-slate-300 font-medium">
                          {row.mileage != null
                            ? String(row.mileage)
                            : row.mileage_km != null
                            ? String(row.mileage_km)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                          {typeof row.price === 'number'
                            ? `$${row.price.toLocaleString()}`
                            : row.price || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              row.seller_type === 'Dealer'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            }`}
                          >
                            {row.seller_type || '—'}
                          </span>
                          {row.dealer_name && (
                            <span className="block text-[10px] text-slate-400 truncate max-w-[120px]" title={row.dealer_name}>
                              {row.dealer_name}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {row.city || '—'} {row.province ? `, ${row.province}` : ''}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{row.date_observed || '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {row.listing_url || row.source_url ? (
                            <a
                              href={row.listing_url || row.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    ) : isCustom ? (
                      <>
                        {customColumns.map((col) => {
                          const val = row[col];
                          const isLink = typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
                          return (
                            <td key={col} className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
                              {isLink ? (
                                <a
                                  href={val}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 font-medium"
                                >
                                  Link <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              ) : (
                                String(val ?? '—')
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 font-mono text-slate-400 text-[11px]">{row.date_observed || '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {row.source_url ? (
                            <a
                              href={row.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                            >
                              Page <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{row.name || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.brand || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          {row.price ? `${row.currency || '$'}${row.price}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{row.date_observed || '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Unified Dataset Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 gap-3">
            <div>
              Showing rows <span className="font-bold text-slate-900 dark:text-white">{startIndex + 1}</span> to <span className="font-bold text-slate-900 dark:text-white">{endIndex}</span> of <span className="font-bold text-indigo-600 dark:text-indigo-400">{totalRows.toLocaleString()}</span> total records
              {totalTargets && (
                <span className="text-slate-400 ml-1">
                  (across {totalTargets} source web pages)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={activePage <= 1}
                className="rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 font-medium"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={activePage <= 1}
                className="inline-flex items-center rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 font-medium"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
              </button>
              <span className="px-3 font-bold text-slate-800 dark:text-slate-200">
                Page {activePage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={activePage >= totalPages}
                className="inline-flex items-center rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 font-medium"
              >
                Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={activePage >= totalPages}
                className="rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 font-medium"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
