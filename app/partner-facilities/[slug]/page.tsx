'use client';

import { useEffect, useRef, useState } from 'react';

type DailyEntry = { date: string; label: string; revenue: number; cogs: number; profit: number };

type DashboardData = {
  facility: string;
  monthLabel: string;
  generatedAt: string;
  dates: string[];
  dateLabels: string[];
  metrics: {
    gross: number; net: number; discountAmt: number; discountPct: number;
    marginPct: number; netMarginPct: number; grossProfit: number; netProfit: number;
    avgDaily: number; projected: number; daysInMonth: number;
    daily: DailyEntry[];
  };
  commercial: {
    topProducts: Array<{ product: string; sku: string; qty: number; revenue: number; margin: number }>;
  };
  inventory: { inventoryValue: number; monthlyRestockValue: number };
  fullProductTable: Array<{
    product: string; sku: string; buyingPrice: number | null;
    sellingPrice: number | null; margin: number; revenue: number; qty: number;
  }>;
  dailySalesByProduct: {
    headers: string[];
    colTypes: string[];
    rows: (string | number | null)[][];
  };
};

const fmt  = (n: number) => Math.round(n).toLocaleString();
const fmtD = (n: number | null) => n != null ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4 mt-8 border-b border-gray-200 pb-2">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
    </div>
  );
}

function formatCell(value: string | number | null, colType: string, header: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    // Margin is stored as a decimal (e.g. 0.282) — convert to a real percentage
    if (/\bmargin\b/i.test(header)) return `${(value * 100).toFixed(2)}%`;
    return fmt(value);
  }
  return String(value);
}

