import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code2,
  Download,
  ExternalLink,
  Filter,
  MapPin,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Terminal,
  X,
} from 'lucide-react';
import { api } from '@/lib/api/client';

interface Props {
  items: Array<Record<string, any>>;
  onUpdateItems?: (updated: Array<Record<string, any>>) => void;
  datasetId?: number;
}

// Helpers for multi-attribute parsing
function extractYear(it: Record<string, any>): string {
  if (it.year !== undefined && it.year !== null && String(it.year).trim() !== '') return String(it.year).trim();
  if (it.Year !== undefined && it.Year !== null && String(it.Year).trim() !== '') return String(it.Year).trim();
  const m = String(it.title || '').match(/\b(19\d\d|20\d\d)\b/);
  return m ? m[1] : '';
}

function extractMake(it: Record<string, any>): string {
  if (it.make !== undefined && it.make !== null && String(it.make).trim() !== '') return String(it.make).trim();
  if (it.Make !== undefined && it.Make !== null && String(it.Make).trim() !== '') return String(it.Make).trim();
  return '';
}

function extractModel(it: Record<string, any>): string {
  if (it.model !== undefined && it.model !== null && String(it.model).trim() !== '') return String(it.model).trim();
  if (it.Model !== undefined && it.Model !== null && String(it.Model).trim() !== '') return String(it.Model).trim();
  return '';
}

function extractTrim(it: Record<string, any>): string {
  if (it.trim !== undefined && it.trim !== null && String(it.trim).trim() !== '') return String(it.trim).trim();
  if (it.Trim !== undefined && it.Trim !== null && String(it.Trim).trim() !== '') return String(it.Trim).trim();
  return '';
}

function extractDrivetrain(it: Record<string, any>): string {
  if (it.drivetrain !== undefined && it.drivetrain !== null && String(it.drivetrain).trim() !== '') return String(it.drivetrain).trim();
  if (it.Drivetrain !== undefined && it.Drivetrain !== null && String(it.Drivetrain).trim() !== '') return String(it.Drivetrain).trim();
  const m = String(it.specs || it.title || it.trim || '').match(/\b(4x4|AWD|FWD|RWD|4WD|2WD)\b/i);
  return m ? m[1].toUpperCase() : '';
}

function extractCityProv(it: Record<string, any>): string {
  const parts = [];
  if (it.city) parts.push(String(it.city).trim());
  if (it.province) parts.push(String(it.province).trim());
  if (parts.length > 0) return parts.join(', ');
  if (it.location) return String(it.location).trim();
  if (it.City || it.Province) {
    return [it.City, it.Province].filter(Boolean).map(v => String(v).trim()).join(', ');
  }
  return '';
}

