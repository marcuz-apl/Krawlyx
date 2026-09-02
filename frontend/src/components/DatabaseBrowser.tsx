import { useState, useEffect, useCallback } from 'react';
import { 
  Database, 
  Terminal, 
  Table, 
  Play, 
  RefreshCw, 
  Download, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  HardDrive, 
  FileCode, 
  Sliders, 
  Copy, 
  Check, 
  Maximize2,
  X
} from 'lucide-react';
import { api } from '@/lib/api/client';

interface TableMeta {
  name: string;
  type: string;
  row_count: number;
  column_count: number;
  columns: Array<{
    cid: number;
    name: string;
    type: string;
    notnull: boolean;
    dflt_value: any;
    pk: boolean;
  }>;
  sql: string;
}

interface TableRowsResponse {
  table_name: string;
  total_rows: number;
  filtered_rows: number;
  page: number;
  page_size: number;
  total_pages: number;
  columns: Array<{ name: string; type: string; pk: boolean }>;
  rows: Array<Record<string, any>>;
}

interface DatabaseStats {
  db_path: string;
  file_size_bytes: number;
  file_size_formatted: string;
  wal_size_bytes: number;
  wal_size_formatted: string;
  page_size: number;
  page_count: number;
  freelist_count: number;
  schema_version: number;
  integrity_status: string;
  integrity_ok: boolean;
}

interface QueryResult {
  success: boolean;
  columns?: string[];
  rows?: Array<Record<string, any>>;
  row_count?: number;
  rows_affected?: number;
  duration_ms?: number;
  is_read_only?: boolean;
  error?: string;
}

