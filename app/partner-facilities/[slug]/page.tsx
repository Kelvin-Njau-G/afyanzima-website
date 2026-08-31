'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardFilters, { type Filters } from '@/components/dashboard-filters';

type DailyEntry = {
  date: string; label: string; revenue: number; cogs: number; profit: number; discount: number;
};

type ColumnRoles = {
  date: number; product: number; staff: number;
  qty: number; discount: number; revenue: number; profit: number;
};

type ProductRow = { product: string; sku: string; qty: number; revenue: number; margin: number };

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
  commercial: { topProducts: ProductRow[] };
  productSku: Record<string, string>;
  columnRoles: ColumnRoles;
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

/**
 * Render a Metabase timestamp as "2026-08-24 14:35".
 *
 * Reads the string directly rather than going through `new Date()`, which would
 * shift the value into the viewer's local timezone. The times come from
 * Metabase already in the pharmacy's own timezone, so a partner opening the
 * dashboard while travelling should still see the hour the sale rang up.
 */
function formatTimestamp(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const [, date, hh, mm] = m;
  // Midnight means the source has no clock time — show date only rather than
  // an "00:00" that looks like a real sale time.
  if (hh === '00' && mm === '00') return date;
  return `${date} ${hh}:${mm}`;
}

function formatCell(value: string | number | null, colType: string, header: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    // Margin is stored as a decimal (e.g. 0.282) — convert to a real percentage
    if (/\bmargin\b/i.test(header)) return `${(value * 100).toFixed(2)}%`;
    return fmt(value);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatTimestamp(value);
  return String(value);
}