function parseNumeric(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function StructuredDatasetTable({ items: initialItems, onUpdateItems, datasetId }: Props) {
  if (!initialItems || initialItems.length === 0) return null;

  const [localItems, setLocalItems] = useState<Array<Record<string, any>>>(initialItems || []);

  useEffect(() => {
    setLocalItems(initialItems || []);
  }, [initialItems]);

  const items = localItems;

  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [dedupEnabled, setDedupEnabled] = useState<boolean>(false);

  // Filter state: Year, Make, Model, Trim, Drivetrain, City/Prov, Free-text
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMake, setFilterMake] = useState<string>('all');
  const [filterModel, setFilterModel] = useState<string>('all');
  const [filterTrim, setFilterTrim] = useState<string>('all');
  const [filterDrivetrain, setFilterDrivetrain] = useState<string>('all');
  const [filterCityProv, setFilterCityProv] = useState<string>('all');
  const [filterText, setFilterText] = useState<string>('');
  const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(true);

  // Sorting state: Year, Make, Model, Trim, Drivetrain, Mileage, Price, City/Prov, Date
  const [sortField, setSortField] = useState<string>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField('default');
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      if (['year', 'price', 'date_observed'].includes(field)) {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
    setCurrentPage(1);
  };

  // SQL Console state
  const [sqlConsoleOpen, setSqlConsoleOpen] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlSuccessMsg, setSqlSuccessMsg] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: Array<Record<string, any>>;
  } | null>(null);

  // Available column names
  const availableColumns = useMemo(() => {
    return Array.from(
      new Set(
        items.flatMap((it) =>
          Object.keys(it).filter(
            (k) => !['type', 'date_observed', 'source_url', 'listing_url', '_job_id'].includes(k)
          )
        )
      )
    );
  }, [items]);

  const handleRunSql = async () => {
    if (!sqlQuery.trim()) return;
    setSqlRunning(true);
    setSqlError(null);
    setSqlSuccessMsg(null);

    try {
      let res;
      if (datasetId) {
        res = await api.datasets.executeSql(datasetId, sqlQuery);
      } else {
        res = await api.datasets.executeRawSql(sqlQuery, items);
      }

      if (res.type === 'select') {
        setQueryResult({
          columns: res.columns || [],
          rows: res.rows || [],
        });
        setSqlSuccessMsg(`SELECT executed: Returned ${res.total_returned} records.`);
      } else {
        setQueryResult(null);
        if (res.rows) {
          setLocalItems(res.rows);
          if (onUpdateItems) onUpdateItems(res.rows);
        }
        setSqlSuccessMsg(`Success: Updated ${res.rows_affected} records. (${res.remaining_count} total rows)`);
      }
    } catch (err: any) {
      setSqlError(String(err.message || err));
    } finally {
      setSqlRunning(false);
    }
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

  // Distinct filter options extracted dynamically
  const distinctYears = useMemo(() => {
    const s = new Set<string>();
    for (const it of activeItems) {
      const y = extractYear(it);
      if (y) s.add(y);
    }
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [activeItems]);

  const distinctMakes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of activeItems) {
      const m = extractMake(it);
      if (m) counts[m] = (counts[m] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeItems]);

  const distinctModels = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of activeItems) {
      if (filterMake !== 'all' && extractMake(it).toLowerCase() !== filterMake.toLowerCase()) continue;
      const mod = extractModel(it);
      if (mod) counts[mod] = (counts[mod] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeItems, filterMake]);

  const distinctTrims = useMemo(() => {
    const s = new Set<string>();
    for (const it of activeItems) {
      if (filterMake !== 'all' && extractMake(it).toLowerCase() !== filterMake.toLowerCase()) continue;
      if (filterModel !== 'all' && extractModel(it).toLowerCase() !== filterModel.toLowerCase()) continue;
      const tr = extractTrim(it);
      if (tr) s.add(tr);
    }
    return Array.from(s).sort();
  }, [activeItems, filterMake, filterModel]);

  const distinctDrivetrains = useMemo(() => {
    const s = new Set<string>();
    for (const it of activeItems) {
      const dr = extractDrivetrain(it);
      if (dr) s.add(dr);
    }
    return Array.from(s).sort();
  }, [activeItems]);

  const distinctLocations = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of activeItems) {
      const loc = extractCityProv(it);
      if (loc) counts[loc] = (counts[loc] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeItems]);

  // Combined Multi-Attribute Filtering
  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      if (filterText.trim()) {
        const q = filterText.toLowerCase();
        const match = Object.values(item).some((v) =>
          String(v ?? '').toLowerCase().includes(q)
        );
        if (!match) return false;
      }
      if (filterYear !== 'all' && extractYear(item) !== filterYear) return false;
      if (filterMake !== 'all' && extractMake(item).toLowerCase() !== filterMake.toLowerCase()) return false;
      if (filterModel !== 'all' && extractModel(item).toLowerCase() !== filterModel.toLowerCase()) return false;
      if (filterTrim !== 'all' && extractTrim(item).toLowerCase() !== filterTrim.toLowerCase()) return false;
      if (filterDrivetrain !== 'all' && extractDrivetrain(item).toUpperCase() !== filterDrivetrain.toUpperCase()) return false;
      if (filterCityProv !== 'all') {
        const loc = extractCityProv(item);
        if (!loc.toLowerCase().includes(filterCityProv.toLowerCase())) return false;
      }
      return true;
    });
  }, [activeItems, filterText, filterYear, filterMake, filterModel, filterTrim, filterDrivetrain, filterCityProv]);

  const activeFilterCount =
    (filterYear !== 'all' ? 1 : 0) +
    (filterMake !== 'all' ? 1 : 0) +
    (filterModel !== 'all' ? 1 : 0) +
    (filterTrim !== 'all' ? 1 : 0) +
    (filterDrivetrain !== 'all' ? 1 : 0) +
    (filterCityProv !== 'all' ? 1 : 0) +
    (filterText.trim() ? 1 : 0);

  const handleClearAllFilters = () => {
    setFilterYear('all');
    setFilterMake('all');
    setFilterModel('all');
    setFilterTrim('all');
    setFilterDrivetrain('all');
    setFilterCityProv('all');
    setFilterText('');
    setCurrentPage(1);
  };

  // Multi-Column Sorting
  const sortedItems = useMemo(() => {
    if (sortField === 'default') return filteredItems;

    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'year') {
        cmp = parseNumeric(extractYear(a)) - parseNumeric(extractYear(b));
      } else if (sortField === 'make') {
        cmp = extractMake(a).localeCompare(extractMake(b));
      } else if (sortField === 'model') {
        cmp = extractModel(a).localeCompare(extractModel(b));
      } else if (sortField === 'trim') {
        cmp = extractTrim(a).localeCompare(extractTrim(b));
      } else if (sortField === 'drivetrain') {
        cmp = extractDrivetrain(a).localeCompare(extractDrivetrain(b));
      } else if (sortField === 'mileage') {
        cmp = parseNumeric(a.mileage_km ?? a.mileage) - parseNumeric(b.mileage_km ?? b.mileage);
      } else if (sortField === 'price') {
        cmp = parseNumeric(a.price) - parseNumeric(b.price);
      } else if (sortField === 'city' || sortField === 'city_prov') {
        cmp = extractCityProv(a).localeCompare(extractCityProv(b));
      } else if (sortField === 'date_observed') {
        cmp = String(a.date_observed || '').localeCompare(String(b.date_observed || ''));
      } else {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          cmp = valA - valB;
        } else {
          cmp = String(valA || '').localeCompare(String(valB || ''));
        }
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, sortField, sortDirection]);

  const isVehicle = activeItems.some((i) => i.type === 'vehicle_listing' || (i.make && i.year));
  const isCustom = activeItems.some((i) => i.type === 'custom_schema');
  const customColumns = availableColumns;

  const totalRows = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const paginatedItems = sortedItems.slice(startIndex, endIndex);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const toggleDedup = () => {
    setDedupEnabled((prev) => !prev);
    setCurrentPage(1);
  };

  const exportFilteredCsv = () => {
    if (sortedItems.length === 0) return;
    const cols = isVehicle
      ? ['year', 'make', 'model', 'trim', 'drivetrain', 'mileage_km', 'price', 'seller_type', 'dealer_name', 'city', 'province', 'date_observed', 'listing_url']
      : availableColumns;

    const headers = cols.join(',');
    const rows = sortedItems.map((it) =>
      cols
        .map((c) => {
          const val = it[c] ?? (c === 'mileage_km' ? it.mileage : '');
          const str = String(val ?? '').replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `filtered_dataset_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      {/* SQL Transformation Console */}
      {sqlConsoleOpen && (
        <div className="border-b border-slate-700 bg-slate-900 text-slate-100 p-4 shadow-lg space-y-3 font-sans">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Universal SQL Query & Transform Console
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">(Table name: <code>dataset</code>)</span>
            </div>
            <button
              onClick={() => setSqlConsoleOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-300 block mb-1">
              Available Columns (click to copy into query):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableColumns.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setSqlQuery((q) => `${q} "${col}"`)}
                  className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-[11px] font-mono text-emerald-300 transition-colors"
                  title={`Insert "${col}"`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-300 block mb-1">
              ⚡ Quick SQL Templates:
            </span>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `UPDATE dataset\nSET price = CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS INTEGER)\nWHERE price IS NOT NULL;`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-indigo-300 font-mono"
              >
                💵 Strip '$' and commas → Number
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `UPDATE dataset\nSET mileage = CAST(REPLACE(REPLACE(mileage, ' km', ''), ',', '') AS INTEGER)\nWHERE mileage IS NOT NULL;`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-indigo-300 font-mono"
              >
                🔢 Strip ' km' / units → Number
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `UPDATE dataset\nSET col_name = UPPER(TRIM(col_name))\nWHERE col_name IS NOT NULL;`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-indigo-300 font-mono"
              >
                🔠 UPPERCASE column
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(`SELECT * FROM dataset LIMIT 25;`)
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-emerald-300 font-mono"
              >
                🔍 SELECT preview
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `DELETE FROM dataset\nWHERE price IS NULL OR price = '';`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-rose-300 font-mono"
              >
                🗑️ Delete empty rows
              </button>
            </div>
          </div>

          <div>
            <textarea
              rows={3}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="e.g. UPDATE dataset SET price = CAST(REPLACE(price, '$', '') AS INTEGER);"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-emerald-400 focus:border-emerald-500 focus:outline-none placeholder:text-slate-600 dark:text-slate-400"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="text-xs">
              {sqlError && (
                <div className="flex items-center gap-1.5 text-rose-400 font-mono">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{sqlError}</span>
                </div>
              )}
              {sqlSuccessMsg && (
                <span className="text-emerald-400 font-semibold">{sqlSuccessMsg}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSqlQuery('')}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleRunSql}
                disabled={!sqlQuery.trim() || sqlRunning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                {sqlRunning ? 'Executing SQL…' : 'Run SQL Query'}
              </button>
            </div>
          </div>

          {queryResult && (
            <div className="mt-3 border-t border-slate-800 pt-2">
              <h5 className="text-[11px] font-semibold text-slate-300 mb-1">
                Query Result Preview ({queryResult.rows.length} rows):
              </h5>
              <div className="max-h-52 overflow-auto rounded border border-slate-800 bg-slate-950 text-[11px]">
                <table className="w-full text-left font-mono">
                  <thead className="border-b border-slate-800 bg-slate-900 text-slate-400">
                    <tr>
                      {queryResult.columns.map((col) => (
                        <th key={col} className="px-2 py-1 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-200">
                    {queryResult.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50">
                        {queryResult.columns.map((col) => (
                          <td key={col} className="px-2 py-0.5">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Faceted Vehicle & Attribute Filter Panel */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brand-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Dataset Filters
            </span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                {activeFilterCount} active
              </span>
            )}
            <span className="text-xs text-slate-500 font-medium ml-1">
              Showing <strong className="text-slate-800 dark:text-slate-200">{filteredItems.length}</strong> of{' '}
              {activeItems.length} records
              {filteredItems.length < activeItems.length && (
                <span className="text-slate-400"> ({activeItems.length - filteredItems.length} filtered out)</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2.5 py-1 transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Clear All Filters
              </button>
            )}

            <button
              type="button"
              onClick={exportFilteredCsv}
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg px-3 py-1 shadow-sm transition-colors disabled:opacity-50"
              title="Download currently filtered rows as CSV"
            >
              <Download className="h-3.5 w-3.5" /> Export Filtered CSV ({filteredItems.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterPanelOpen((o) => !o)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-200 p-1"
              title={filterPanelOpen ? 'Collapse filter panel' : 'Expand filter panel'}
            >
              {filterPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {filterPanelOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
            {/* 1. Year Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" /> Year
              </label>
              <select
                value={filterYear}
                onChange={(e) => {
                  setFilterYear(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none transition-colors ${
                  filterYear !== 'all'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-bold'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="all">All Years ({distinctYears.length})</option>
                {distinctYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Make Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Car className="h-3 w-3 text-slate-400" /> Make
              </label>
              <select
                value={filterMake}
                onChange={(e) => {
                  setFilterMake(e.target.value);
                  setFilterModel('all');
                  setFilterTrim('all');
                  setCurrentPage(1);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none transition-colors ${
                  filterMake !== 'all'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-bold'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="all">All Makes ({distinctMakes.length})</option>
                {distinctMakes.map(([mk, count]) => (
                  <option key={mk} value={mk}>
                    {mk} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Model Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Tag className="h-3 w-3 text-slate-400" /> Model
              </label>
              <select
                value={filterModel}
                onChange={(e) => {
                  setFilterModel(e.target.value);
                  setFilterTrim('all');
                  setCurrentPage(1);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none transition-colors ${
                  filterModel !== 'all'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-bold'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="all">All Models ({distinctModels.length})</option>
                {distinctModels.map(([mod, count]) => (
                  <option key={mod} value={mod}>
                    {mod} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Trim Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-slate-400" /> Trim
              </label>
              <select
                value={filterTrim}
                onChange={(e) => {
                  setFilterTrim(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none transition-colors ${
                  filterTrim !== 'all'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-bold'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="all">All Trims ({distinctTrims.length})</option>
                {distinctTrims.map((tr) => (
                  <option key={tr} value={tr}>
                    {tr}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Drivetrain Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Filter className="h-3 w-3 text-slate-400" /> Drivetrain
              </label>
              <select
                value={filterDrivetrain}
                onChange={(e) => {
                  setFilterDrivetrain(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none transition-colors ${
                  filterDrivetrain !== 'all'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-bold'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="all">All Drivetrains ({distinctDrivetrains.length})</option>
                {distinctDrivetrains.map((dr) => (
                  <option key={dr} value={dr}>
                    {dr}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. City / Province Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400" /> City / Prov
              </label>
              <select
                value={filterCityProv}
                onChange={(e) => {
                  setFilterCityProv(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none transition-colors ${
                  filterCityProv !== 'all'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-bold'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="all">All Locations ({distinctLocations.length})</option>
                {distinctLocations.map(([loc, count]) => (
                  <option key={loc} value={loc}>
                    {loc} ({count})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Free Text Quick Search, Sort Selector & Active Filter Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/60">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => {
                  setFilterText(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search in all columns (e.g. Laramie, Red, Leather)..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-7 py-1 text-xs focus:border-brand-500 focus:outline-none placeholder:text-slate-400 shadow-sm"
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <select
                value={sortField === 'default' ? 'default' : `${sortField}_${sortDirection}`}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'default') {
                    setSortField('default');
                    setSortDirection('desc');
                  } else {
                    const lastIdx = val.lastIndexOf('_');
                    const f = val.substring(0, lastIdx);
                    const d = val.substring(lastIdx + 1);
                    setSortField(f);
                    setSortDirection(d as 'asc' | 'desc');
                  }
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="default">Sort: Default</option>
                <option value="year_desc">📅 Year: Newest First</option>
                <option value="year_asc">📅 Year: Oldest First</option>
                <option value="price_asc">💵 Price: Low to High ($)</option>
                <option value="price_desc">💵 Price: High to Low ($)</option>
                <option value="mileage_asc">🔢 Mileage: Low to High</option>
                <option value="mileage_desc">🔢 Mileage: High to Low</option>
                <option value="make_asc">🚗 Make: A → Z</option>
                <option value="make_desc">🚗 Make: Z → A</option>
                <option value="model_asc">🏷️ Model: A → Z</option>
                <option value="trim_asc">✨ Trim: A → Z</option>
                <option value="drivetrain_asc">⚡ Drivetrain: A → Z</option>
                <option value="city_asc">📍 City / Prov: A → Z</option>
                <option value="date_observed_desc">🕒 Date: Most Recent</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {filterYear !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-800 font-medium">
                  Year: {filterYear}
                  <button onClick={() => setFilterYear('all')} className="hover:text-brand-950 font-bold">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterMake !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-800 font-medium">
                  Make: {filterMake}
                  <button onClick={() => setFilterMake('all')} className="hover:text-brand-950 font-bold">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterModel !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-800 font-medium">
                  Model: {filterModel}
                  <button onClick={() => setFilterModel('all')} className="hover:text-brand-950 font-bold">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterTrim !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-800 font-medium">
                  Trim: {filterTrim}
                  <button onClick={() => setFilterTrim('all')} className="hover:text-brand-950 font-bold">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterDrivetrain !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-800 font-medium">
                  Drivetrain: {filterDrivetrain}
                  <button onClick={() => setFilterDrivetrain('all')} className="hover:text-brand-950 font-bold">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterCityProv !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-800 font-medium">
                  Location: {filterCityProv}
                  <button onClick={() => setFilterCityProv('all')} className="hover:text-brand-950 font-bold">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60/75 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
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
            {sortField !== 'default' && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 flex items-center gap-1">
                Sorted by {sortField} ({sortDirection.toUpperCase()})
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
            onClick={() => setSqlConsoleOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold shadow-sm transition-colors ${
              sqlConsoleOpen
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60'
            }`}
            title="Open Universal SQL Query & Transform Console"
          >
            <Code2 className="h-3.5 w-3.5" />
            {sqlConsoleOpen ? 'Hide SQL' : '💻 SQL Query & Transforms'}
          </button>

          {duplicateCount > 0 && (
            <button
              onClick={toggleDedup}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors ${
                dedupEnabled
                  ? 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60'
                  : 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
              title={dedupEnabled ? 'Show full dataset including duplicates' : 'Hide duplicate records'}
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              {dedupEnabled ? `Show All (${items.length})` : `Remove ${duplicateCount} Duplicates`}
            </button>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm focus:border-brand-500 focus:outline-none"
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
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 hover:text-slate-900 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              {activePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={activePage >= totalPages}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 hover:text-slate-900 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/75 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider select-none">
            <tr>
              {isVehicle ? (
                <>
                  <th
                    onClick={() => handleSort('year')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Year</span>
                      {sortField === 'year' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('make')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Make</span>
                      {sortField === 'make' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('model')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Model</span>
                      {sortField === 'model' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('trim')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Trim</span>
                      {sortField === 'trim' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('drivetrain')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Drivetrain</span>
                      {sortField === 'drivetrain' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('mileage')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Mileage</span>
                      {sortField === 'mileage' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('price')}
                    className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Price</span>
                      {sortField === 'price' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('seller_type')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Seller</span>
                      {sortField === 'seller_type' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('city')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>City / Prov</span>
                      {sortField === 'city' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('date_observed')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      {sortField === 'date_observed' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-right">Link</th>
                </>
              ) : isCustom ? (
                <>
                  {customColumns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200/80 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>{col}</span>
                        {sortField === col ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                        ) : (
                          <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th
                    onClick={() => handleSort('date_observed')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      {sortField === 'date_observed' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-right">Source Link</th>
                </>
              ) : (
                <>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Name / Title</span>
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('brand')}
                    className="px-3 py-2.5 cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Brand</span>
                      {sortField === 'brand' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('price')}
                    className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-200/80 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Price</span>
                      {sortField === 'price' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2.5">Date Observed</th>
                  <th className="px-3 py-2.5 text-right">Link</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedItems.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 dark:bg-slate-800/60/80 transition-colors">
                {isVehicle ? (
                  <>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{row.year || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.make || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-brand-700">{row.model || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 truncate max-w-[180px]" title={row.trim}>
                      {row.trim || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
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
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
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
                        <td key={col} className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
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
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{row.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.brand || '—'}</td>
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
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Showing <span className="font-semibold">{startIndex + 1}</span> to <span className="font-semibold">{endIndex}</span> of <span className="font-semibold">{totalRows}</span> rows
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={activePage <= 1}
              className="rounded px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 disabled:opacity-40"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={activePage <= 1}
              className="inline-flex items-center rounded px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
            </button>
            <span className="px-2 font-semibold text-slate-800 dark:text-slate-200">
              Page {activePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={activePage >= totalPages}
              className="inline-flex items-center rounded px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={activePage >= totalPages}
              className="rounded px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
