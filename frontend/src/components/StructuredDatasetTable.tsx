import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles } from 'lucide-react';

interface Props {
  items: Array<Record<string, any>>;
}

export function StructuredDatasetTable({ items }: Props) {
  if (!items || items.length === 0) return null;

  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [dedupEnabled, setDedupEnabled] = useState<boolean>(false);

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

  // For custom schema, extract all user-defined column names (excluding internal keys)
  const customColumns = isCustom
    ? Array.from(
        new Set(
          activeItems.flatMap((it) =>
            Object.keys(it).filter(
              (k) => !['type', 'date_observed', 'source_url', 'listing_url', '_job_id'].includes(k)
            )
          )
        )
      )
    : [];

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

        <div className="flex items-center gap-3">
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