/** Y-axis tick label. Below 1,000 the "k" form collapses everything to "0k". */
function axisTick(v: number): string {
  if (Math.abs(v) >= 1000) {
    const k = v / 1000;
    return `KSh ${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `KSh ${fmt(v)}`;
}

/**
 * Chart.js plugin drawing each bar's total above it.
 *
 * Written inline rather than pulling in chartjs-plugin-datalabels: that plugin
 * labels every dataset, so on the stacked chart it would print COGS and profit
 * separately instead of the one combined figure per day. Summing the bar
 * datasets per index handles stacked and plain bars with the same code, and
 * avoids a second CDN script.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function barTotalsPlugin(color: string): any {
  return {
    id: 'barTotals',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterDatasetsDraw(chart: any) {
      const { ctx, data } = chart;
      const count = data.labels?.length ?? 0;
      if (!count) return;

      ctx.save();
      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      for (let i = 0; i < count; i++) {
        let total = 0;
        let topY = Infinity;
        let x: number | null = null;

        data.datasets.forEach((ds: { type?: string; data: number[] }, di: number) => {
          // Skip the dashed average line — it isn't part of the day's total.
          if (ds.type && ds.type !== 'bar') return;
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          const el = meta.data?.[i];
          if (!el) return;
          total += ds.data[i] || 0;
          if (el.y < topY) topY = el.y;
          x = el.x;
        });

        // Nothing sold that day — a "0" on every empty bar is just noise.
        if (!total || x === null || topY === Infinity) continue;
        ctx.fillText(fmt(total), x, topY - 4);
      }
      ctx.restore();
    },
  };
}

/** Figures shown above a chart, summarising whatever range is in view. */
function ChartTotals({ items }: { items: Array<{ label: string; value: string; accent?: boolean }> }) {
  return (
    <div className="mb-4 flex flex-wrap gap-x-8 gap-y-3 border-b border-gray-100 pb-3">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-[11px] text-gray-500">{it.label}</p>
          <p className={`text-lg font-medium ${it.accent ? 'text-green-700' : 'text-gray-900'}`}>
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function PartnerDashboard({ params }: { params: { slug: string } }) {
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<DashboardData | null>(null);
  // True until we've found out whether the visitor already has a portal
  // session. Stops the password form flashing up for signed-in partners.
  const [checking, setChecking]   = useState(true);
  const [filters, setFilters]     = useState<Filters | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const dailyRef      = useRef<HTMLCanvasElement>(null);
  const dailyChartRef = useRef<unknown>(null);
  const marginRef      = useRef<HTMLCanvasElement>(null);
  const marginChartRef = useRef<unknown>(null);

  // Try the portal session first. The cookie rides along automatically, and
  // the API decides whether this user may see this facility.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/${params.slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!cancelled && res.ok) setData(await res.json());
      } catch {
        // No session, or not authorised — fall through to the password form.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    script.onload = () => setChartReady(true);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function renderDailyChart(series: DailyEntry[], avgDaily: number) {
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
        labels: series.map(e => e.label),
        datasets: [
          {
            type: 'bar', label: 'Sales', data: series.map(e => e.revenue),
            backgroundColor: series.map(e => e.date >= today ? (isDark ? '#5dcaa5' : '#9fe1cb') : '#1d9e75'),
            borderRadius: 4, order: 2,
          },
          {
            type: 'line', label: 'Average', data: Array(series.length).fill(avgDaily),
            borderColor: '#ba7517', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0, order: 1,
          },
        ],
      },
      plugins: [barTotalsPlugin(textColor)],
      options: {
        responsive: true, maintainAspectRatio: false,
        // Headroom so the tallest bar's label isn't clipped by the canvas edge.
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: { parsed: { y: number } }) => ` KSh ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: textColor, autoSkip: false, maxRotation: 45 } },
          y: { grid: { color: gridColor }, ticks: { font: { size: 11 }, color: textColor, callback: (v: number) => axisTick(v) } },
        },
      },
    });
  }

  function renderMarginChart(series: DailyEntry[]) {
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
        labels: series.map(e => e.label),
        datasets: [
          {
            label: 'COGS',
            data: series.map(e => e.cogs),
            backgroundColor: isDark ? '#374151' : '#d1d5db',
            stack: 'daily',
            borderRadius: 0,
          },
          {
            label: 'Gross profit',
            data: series.map(e => e.profit),
            backgroundColor: '#1d9e75',
            stack: 'daily',
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          },
        ],
      },
      plugins: [barTotalsPlugin(textColor)],
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
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
          y: { stacked: true, grid: { color: gridColor }, ticks: { font: { size: 11 }, color: textColor, callback: (v: number) => axisTick(v) } },
        },
      },
    });
  }


  // ── Derived, filtered view ───────────────────────────────────────────────────
  // The whole current month is already in the browser at daily grain, so every
  // filter below is a pure recomputation — no refetch, no spinner.

  const monthBounds = useMemo(() => {
    const dates = data?.metrics.daily.map((d) => d.date) ?? [];
    if (!dates.length) return null;
    return { start: dates[0], end: dates[dates.length - 1] };
  }, [data]);

  // Initialise the range to the full month once the data lands.
  useEffect(() => {
    if (monthBounds && !filters) {
      setFilters({ from: monthBounds.start, to: monthBounds.end, product: '' });
    }
  }, [monthBounds, filters]);

  const roles = data?.columnRoles;
  const dbpRows = data?.dailySalesByProduct.rows ?? [];

  /** Every product name that appears this month, for the search box. */
  const productNames = useMemo(() => {
    if (!roles || roles.product < 0) return [];
    const set = new Set<string>();
    for (const row of dbpRows) {
      const name = row[roles.product];
      if (typeof name === 'string' && name) set.add(name);
    }
    return Array.from(set).sort();
  }, [dbpRows, roles]);

  const inRange = (d: unknown) => {
    if (!filters || typeof d !== 'string') return true;
    const day = d.slice(0, 10);
    return day >= filters.from && day <= filters.to;
  };

  /** Daily-sales-by-product rows after both filters. */
  const filteredDbpRows = useMemo(() => {
    if (!roles || !filters) return dbpRows;
    return dbpRows.filter((row) => {
      if (roles.date >= 0 && !inRange(row[roles.date])) return false;
      if (filters.product && roles.product >= 0 && row[roles.product] !== filters.product) {
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbpRows, roles, filters]);

  const isFiltered =
    !!filters &&
    !!monthBounds &&
    (filters.from !== monthBounds.start ||
      filters.to !== monthBounds.end ||
      !!filters.product);

  /**
   * Daily entries driving the charts and scorecards.
   *
   * With no product filter these come from the facility-wide cards (2262 for
   * revenue, 3193 for profit/COGS). Those have no product dimension, so once a
   * product is picked the series is rebuilt from card 3191 instead — the only
   * source carrying date AND product together. Everything downstream
   * (scorecards, both charts, averages) follows automatically.
   */
  const filteredDaily = useMemo((): DailyEntry[] => {
    const all = data?.metrics.daily ?? [];
    if (!filters) return all;

    const inWindow = all.filter((d) => d.date >= filters.from && d.date <= filters.to);
    if (!filters.product || !roles || roles.date < 0) return inWindow;

    // Day labels are already formatted on the facility-wide series; reuse them
    // so the chart axis reads identically whichever source is in play.
    const labelFor = new Map(all.map((d) => [d.date, d.label]));

    const byDate = new Map<string, { revenue: number; profit: number; discount: number }>();
    for (const row of filteredDbpRows) {
      const rawD = row[roles.date];
      const day = typeof rawD === 'string' ? rawD.slice(0, 10) : '';
      if (!day) continue;
      const cur = byDate.get(day) ?? { revenue: 0, profit: 0, discount: 0 };
      if (roles.revenue  >= 0) cur.revenue  += (row[roles.revenue]  as number) || 0;
      if (roles.profit   >= 0) cur.profit   += (row[roles.profit]   as number) || 0;
      if (roles.discount >= 0) cur.discount += (row[roles.discount] as number) || 0;
      byDate.set(day, cur);
    }

    // Keep every day in the window, including zero-sale days, so the chart
    // doesn't silently compress its x-axis when a product sells intermittently.
    return inWindow.map((d) => {
      const v = byDate.get(d.date) ?? { revenue: 0, profit: 0, discount: 0 };
      const revenue = Math.round(v.revenue);
      const profit  = Math.round(v.profit);
      return {
        date: d.date,
        label: labelFor.get(d.date) ?? d.date,
        revenue,
        profit: Math.max(0, profit),
        cogs: Math.max(0, revenue - profit),
        discount: Math.round(v.discount),
      };
    });
  }, [data, filters, filteredDbpRows, roles]);

  /**
   * Scorecard figures.
   *
   * Unfiltered, these are the month totals straight from Metabase cards 2536
   * and 2410 — the numbers this dashboard has always shown. Those cards are
   * aggregated per month and can't be sliced, so as soon as a filter is on we
   * total the daily series instead and label it as such.
   */
  const view = useMemo(() => {
    const m = data?.metrics;
    if (!m) return null;
    if (!isFiltered) {
      return {
        gross: m.gross, net: m.net, discountAmt: m.discountAmt, discountPct: m.discountPct,
        marginPct: m.marginPct, netMarginPct: m.netMarginPct,
        grossProfit: m.grossProfit, netProfit: m.netProfit,
        avgDaily: m.avgDaily, projected: m.projected, computed: false,
      };
    }
    const gross       = filteredDaily.reduce((a, d) => a + d.revenue, 0);
    const grossProfit = filteredDaily.reduce((a, d) => a + d.profit, 0);
    const discountAmt = filteredDaily.reduce((a, d) => a + d.discount, 0);
    const net         = gross - discountAmt;
    const marginPct   = gross ? Math.round((grossProfit / gross) * 1000) / 10 : 0;
    const days        = filteredDaily.filter((d) => d.revenue > 0).length;
    return {
      gross, net, discountAmt,
      discountPct: gross ? Math.round((discountAmt / gross) * 1000) / 10 : 0,
      marginPct,
      netMarginPct: gross ? Math.round((net / gross) * marginPct * 10) / 10 : 0,
      grossProfit,
      netProfit: grossProfit - discountAmt,
      avgDaily: days ? Math.round(gross / days) : 0,
      projected: days ? Math.round((gross / days) * m.daysInMonth) : 0,
      computed: true,
    };
  }, [data, filteredDaily, isFiltered]);

  /**
   * Product table, rebuilt from the filtered rows when a filter is on.
   * Card 3191 carries the product name but not the SKU, so SKUs come from the
   * lookup the server sends alongside.
   */
  const productRows = useMemo((): ProductRow[] => {
    if (!data) return [];
    if (!isFiltered || !roles || roles.product < 0) return data.commercial.topProducts;

    const acc = new Map<string, { qty: number; revenue: number; profit: number }>();
    for (const row of filteredDbpRows) {
      const name = row[roles.product];
      if (typeof name !== 'string' || !name) continue;
      const cur = acc.get(name) ?? { qty: 0, revenue: 0, profit: 0 };
      if (roles.qty     >= 0) cur.qty     += (row[roles.qty]     as number) || 0;
      if (roles.revenue >= 0) cur.revenue += (row[roles.revenue] as number) || 0;
      if (roles.profit  >= 0) cur.profit  += (row[roles.profit]  as number) || 0;
      acc.set(name, cur);
    }

    return Array.from(acc.entries())
      .map(([product, v]) => ({
        product,
        sku: data.productSku[product] ?? '',
        qty: Math.round(v.qty),
        revenue: Math.round(v.revenue),
        margin: v.revenue > 0 ? Math.round((v.profit / v.revenue) * 1000) / 10 : 0,
      }))
      .filter((p) => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [data, filteredDbpRows, isFiltered, roles]);

  // Redraw the charts whenever the range changes. Chart.js loads once; this
  // only rebuilds the two canvases, which is cheap enough to feel instant.
  useEffect(() => {
    if (!chartReady || !view) return;
    renderDailyChart(filteredDaily, view.avgDaily);
    renderMarginChart(filteredDaily);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, filteredDaily, view]);

  /**
   * Totals shown above the charts. Derived from the same series the charts
   * draw, so the header and the bars can never disagree — whatever the filters
   * are set to, these are the sum of what's visible.
   */
  const chartTotals = useMemo(() => {
    const revenue = filteredDaily.reduce((a, d) => a + d.revenue, 0);
    const cogs    = filteredDaily.reduce((a, d) => a + d.cogs, 0);
    const profit  = filteredDaily.reduce((a, d) => a + d.profit, 0);
    return {
      revenue, cogs, profit,
      marginPct: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
      days: filteredDaily.length,
      sellingDays: filteredDaily.filter((d) => d.revenue > 0).length,
    };
  }, [filteredDaily]);

  /** The Qaalane catalogue has no dates, so only the product filter applies. */
  const filteredCatalogue = useMemo(() => {
    const all = data?.fullProductTable ?? [];
    if (!filters?.product) return all;
    return all.filter((p) => p.product === filters.product);
  }, [data, filters]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mb-3 text-3xl">💊</div>
            <h1 className="text-lg font-medium text-gray-900">AfyaNzima Partner Portal</h1>
            <p className="mt-1 text-sm text-gray-500">Enter your facility password to view your performance dashboard.</p>
            <p className="mt-3 text-xs text-gray-400">
              Have a portal account?{' '}
              <a href="/partner-portal" className="underline">Sign in with your email</a>
            </p>
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

  // `m` is the filtered view when a filter is on, and the untouched month
  // totals otherwise. `raw` keeps the month-only figures (projection, days in
  // month) that don't make sense to recompute for a partial range.
  const raw = data.metrics;
  const m = view ?? {
    ...raw, computed: false,
  };

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

        {/* Filters apply to every section below. */}
        {filters && monthBounds && (
          <DashboardFilters
            monthStart={monthBounds.start}
            monthEnd={monthBounds.end}
            products={productNames}
            filters={filters}
            onChange={setFilters}
            resultCount={filteredDbpRows.length}
          />
        )}

        {/* ── COMMERCIAL ──────────────────────────────────────── */}
        <SectionHeader title="Commercial" />

        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">
          {isFiltered ? 'Selected period summary' : 'Month-to-date summary'}
        </p>

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
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · avg × {raw.daysInMonth} days</p>
          </div>
        </div>

        {/* Daily sales chart */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily sales — {isFiltered ? `${filters?.from} to ${filters?.to}` : data.monthLabel}</p>
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
          <ChartTotals
            items={[
              { label: 'Total sales', value: `KSh ${fmt(chartTotals.revenue)}`, accent: true },
              { label: 'Daily average', value: `KSh ${fmt(m.avgDaily)}` },
              {
                label: 'Days with sales',
                value: `${chartTotals.sellingDays} of ${chartTotals.days}`,
              },
            ]}
          />
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
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily sales & margin — {isFiltered ? `${filters?.from} to ${filters?.to}` : data.monthLabel}</p>
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
          <ChartTotals
            items={[
              { label: 'Total sales', value: `KSh ${fmt(chartTotals.revenue)}` },
              { label: 'Total COGS', value: `KSh ${fmt(chartTotals.cogs)}` },
              { label: 'Gross profit', value: `KSh ${fmt(chartTotals.profit)}`, accent: true },
              { label: 'Margin', value: `${chartTotals.marginPct}%` },
            ]}
          />
          <div className="relative h-56 w-full">
            <canvas ref={marginRef} role="img" aria-label="Stacked bar chart showing COGS and gross profit per day." />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" />Gross profit</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300" />COGS</span>
          </div>
        </div>

        {/* Daily Sales by Product table — sticky header + first 2 columns, scrolls within the card */}
        {filteredDbpRows.length > 0 && (() => {
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
                              'px-3 py-3 border-b border-gray-200 align-bottom whitespace-normal break-words',
                              'text-[11px] font-medium uppercase tracking-wider text-gray-400',
                              'sticky top-0 bg-gray-50',
                              isFreeze ? 'z-30' : 'z-20',
                              colType === 'number' ? 'text-right' : 'text-left',
                              j === 1 ? 'border-r border-gray-200' : '',
                            ].filter(Boolean).join(' ')}
                            style={j === 0 ? { left: 0 } : j === 1 ? { left: col1Left } : undefined}
                          >
                            {h.replace(/_/g, ' ')}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {filteredDbpRows.map((row, i) => {
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
                                  'px-3 py-2',
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

        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">
          Total sales by product this month
          {productRows.length > 0 && (
            <span className="ml-2 normal-case tracking-normal text-gray-400">
              ({productRows.length} SKUs)
            </span>
          )}
        </p>
        {/* Scrolls within the card, like Daily sales by product above.
            overscroll-contain stops the page scrolling once the list ends. */}
        <div className="mb-6 max-h-[400px] overflow-auto overscroll-contain rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                {/* Sticky header needs its own background, or rows show through as they scroll under it. */}
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-3">#</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-3">Product</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-3 text-right">Units sold</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-3 text-right">Revenue (KSh)</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((p, i) => (
                <tr key={`${p.sku}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="border-b border-gray-50 px-4 py-2 text-gray-400">{i + 1}</td>
                  <td className="border-b border-gray-50 px-4 py-2">
                    <p className="font-medium text-gray-800">{p.product}</p>
                    <p className="text-[11px] text-gray-400">{p.sku}</p>
                  </td>
                  <td className="border-b border-gray-50 px-4 py-2 text-right text-gray-700">{fmt(p.qty)}</td>
                  <td className="border-b border-gray-50 px-4 py-2 text-right font-medium text-gray-900">{fmt(p.revenue)}</td>
                  <td className="border-b border-gray-50 px-4 py-2 text-right">
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

        {/* Inventory comes from stock-level cards that carry neither a date nor
            a product breakdown, so these two can't follow the filters. Say so
            rather than leave unfiltered figures sitting beside filtered ones. */}
        {isFiltered && (
          <p className="mb-2.5 text-[11px] text-gray-400">
            Not affected by the filters above — these are current stock figures for the
            whole facility.
          </p>
        )}

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
        {filteredCatalogue.length > 0 && (
          <>
            <SectionHeader title="Product catalogue" />
            <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">
              All products sold this month ({filteredCatalogue.length} SKUs)
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
                  {filteredCatalogue.map((p, i) => (
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
