import { ExternalLink } from 'lucide-react';

interface Props {
  items: Array<Record<string, any>>;
}

export function StructuredDatasetTable({ items }: Props) {
  if (!items || items.length === 0) return null;

  const isVehicle = items.some((i) => i.type === 'vehicle_listing' || (i.make && i.year));
  const isCustom = items.some((i) => i.type === 'custom_schema');

  // For custom schema, extract all user-defined column names (excluding internal keys)
  const customColumns = isCustom
    ? Array.from(
        new Set(
          items.flatMap((it) =>
            Object.keys(it).filter(
              (k) => !['type', 'date_observed', 'source_url', 'listing_url', '_job_id'].includes(k)
            )
          )
        )
      )
    : [];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            {isVehicle
              ? '🚗 Extracted Vehicle Dataset'
              : isCustom
              ? '⚙️ Custom Schema Dataset'
              : '📊 Extracted Structured Records'}
          </h3>
          <p className="text-xs text-slate-500">{items.length} structured rows extracted</p>
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
            {items.map((row, idx) => (
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
    </div>
  );
}