export default function PartnerDashboard({ params }: { params: { slug: string } }) {
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<DashboardData | null>(null);

  const dailyRef      = useRef<HTMLCanvasElement>(null);
  const dailyChartRef = useRef<unknown>(null);
  const marginRef      = useRef<HTMLCanvasElement>(null);
  const marginChartRef = useRef<unknown>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/${params.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) { setError('Incorrect password. Please try again.'); return; }
      if (!res.ok) throw new Error('Server error');
      setData(await res.json());
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!data) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => { renderDailyChart(data); renderMarginChart(data); };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function renderDailyChart(d: DashboardData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    if (!Chart || !dailyRef.current) return;
    if (dailyChartRef.current) (dailyChartRef.current as { destroy(): void }).destroy();
    const isDark    = matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#b4b2a9' : '#888780';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const today     = new Date().toISOString().slice(0, 10);
    dailyChartRef.current = new Chart(dailyRef.current, {
      data: {
        labels: d.metrics.daily.map(e => e.label),
        datasets: [
          {
            type: 'bar', label: 'Sales', data: d.metrics.daily.map(e => e.revenue),
            backgroundColor: d.dates.map(date => date >= today ? (isDark ? '#5dcaa5' : '#9fe1cb') : '#1d9e75'),
            borderRadius: 4, order: 2,
          },
          {
            type: 'line', label: 'Average', data: Array(d.metrics.daily.length).fill(d.metrics.avgDaily),
            borderColor: '#ba7517', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0, order: 1,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: { parsed: { y: number } }) => ` KSh ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: textColor, autoSkip: false, maxRotation: 45 } },
          y: { grid: { color: gridColor }, ticks: { font: { size: 11 }, color: textColor, callback: (v: number) => `KSh ${(v / 1000).toFixed(0)}k` } },
        },
      },
    });
  }

  function renderMarginChart(d: DashboardData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    if (!Chart || !marginRef.current) return;
    if (marginChartRef.current) (marginChartRef.current as { destroy(): void }).destroy();
    const isDark    = matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#b4b2a9' : '#888780';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    marginChartRef.current = new Chart(marginRef.current, {
      type: 'bar',
      data: {
        labels: d.metrics.daily.map(e => e.label),
        datasets: [
          {
            label: 'COGS',
            data: d.metrics.daily.map(e => e.cogs),
            backgroundColor: isDark ? '#374151' : '#d1d5db',
            stack: 'daily',
            borderRadius: 0,
          },
          {
            label: 'Gross profit',
            data: d.metrics.daily.map(e => e.profit),
            backgroundColor: '#1d9e75',
            stack: 'daily',
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c: { parsed: { y: number }; dataset: { label: string } }) =>
                ` ${c.dataset.label}: KSh ${fmt(c.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: textColor, autoSkip: false, maxRotation: 45 } },
          y: { stacked: true, grid: { color: gridColor }, ticks: { font: { size: 11 }, color: textColor, callback: (v: number) => `KSh ${(v / 1000).toFixed(0)}k` } },
        },
      },
    });
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mb-3 text-3xl">💊</div>
            <h1 className="text-lg font-medium text-gray-900">AfyaNzima Partner Portal</h1>
            <p className="mt-1 text-sm text-gray-500">Enter your facility password to view your performance dashboard.</p>
          </div>
          <form onSubmit={login} className="space-y-3">
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" autoComplete="current-password" required
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 disabled:opacity-60">
              {loading ? 'Loading…' : 'View dashboard'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const m = data.metrics;

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-8">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-medium text-gray-900">{data.facility}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{data.monthLabel} · Pharmacy as a Service performance</p>
          </div>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Updated {data.generatedAt}
          </span>
        </div>

        {/* ── COMMERCIAL ──────────────────────────────────────── */}
        <SectionHeader title="Commercial" />

        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Month-to-date summary</p>
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {[
            { label: 'Gross revenue',    value: fmt(m.gross),       sub: 'KSh · before discounts' },
            { label: 'Net revenue',      value: fmt(m.net),         sub: 'KSh · after discounts' },
            { label: 'Discounts given',  value: fmt(m.discountAmt), sub: `KSh · ${m.discountPct}% of gross` },
            { label: 'Gross margin %',   value: `${m.marginPct}%`,  sub: `Net margin ${m.netMarginPct}%` },
            { label: 'Net margin (KSh)', value: fmt(m.netProfit),   sub: 'Gross profit − discounts', accent: true },
          ].map(card => (
            <div key={card.label} className={`rounded-lg bg-gray-100 p-3.5 ${card.accent ? 'border-l-[3px] border-green-600' : ''}`}>
              <p className="mb-1 text-[11px] text-gray-500">{card.label}</p>
              <p className={`text-xl font-medium ${card.accent ? 'text-green-700' : 'text-gray-900'}`}>{card.value}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{card.sub}</p>
            </div>
          ))}
        </div>
        <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-100 p-3.5">
            <p className="mb-1 text-[11px] text-gray-500">Avg daily sales</p>
            <p className="text-xl font-medium text-gray-900">{fmt(m.avgDaily)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · based on complete days</p>
          </div>
          <div className="rounded-lg bg-gray-100 p-3.5 border-l-[3px] border-green-600">
            <p className="mb-1 text-[11px] text-gray-500">Projected monthly revenue</p>
            <p className="text-xl font-medium text-green-700">{fmt(m.projected)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · avg × {m.daysInMonth} days</p>
          </div>
        </div>

        {/* Daily sales chart */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily sales — {data.monthLabel}</p>
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
          <div className="relative h-56 w-full">
            <canvas ref={dailyRef} role="img" aria-label="Bar chart of daily pharmacy sales this month." />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" />Daily sales (KSh)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2 border-dashed border-amber-600" />&nbsp;Daily avg</span>
            <span className="ml-auto">* today is partial</span>
          </div>
        </div>

        {/* Daily Sales & Margin chart */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily sales & margin — {data.monthLabel}</p>
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
          <div className="relative h-56 w-full">
            <canvas ref={marginRef} role="img" aria-label="Stacked bar chart showing COGS and gross profit per day." />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" />Gross profit</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300" />COGS</span>
          </div>
        </div>

        {/* Daily Sales by Product table — sticky header + first 2 columns, scrolls within the card */}
        {data.dailySalesByProduct.rows.length > 0 && (() => {
          // Fixed px widths for each column position (Cart Time, Product, Pack, …)
          const COL_W = [80, 160, 70, 90, 90, 70, 100, 90, 80, 70, 110];
          const col1Left = COL_W[0]; // left offset for the second sticky column
          const tableMinW = COL_W.reduce((s, w) => s + w, 0);
          return (
            <>
              <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily sales by product — {data.monthLabel}</p>
              {/* max-h + overflow-auto confines scrolling to this card; overscroll-contain stops page scroll chaining */}
              <div className="mb-6 max-h-[400px] overflow-auto overscroll-contain rounded-xl border border-gray-100">
                <table
                  className="w-full text-sm"
                  style={{ tableLayout: 'fixed', minWidth: `${tableMinW}px`, borderCollapse: 'separate', borderSpacing: 0 }}
                >
                  <colgroup>
                    {data.dailySalesByProduct.headers.map((_, j) => (
                      <col key={j} style={{ width: `${COL_W[j] ?? 90}px` }} />
                    ))}
                  </colgroup>

                  <thead>
                    <tr>
                      {data.dailySalesByProduct.headers.map((h, j) => {
                        const colType = data.dailySalesByProduct.colTypes[j];
                        const isFreeze = j <= 1;
                        return (
                          <th
                            key={h}
                            className={[
                              'px-3 py-3 truncate border-b border-gray-200',
                              'text-[11px] font-medium uppercase tracking-wider text-gray-400',
                              'sticky top-0 bg-gray-50',
                              isFreeze ? 'z-30' : 'z-20',
                              colType === 'number' ? 'text-right' : 'text-left',
                              j === 1 ? 'border-r border-gray-200' : '',
                            ].filter(Boolean).join(' ')}
                            style={j === 0 ? { left: 0 } : j === 1 ? { left: col1Left } : undefined}
                          >
                            {h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {data.dailySalesByProduct.rows.map((row, i) => {
                      const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      return (
                        <tr key={i} className={`border-b border-gray-50 ${rowBg}`}>
                          {row.map((cell, j) => {
                            const colType = data.dailySalesByProduct.colTypes[j];
                            const header  = data.dailySalesByProduct.headers[j];
                            const isFreeze = j <= 1;
                            return (
                              <td
                                key={j}
                                className={[
                                  'px-3 py-2 truncate',
                                  isFreeze ? `sticky z-10 ${rowBg}` : '',
                                  j === 1 ? 'border-r border-gray-200' : '',
                                  colType === 'number'
                                    ? 'text-right font-medium text-gray-900'
                                    : 'text-gray-700',
                                ].filter(Boolean).join(' ')}
                                style={j === 0 ? { left: 0 } : j === 1 ? { left: col1Left } : undefined}
                              >
                                {formatCell(cell, colType, header)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Top 20 products this month</p>
        <div className="mb-6 overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Units sold</th>
                <th className="px-4 py-3 text-right">Revenue (KSh)</th>
                <th className="px-4 py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.commercial.topProducts.map((p, i) => (
                <tr key={p.sku} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2">
                    <p className="font-medium text-gray-800">{p.product}</p>
                    <p className="text-[11px] text-gray-400">{p.sku}</p>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">{fmt(p.qty)}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(p.revenue)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`text-xs font-medium ${p.margin >= 40 ? 'text-green-700' : p.margin >= 20 ? 'text-amber-700' : 'text-red-600'}`}>
                      {p.margin}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── INVENTORY ──────────────────────────────────────── */}
        <SectionHeader title="Inventory" />

        <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-100 p-3.5">
            <p className="mb-1 text-[11px] text-gray-500">Total inventory value</p>
            <p className="text-xl font-medium text-gray-900">{fmt(data.inventory.inventoryValue)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · current stock at buying price</p>
          </div>
          <div className="rounded-lg bg-gray-100 p-3.5 border-l-[3px] border-green-600">
            <p className="mb-1 text-[11px] text-gray-500">Monthly restock value</p>
            <p className="text-xl font-medium text-green-700">{fmt(data.inventory.monthlyRestockValue)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · stock received this month</p>
          </div>
        </div>

        {/* ── PRODUCT CATALOGUE (Qaalane only) ─────────────── */}
        {data.fullProductTable.length > 0 && (
          <>
            <SectionHeader title="Product catalogue" />
            <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">
              All products sold this month ({data.fullProductTable.length} SKUs)
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: '680px' }}>
                <colgroup>
                  <col style={{ width: '36%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Units sold</th>
                    <th className="px-4 py-3 text-right">Buying price</th>
                    <th className="px-4 py-3 text-right">Selling price</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                    <th className="px-4 py-3 text-right">Total sales (KSh)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fullProductTable.map((p, i) => (
                    <tr key={p.sku} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2">
                        <p className="truncate font-medium text-gray-800">{p.product}</p>
                        <p className="text-[11px] text-gray-400">{p.sku}</p>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(p.qty)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmtD(p.buyingPrice)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmtD(p.sellingPrice)}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`text-xs font-medium ${p.margin >= 40 ? 'text-green-700' : p.margin >= 20 ? 'text-amber-700' : 'text-red-600'}`}>
                          {p.margin}%
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mt-10 text-center text-[11px] text-gray-400">
          Generated automatically · AfyaNzima Pharmacy as a Service
        </p>
      </div>
    </main>
  );
}