export function DatabaseBrowser() {
  const [activeTab, setActiveTab] = useState<'tables' | 'sql'>('tables');
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  
  // Table Explorer state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loadingTable, setLoadingTable] = useState(false);
  
  // SQL Terminal state
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM datasets ORDER BY id DESC LIMIT 50;');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [runningQuery, setRunningQuery] = useState(false);
  
  // Modals & UI states
  const [cellModalValue, setCellModalValue] = useState<{ title: string; content: string } | null>(null);
  const [showDdlModal, setShowDdlModal] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  // Load Database Stats
  const loadStats = useCallback(async () => {
    try {
      const res = await api.database.stats();
      if (res) setStats(res);
    } catch (err) {
      console.error('Failed to load database stats', err);
    }
  }, []);

  // Load Tables List
  const loadTables = useCallback(async () => {
    try {
      const res = await api.database.tables();
      if (res && res.length > 0) {
        setTables(res);
        if (!selectedTable) {
          const defaultTbl = res.find((t: TableMeta) => t.name === 'datasets')?.name || res[0].name;
          setSelectedTable(defaultTbl);
        }
      }
    } catch (err) {
      console.error('Failed to load tables list', err);
    }
  }, [selectedTable]);

  // Load Table Rows with pagination and search
  const loadTableRows = useCallback(async () => {
    if (!selectedTable) return;
    setLoadingTable(true);
    try {
      const res = await api.database.tableRows(selectedTable, {
        page,
        page_size: pageSize,
        search: search.trim() || undefined,
        sort_col: sortCol || undefined,
        sort_dir: sortDir,
      });
      setTableData(res);
    } catch (err) {
      console.error(`Failed to load rows for table ${selectedTable}`, err);
    } finally {
      setLoadingTable(false);
    }
  }, [selectedTable, page, pageSize, search, sortCol, sortDir]);

  useEffect(() => {
    loadStats();
    loadTables();
  }, [loadStats, loadTables]);

  useEffect(() => {
    if (selectedTable && activeTab === 'tables') {
      loadTableRows();
    }
  }, [selectedTable, page, pageSize, search, sortCol, sortDir, activeTab, loadTableRows]);

  // Execute Raw SQL Query
  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) return;
    setRunningQuery(true);
    setQueryResult(null);
    try {
      const res = await api.database.query(sqlQuery.trim());
      setQueryResult(res);
      // Reload stats and tables if DDL or write query executed
      if (!res.is_read_only) {
        loadStats();
        loadTables();
      }
    } catch (err: any) {
      setQueryResult({
        success: false,
        error: err?.message || String(err),
      });
    } finally {
      setRunningQuery(false);
    }
  };

  // Run Database Maintenance Tasks
  const handleRunMaintenance = async (action: 'vacuum' | 'checkpoint' | 'integrity_check') => {
    setMaintenanceLoading(true);
    setActionFeedback(null);
    try {
      const res = await api.database.maintenance(action);
      if (res.success) {
        setActionFeedback(`✓ ${action.toUpperCase()}: ${res.message || 'Completed successfully'}`);
        await loadStats();
      } else {
        setActionFeedback(`⚠ ${action.toUpperCase()}: ${(res as any).error || 'Operation failed'}`);
      }
    } catch (err: any) {
      setActionFeedback(`❌ Maintenance Error: ${err?.message || String(err)}`);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  // Export Table Data to CSV
  const handleExportCsv = (rows: Array<Record<string, any>>, filename: string) => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        headers
          .map(header => {
            const val = row[header];
            if (val === null || val === undefined) return '';
            const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const selectedTableMeta = tables.find(t => t.name === selectedTable);

  return (
    <div className="space-y-6">
      {/* Database Storage & Health Overview Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 text-slate-900 dark:text-white p-6 shadow-sm dark:shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                SuperAdmin Exclusive
              </span>
              <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                WAL Mode Active
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              SQLite Database Browser & Engine Terminal
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono">
              {stats?.db_path || 'data/krawlyx.db'}
            </p>
          </div>

          {/* Maintenance Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleRunMaintenance('checkpoint')}
              disabled={maintenanceLoading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
              title="Flush Write-Ahead Log (WAL) to main database file"
            >
              <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Flush WAL
            </button>
            <button
              onClick={() => handleRunMaintenance('vacuum')}
              disabled={maintenanceLoading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
              title="Defragment and reclaim unused storage space"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              VACUUM
            </button>
            <button
              onClick={() => handleRunMaintenance('integrity_check')}
              disabled={maintenanceLoading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
              title="Run PRAGMA integrity_check"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Integrity Check
            </button>
            <button
              onClick={() => { loadStats(); loadTables(); if (activeTab === 'tables') loadTableRows(); }}
              className="p-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all shadow-sm"
              title="Refresh All Database Stats"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-xs">
          <div className="bg-white/90 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Database Size</span>
            <span className="font-bold text-sm text-indigo-700 dark:text-indigo-300">{stats?.file_size_formatted || '0.00 MB'}</span>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] block">WAL Journal</span>
            <span className="font-bold text-sm text-blue-700 dark:text-blue-300">{stats?.wal_size_formatted || '0.00 MB'}</span>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Total Tables</span>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{tables.length} tables</span>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Page Count</span>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{stats?.page_count?.toLocaleString() || 0}</span>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Page Size</span>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{stats?.page_size || 4096} B</span>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Integrity</span>
            <span className={`font-bold text-sm ${stats?.integrity_ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {stats?.integrity_status || 'ok'}
            </span>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div className="mt-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-500/40 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2 animate-in fade-in shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </div>

      {/* Main Mode Toggle: Table Explorer vs SQL Terminal */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'tables'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Table Data Explorer
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'sql'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            SQL Query Terminal
          </button>
        </div>

        {activeTab === 'tables' && tableData && tableData.rows.length > 0 && (
          <button
            onClick={() => handleExportCsv(tableData.rows, selectedTable)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Table CSV
          </button>
        )}
      </div>

      {/* VIEW 1: Table Explorer */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          {/* Table Selector Pills */}
          <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {tables.map(tbl => (
              <button
                key={tbl.name}
                onClick={() => {
                  setSelectedTable(tbl.name);
                  setPage(1);
                  setSearch('');
                  setSortCol(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  selectedTable === tbl.name
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-200 dark:border-indigo-900/50'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                }`}
              >
                <Table className="w-3.5 h-3.5 opacity-70" />
                <span>{tbl.name}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  selectedTable === tbl.name
                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {tbl.row_count}
                </span>
              </button>
            ))}
          </div>

          {/* Table Controls & Filter Header */}
          {selectedTableMeta && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
                  <Table className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono">
                      {selectedTable}
                    </h3>
                    <button
                      onClick={() => setShowDdlModal(true)}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all flex items-center gap-1 border border-slate-200 dark:border-slate-700"
                    >
                      <FileCode className="w-3 h-3 text-indigo-500" />
                      View DDL Schema
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedTableMeta.column_count} columns • {tableData?.filtered_rows ?? selectedTableMeta.row_count} rows total
                  </p>
                </div>
              </div>

              {/* Search Bar & Page Size Selector */}
              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder={`Search ${selectedTable}...`}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={250}>250 / page</option>
                </select>
              </div>
            </div>
          )}

          {/* Table Data Grid */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                  <tr>
                    {tableData?.columns.map(col => (
                      <th
                        key={col.name}
                        onClick={() => {
                          if (sortCol === col.name) {
                            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortCol(col.name);
                            setSortDir('asc');
                          }
                        }}
                        className="px-3 py-2.5 whitespace-nowrap cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 select-none transition-colors border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.pk && (
                            <span className="px-1 py-0.2 rounded text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800">
                              PK
                            </span>
                          )}
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{col.name}</span>
                          <span className="text-[10px] text-slate-400 font-normal">({col.type || 'TEXT'})</span>
                          {sortCol === col.name && (
                            <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                              {sortDir === 'asc' ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                  {loadingTable ? (
                    <tr>
                      <td colSpan={tableData?.columns.length || 1} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                        Loading table data...
                      </td>
                    </tr>
                  ) : !tableData || tableData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={tableData?.columns.length || 1} className="py-12 text-center text-slate-400">
                        No rows found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    tableData.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        {tableData.columns.map(col => {
                          const val = row[col.name];
                          const isNull = val === null || val === undefined;
                          const isComplex = typeof val === 'object' || (typeof val === 'string' && val.length > 60);

                          return (
                            <td
                              key={col.name}
                              className="px-3 py-2 whitespace-nowrap max-w-xs truncate border-r border-slate-100 dark:border-slate-800/40 last:border-r-0"
                              title={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                            >
                              {isNull ? (
                                <span className="text-slate-400 dark:text-slate-600 italic">null</span>
                              ) : isComplex ? (
                                <button
                                  onClick={() => setCellModalValue({
                                    title: `${selectedTable}.${col.name} (Row #${rIdx + 1})`,
                                    content: typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val),
                                  })}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate max-w-full font-medium"
                                >
                                  <Maximize2 className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                </button>
                              ) : typeof val === 'boolean' ? (
                                <span className={val ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}>
                                  {String(val)}
                                </span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {tableData && tableData.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, tableData.filtered_rows)} of {tableData.filtered_rows.toLocaleString()} rows
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
                    Page {page} of {tableData.total_pages}
                  </span>
                  <button
                    disabled={page >= tableData.total_pages}
                    onClick={() => setPage(p => Math.min(tableData.total_pages, p + 1))}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: SQL Query Terminal */}
      {activeTab === 'sql' && (
        <div className="space-y-4">
          {/* Quick SQL Recipes */}
          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-semibold px-2">Quick Presets:</span>
            {[
              { label: 'Datasets', sql: 'SELECT * FROM datasets ORDER BY id DESC LIMIT 50;' },
              { label: 'Dataset Rows', sql: 'SELECT id, dataset_id, source_url, json_extract(data, "$.title") as title FROM dataset_rows LIMIT 50;' },
              { label: 'Failed Targets', sql: 'SELECT id, job_id, url, status, error FROM targets WHERE status = "error" LIMIT 50;' },
              { label: 'Users & Roles', sql: 'SELECT id, username, role, created_at FROM users;' },
              { label: 'Table Schemas', sql: 'SELECT name, type, sql FROM sqlite_master WHERE type="table";' },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => setSqlQuery(preset.sql)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 transition-all font-medium"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* SQL Editor Area */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                <Terminal className="w-3.5 h-3.5" />
                Raw SQLite SQL Console
              </span>
              <span className="text-[11px] text-slate-500">
                Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-mono">Ctrl+Enter</kbd> to run
              </span>
            </div>

            <textarea
              value={sqlQuery}
              onChange={e => setSqlQuery(e.target.value)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleExecuteSql();
                }
              }}
              rows={4}
              placeholder="Write raw SQLite query here (e.g. SELECT * FROM datasets WHERE id = 1;)..."
              className="w-full p-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-emerald-400 font-mono text-xs focus:outline-none resize-y"
              spellCheck={false}
            />

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExecuteSql}
                  disabled={runningQuery || !sqlQuery.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-all flex items-center gap-2 shadow-sm"
                >
                  {runningQuery ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  Execute Query
                </button>
              </div>

              {queryResult && (
                <div className="flex items-center gap-3 text-xs">
                  {queryResult.success ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {queryResult.is_read_only 
                        ? `${queryResult.row_count ?? 0} rows returned`
                        : `${queryResult.rows_affected ?? 0} rows affected`}
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Execution Failed
                    </span>
                  )}
                  {queryResult.duration_ms !== undefined && (
                    <span className="text-slate-500 dark:text-slate-400 font-mono">
                      ⚡ {queryResult.duration_ms} ms
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Query Results Data Table */}
          {queryResult && (
            <div className="space-y-2">
              {!queryResult.success ? (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-mono">
                  <div className="font-bold mb-1 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> SQLite Error:
                  </div>
                  {queryResult.error}
                </div>
              ) : queryResult.columns && queryResult.columns.length > 0 && queryResult.rows ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Query Results ({queryResult.rows.length} rows)
                    </span>
                    <button
                      onClick={() => handleExportCsv(queryResult.rows!, 'sql_query_result')}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Download Results CSV
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          {queryResult.columns.map(col => (
                            <th key={col} className="px-3 py-2 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {queryResult.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            {queryResult.columns!.map(col => {
                              const val = row[col];
                              const isNull = val === null || val === undefined;
                              return (
                                <td key={col} className="px-3 py-2 whitespace-nowrap max-w-xs truncate text-slate-800 dark:text-slate-200">
                                  {isNull ? (
                                    <span className="text-slate-400 dark:text-slate-600 italic">null</span>
                                  ) : typeof val === 'object' ? (
                                    <button
                                      onClick={() => setCellModalValue({
                                        title: `Result Column ${col}`,
                                        content: JSON.stringify(val, null, 2),
                                      })}
                                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate max-w-full"
                                    >
                                      <Maximize2 className="w-3 h-3 shrink-0" />
                                      <span>{JSON.stringify(val)}</span>
                                    </button>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-mono">
                  Statement executed successfully with no rows returned. ({queryResult.rows_affected ?? 0} rows affected)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cell Value Inspector Modal */}
      {cellModalValue && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-500" />
                {cellModalValue.title}
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(cellModalValue.content)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedText ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setCellModalValue(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono max-h-96 overflow-y-auto whitespace-pre-wrap break-words border border-slate-200 dark:border-slate-800">
              {cellModalValue.content}
            </pre>
          </div>
        </div>
      )}

      {/* DDL Schema Modal */}
      {showDdlModal && selectedTableMeta && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-500" />
                CREATE TABLE DDL: {selectedTable}
              </h4>
              <button
                onClick={() => setShowDdlModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-emerald-400 text-xs font-mono max-h-80 overflow-y-auto whitespace-pre-wrap border border-slate-200 dark:border-slate-800">
              {selectedTableMeta.sql || `/* Table ${selectedTable} has no DDL statement */`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
