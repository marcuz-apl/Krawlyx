import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles, Wrench, Check } from 'lucide-react';
import { api } from '@/lib/api/client';

interface Props {
  items: Array<Record<string, any>>;
  onUpdateItems?: (updated: Array<Record<string, any>>) => void;
  datasetId?: number;
}

export function StructuredDatasetTable({ items: initialItems, onUpdateItems, datasetId }: Props) {
  const [localItems, setLocalItems] = useState<Array<Record<string, any>>>(initialItems || []);

  useEffect(() => {
    setLocalItems(initialItems || []);
  }, [initialItems]);

  const items = localItems;

  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [dedupEnabled, setDedupEnabled] = useState<boolean>(false);

  // Edit / Clean Modal state
  const [cleanModalOpen, setCleanModalOpen] = useState(false);
  const [cleanColumn, setCleanColumn] = useState<string>('mileage_km');
  const [cleanAction, setCleanAction] = useState<
    'clean_numeric' | 'replace' | 'uppercase' | 'titlecase' | 'lowercase' | 'trim'
  >('clean_numeric');
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [cleanSuccess, setCleanSuccess] = useState<string | null>(null);

  // Helper to extract clean numeric value
  const parseNum = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const str = String(val)
      .replace(/,/g, '')
      .replace(/\$/g, '')
      .replace(/km/gi, '')
      .replace(/cad/gi, '')
      .trim();
    const match = str.match(/\d+(\.\d+)?/);
    if (match) {
      return match[0].includes('.') ? parseFloat(match[0]) : parseInt(match[0], 10);
    }
    return null;
  };

  const applyCleanAction = async (
    targetCol: string,
    action: 'clean_numeric' | 'replace' | 'uppercase' | 'titlecase' | 'lowercase' | 'trim',
    fText = '',
    rText = ''
  ) => {
    let changed = 0;
    const updated = items.map((item) => {
      const copy = { ...item };
      const colsToProcess = targetCol === 'all' ? Object.keys(copy) : [targetCol];

      for (let col of colsToProcess) {
        if (!(col in copy)) {
          if (col === 'mileage_km' && 'mileage' in copy) {
            col = 'mileage';
          } else {
            continue;
          }
        }
        const val = copy[col];
        if (val === null || val === undefined) continue;

        if (action === 'clean_numeric') {
          const num = parseNum(val);
          if (num !== null && num !== val) {
            if (col === 'mileage' || col === 'mileage_km') {
              delete copy.mileage;
              copy.mileage_km = num;
            } else {
              copy[col] = num;
            }
            changed++;
          }
        } else if (action === 'replace') {
          const s = String(val);
          if (fText && s.includes(fText)) {
            const res = s.replaceAll(fText, rText);
            if (['mileage_km', 'mileage', 'price', 'year'].includes(col)) {
              const num = parseNum(res);
              copy[col] = num !== null ? num : res;
            } else {
              copy[col] = res;
            }
            changed++;
          }
        } else if (action === 'uppercase') {
          const s = String(val).trim().toUpperCase();
          if (s !== val) {
            copy[col] = s;
            changed++;
          }
        } else if (action === 'titlecase') {
          const s = String(val)
            .trim()
            .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
          if (s !== val) {
            copy[col] = s;
            changed++;
          }
        } else if (action === 'lowercase') {
          const s = String(val).trim().toLowerCase();
          if (s !== val) {
            copy[col] = s;
            changed++;
          }
        } else if (action === 'trim') {
          const s = String(val).trim();
          if (s !== val) {
            copy[col] = s;
            changed++;
          }
        }
      }
      return copy;
    });

    setLocalItems(updated);
    if (onUpdateItems) onUpdateItems(updated);

    // If viewing a permanent dataset, apply to server too
    if (datasetId) {
      try {
        await api.datasets.batchEdit(datasetId, {
          column: targetCol,
          action,
          find_text: fText,
          replace_text: rText,
        });
      } catch (err) {
        console.error('Failed to sync batch edit to database:', err);
      }
    }

    setCleanSuccess(`Updated ${changed} values successfully!`);
    setTimeout(() => setCleanSuccess(null), 4000);
  };

  // Compute unique items vs duplicates
  const { uniqueItems, duplicateCount } = useMemo(() => {
    const seen = new Set<string>();
    const uniques: Array<Record<string, any>> = [];
    let dups = 0;

    for (const item of items) {
      let key = '';
      if (item.make && item.year) {
        key = [
          item.year,
          item.make,
          item.model,
          item.trim,
          item.mileage_km ?? item.mileage,
          item.price,
          item.listing_url,
        ]
          .map((v) => String(v ?? '').trim().toLowerCase())
          .join('|');
      } else {
        key = Object.entries(item)
          .filter(([k]) => !['_job_id', 'source_url', 'date_observed'].includes(k))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${String(v ?? '').trim().toLowerCase()}`)
          .join('|');
      }

      if (seen.has(key)) {
        dups++;
      } else {
        seen.add(key);
        uniques.push(item);
      }
    }
    return { uniqueItems: uniques, duplicateCount: dups };
  }, [items]);

  const activeItems = dedupEnabled ? uniqueItems : items;

  const isVehicle = activeItems.some((i) => i.type === 'vehicle_listing' || (i.make && i.year));
  const isCustom = activeItems.some((i) => i.type === 'custom_schema');

  // Available column names for editing
  const availableColumns = Array.from(
    new Set(
      items.flatMap((it) =>
        Object.keys(it).filter(
          (k) => !['type', 'date_observed', 'source_url', 'listing_url', '_job_id'].includes(k)
        )
      )
    )
  );
  const customColumns = availableColumns;

  const totalRows = activeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const paginatedItems = activeItems.slice(startIndex, endIndex);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const toggleDedup = () => {
    setDedupEnabled((prev) => !prev);
    setCurrentPage(1);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Success Notification */}
      {cleanSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-600" />
            {cleanSuccess}
          </span>
          <button onClick={() => setCleanSuccess(null)} className="text-emerald-600 hover:text-emerald-900">
            ✕
          </button>
        </div>
      )}

      {/* Batch Cleaning & Editing Modal / Panel */}
      {cleanModalOpen && (
        <div className="border-b border-indigo-100 bg-indigo-50/50 p-4 text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
            <h4 className="font-bold text-indigo-900 flex items-center gap-1.5 text-sm">
              <Wrench className="h-4 w-4 text-indigo-600" />
              Batch Data Cleaning & Editor
            </h4>
            <button
              onClick={() => setCleanModalOpen(false)}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200"
            >
              ✕ Close
            </button>
          </div>

          {/* Quick 1-Click Cleaners */}
          <div>
            <span className="font-semibold text-slate-700 block mb-1.5">⚡ 1-Click Quick Cleaners:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyCleanAction('mileage_km', 'clean_numeric')}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
                title="Strips 'km', spaces, and converts to pure integer"
              >
                🔢 Clean Mileage (' km' → Pure Number)
              </button>
              <button
                type="button"
                onClick={() => applyCleanAction('price', 'clean_numeric')}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
                title="Strips '$', 'CAD', commas and converts to pure number"
              >
                💵 Clean Price ('$' → Pure Number)
              </button>
              <button
                type="button"
                onClick={() => applyCleanAction('drivetrain', 'uppercase')}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
              >
                🚘 Standardize Drivetrain (UPPERCASE)
              </button>
              <button
                type="button"
                onClick={() => applyCleanAction('trim', 'titlecase')}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
              >
                ✨ Title Case Trim (e.g. GT Plus)
              </button>
            </div>
          </div>

          {/* Custom Find & Replace */}
          <div className="border-t border-indigo-100 pt-3">
            <span className="font-semibold text-slate-700 block mb-1.5">🔍 Custom Find & Replace / Transform:</span>
            <div className="grid gap-2 sm:grid-cols-4 items-end">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Target Column:</label>
                <select
                  value={cleanColumn}
                  onChange={(e) => setCleanColumn(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono"
                >
                  <option value="all">All Columns</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Action:</label>
                <select
                  value={cleanAction}
                  onChange={(e: any) => setCleanAction(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="clean_numeric">Convert to Pure Number</option>
                  <option value="replace">Find & Replace Text</option>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="titlecase">Title Case</option>
                  <option value="lowercase">lowercase</option>
                  <option value="trim">Trim Extra Spaces</option>
                </select>
              </div>

              {cleanAction === 'replace' ? (
                <>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Find Text:</label>
                    <input
                      type="text"
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      placeholder="e.g.  km or 4x4"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Replace With:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        placeholder="e.g. 4WD (or leave blank to remove)"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => applyCleanAction(cleanColumn, cleanAction, findText, replaceText)}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm flex-shrink-0"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => applyCleanAction(cleanColumn, cleanAction)}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm"
                  >
                    Apply Transformation to '{cleanColumn}' →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/75 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {isVehicle
                ? '🚗 Extracted Vehicle Dataset'
                : isCustom
                ? '⚙️ Custom Schema Dataset'
                : '📊 Extracted Structured Records'}
            </h3>
            {dedupEnabled && (
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                Deduplicated
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Showing {totalRows > 0 ? startIndex + 1 : 0}–{endIndex} of {totalRows} records
            {duplicateCount > 0 && !dedupEnabled && (
              <span className="text-amber-600 font-medium ml-1">
                ({duplicateCount} duplicates detected)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setCleanModalOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors ${
              cleanModalOpen
                ? 'border-indigo-400 bg-indigo-100 text-indigo-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title="Open batch cleaner and field editor"
          >
            <Wrench className="h-3.5 w-3.5 text-indigo-600" />
            {cleanModalOpen ? 'Hide Editor' : 'Clean / Edit Data'}
          </button>

          {duplicateCount > 0 && (
            <button
              onClick={toggleDedup}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors ${
                dedupEnabled
                  ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
              title={dedupEnabled ? 'Show full dataset including duplicates' : 'Hide duplicate records'}
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              {dedupEnabled ? `Show All (${items.length})` : `Remove ${duplicateCount} Duplicates`}
            </button>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={activePage <= 1}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium text-slate-700">
              {activePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={activePage >= totalPages}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-100/75 text-slate-600 font-semibold uppercase tracking-wider">
            <tr>
              {isVehicle ? (
                <>
                  <th className="px-3 py-2.5">Year</th>
                  <th className="px-3 py-2.5">Make</th>
                  <th className="px-3 py-2.5">Model</th>
                  <th className="px-3 py-2.5">Trim</th>
                  <th className="px-3 py-2.5">Drivetrain</th>
                  <th className="px-3 py-2.5">Mileage (km)</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5">Seller</th>
                  <th className="px-3 py-2.5">City / Prov</th>
                  <th className="px-3 py-2.5">Date Observed</th>
                  <th className="px-3 py-2.5 text-right">Link</th>
                </>
              ) : isCustom ? (
                <>
                  {customColumns.map((col) => (
                    <th key={col} className="px-3 py-2.5 font-semibold text-slate-700">
                      {col}
                    </th>
                  ))}
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-right">Source Link</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2.5">Name / Title</th>
                  <th className="px-3 py-2.5">Brand</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5">Date Observed</th>
                  <th className="px-3 py-2.5 text-right">Link</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedItems.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                {isVehicle ? (
                  <>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{row.year || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{row.make || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-brand-700">{row.model || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 truncate max-w-[180px]" title={row.trim}>
                      {row.trim || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                        {row.drivetrain || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 font-medium">
                      {row.mileage_km != null
                        ? `${Number(row.mileage_km).toLocaleString()} km`
                        : row.mileage || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                      {typeof row.price === 'number'
                        ? `$${row.price.toLocaleString()}`
                        : row.price || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          row.seller_type === 'Dealer'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
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
                    <td className="px-3 py-2.5 text-slate-600">
                      {row.city || '—'} {row.province ? `, ${row.province}` : ''}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{row.date_observed || '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {row.listing_url ? (
                        <a
                          href={row.listing_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-800 hover:underline"
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
                        <td key={col} className="px-3 py-2.5 text-slate-800">
                          {isLink ? (
                            <a
                              href={val}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              Link <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            val || '—'
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 font-mono text-slate-400">{row.date_observed || '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {row.source_url ? (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-800 hover:underline"
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
                    <td className="px-3 py-2.5 font-medium text-slate-900">{row.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{row.brand || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                      {row.price ? `${row.currency || '$'}${row.price}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{row.date_observed || '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-800 hover:underline"
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
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <div>
            Showing <span className="font-semibold">{startIndex + 1}</span> to <span className="font-semibold">{endIndex}</span> of <span className="font-semibold">{totalRows}</span> rows
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={activePage <= 1}
              className="rounded px-2 py-1 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={activePage <= 1}
              className="inline-flex items-center rounded px-2 py-1 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
            </button>
            <span className="px-2 font-semibold text-slate-800">
              Page {activePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={activePage >= totalPages}
              className="inline-flex items-center rounded px-2 py-1 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={activePage >= totalPages}
              className="rounded px-2 py-1 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
