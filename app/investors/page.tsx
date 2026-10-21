'use client';

import { useEffect, useRef, useState } from 'react';

type Month = {
  month: string; days: number;
  net: number; netChangePct: number | null;
  perDay: number; perDayChangePct: number | null;
  marginPct: number | null; marginChangePts: number | null;
  transactions: number; basket: number | null;
  turnover: number | null; daysOfStock: number | null;
  activeNet: number; exitedNet: number; activeMarginPct: number | null; facilityCount: number;
  facilities: Array<{
    facility: string; net: number; perDay: number; perDayChangePct: number | null; isNew: boolean;
    marginPct: number | null; transactions: number; basket: number | null; turnover: number | null;
  }>;
  exited: { count: number; net: number; marginPct: number | null; transactions: number } | null;
  categories: Array<{ group: string; net: number; sharePct: number | null; marginPct: number | null }>;
  injectablesPct: number | null;
  injectablesTop: Array<{ facility: string; sharePct: number }>;
};
type Week = { weekStart: string; activeNet: number; exitedNet: number; marginPct: number | null; activeMarginPct: number | null };
type InvestorData = { generatedAt: string; monthly: Month[]; weekly: Week[] };

const fmt = (n: number) => Math.round(n).toLocaleString();
const millions = (n: number) => `${(n / 1_000_000).toFixed(2)}M`;

/** "Qaalane Pharmacy and Medical Centre" → "Qaalane". */
const SUFFIXES = [
  /\s+pharmacy and medical centre.*$/i, /\s+medical & dental centre.*$/i, /\s+medical centre.*$/i,
  /\s+medical clinic.*$/i, /\s+global pharmacy.*$/i, /\s+pharm pharmacy.*$/i, /\s+pharmacy.*$/i,
  /\s+hospital.*$/i, /\s+(limited|ltd)\.?$/i,
];
function shortName(name: string): string {
  for (const re of SUFFIXES) {
    const s = name.replace(re, '');
    if (s !== name && s.trim()) return s.trim();
  }
  return name;
}

const monthLong = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const dayMonth = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Delta({ value, unit = '%', suffix }: { value: number | null; unit?: string; suffix: string }) {
  if (value == null) return <span className="text-gray-400">{suffix ? `— ${suffix}` : '—'}</span>;
  const shown = unit === ' pts' ? Math.round(Math.abs(value) * 10) / 10 : Math.round(Math.abs(value));
  const sign = shown === 0 ? 0 : Math.sign(value);
  const cls = sign > 0 ? 'text-green-700' : sign < 0 ? 'text-red-600' : 'text-gray-500';
  return <span className={cls}>{sign > 0 ? '+' : sign < 0 ? '−' : ''}{shown}{unit} {suffix}</span>;
}

const th = 'px-3 py-3 whitespace-nowrap text-right';
const td = 'px-3 py-2.5 whitespace-nowrap text-right';
const thL = 'px-3 py-3 whitespace-nowrap text-left';
const tdL = 'px-3 py-2.5 whitespace-nowrap text-left';

export default function InvestorDashboard() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<InvestorData | null>(null);
  const [month, setMonth] = useState('');
  const [view, setView] = useState<'month' | 'week'>('month');
  const [chartReady, setChartReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<{ destroy(): void } | null>(null);

  function load(d: InvestorData) {
    setData(d);
    setMonth(d.monthly[d.monthly.length - 1]?.month ?? '');
  }

  // Portal admins skip the password.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/investors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!cancelled && res.ok) load(await res.json());
      } catch {
        // Fall through to the password form.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) { setError('Incorrect password. Please try again.'); return; }
      if (!res.ok) throw new Error('Server error');
      load(await res.json());
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Chart) { setChartReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => setChartReady(true);
    document.head.appendChild(script);
  }, [data]);

  useEffect(() => {
    if (!data || !chartReady || !canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    chartRef.current?.destroy();

    const isMonth = view === 'month';
    const rows = isMonth
      ? data.monthly.map((m) => ({ label: monthShort(m.month), act: m.activeNet, ex: m.exitedNet, gm: m.marginPct, gma: m.activeMarginPct, perDay: m.perDay }))
      : data.weekly.map((w) => ({ label: dayMonth(w.weekStart), act: w.activeNet, ex: w.exitedNet, gm: w.marginPct, gma: w.activeMarginPct, perDay: (w.activeNet + w.exitedNet) / 7 }));
    const scale = isMonth ? 1_000_000 : 1_000;
    const unit = isMonth ? 'M' : 'k';
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#b4b2a9' : '#888780';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          { type: 'bar', label: 'Active facilities', data: rows.map((r) => r.act / scale), backgroundColor: '#5DCAA5', stack: 'rev', yAxisID: 'y', order: 3 },
          { type: 'bar', label: 'Exited facilities', data: rows.map((r) => r.ex / scale), backgroundColor: isDark ? '#5F5E5A' : '#D3D1C7', stack: 'rev', yAxisID: 'y', order: 3 },
          { type: 'line', label: 'Margin, network', data: rows.map((r) => r.gm), borderColor: '#D85A30', backgroundColor: '#D85A30', pointRadius: 2, tension: 0.25, yAxisID: 'y1', order: 1 },
          { type: 'line', label: 'Margin, active facilities', data: rows.map((r) => r.gma), borderColor: '#7F77DD', backgroundColor: '#7F77DD', borderDash: [4, 3], pointRadius: 0, tension: 0.25, yAxisID: 'y1', order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor, boxWidth: 10, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              title: (items: { label: string }[]) => (isMonth ? '' : 'Week of ') + items[0].label,
              label: (c: { dataset: { type: string; label: string }; parsed: { y: number } }) =>
                c.dataset.type === 'line'
                  ? ` ${c.dataset.label}: ${c.parsed.y?.toFixed(1)}%`
                  : ` ${c.dataset.label}: KSh ${isMonth ? c.parsed.y.toFixed(2) : fmt(c.parsed.y)}${unit}`,
              footer: (items: { dataIndex: number }[]) => `Network per day: KSh ${fmt(rows[items[0].dataIndex].perDay)}`,
            },
            padding: 10, boxPadding: 4,
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { size: 11 }, autoSkip: true, maxRotation: 0 } },
          y: { stacked: true, position: 'left', grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, callback: (v: number) => `${v}${unit}` } },
          y1: { position: 'right', suggestedMin: 35, suggestedMax: 65, grid: { display: false }, ticks: { color: textColor, font: { size: 11 }, callback: (v: number) => `${v}%` } },
        },
      },
    });
  }, [data, chartReady, view]);

  useEffect(() => () => chartRef.current?.destroy(), []);

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
            <h1 className="text-lg font-medium text-gray-900">PaaS Investor Overview</h1>
            <p className="mt-1 text-sm text-gray-500">Enter the investor password to continue.</p>
          </div>
          <form onSubmit={login} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 disabled:opacity-60"
            >
              {loading ? 'Loading… (about 20 seconds)' : 'View dashboard'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const m = data.monthly.find((x) => x.month === month) ?? data.monthly[data.monthly.length - 1];
  if (!m) {
    return <main className="min-h-screen bg-gray-50 px-4 pt-8 text-sm text-gray-500">No completed months yet.</main>;
  }
  const prev = data.monthly[data.monthly.indexOf(m) - 1];
  const vs = prev ? `vs ${monthShort(prev.month)}` : 'vs prior month';
  const topCat = Math.max(1, ...m.categories.map((c) => c.net));
  const kpis = [
    { label: 'Net revenue', value: `KSh ${millions(m.net)}`, sub: <Delta value={m.netChangePct} suffix={vs} /> },
    { label: 'Net revenue / day', value: fmt(m.perDay), sub: <Delta value={m.perDayChangePct} suffix={vs} /> },
    { label: 'Gross margin', value: m.marginPct == null ? '—' : `${m.marginPct}%`, sub: <Delta value={m.marginChangePts} unit=" pts" suffix={vs} /> },
    { label: 'Transactions', value: fmt(m.transactions), sub: <span className="text-gray-500">basket KSh {m.basket == null ? '—' : fmt(m.basket)}</span> },
    { label: 'Stock turnover', value: m.turnover == null ? '—' : `${m.turnover}×`, sub: <span className="text-gray-500">a year · {m.daysOfStock ?? '—'} days of stock</span> },
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-gray-900">PaaS Network · Investor Overview</h1>
            <p className="mt-0.5 text-sm text-gray-500">Whole network · net of discounts · completed months only · updated {data.generatedAt}</p>
          </div>
          <select
            value={m.month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            {[...data.monthly].reverse().map((x) => <option key={x.month} value={x.month}>{monthLong(x.month)}</option>)}
          </select>
        </div>

        {/* Headline figures */}
        <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg bg-gray-100 p-3.5">
              <p className="mb-1 text-[11px] text-gray-500">{k.label}</p>
              <p className="text-xl font-medium text-gray-900">{k.value}</p>
              <p className="mt-0.5 text-[11px]">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Trend */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400">
            Net revenue and gross margin · {view === 'month' ? `by month since ${monthShort(data.monthly[0].month)}` : `by week, last ${data.weekly.length} weeks`}
          </p>
          <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-xs" role="group" aria-label="Chart period">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-3 py-1 ${view === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {v === 'month' ? 'Monthly' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-8 rounded-xl border border-gray-100 bg-white p-5">
          <div className="relative h-72 w-full">
            <canvas ref={canvasRef} role="img" aria-label="Net revenue per period, split into active and exited facilities, with gross margin lines." />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Bars: net revenue, split into facilities active today and facilities that have since left. Lines: gross margin on net revenue for the whole network and for today&apos;s active facilities.
            {view === 'week' && ' Complete Monday–Sunday weeks.'}
          </p>
        </div>

        {/* Facility table */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">
          Active facilities · {monthLong(m.month)} · per day = net revenue ÷ trading days
        </p>
        <div className="mb-8 overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className={thL}>Facility</th>
                <th className={th}>Net revenue</th>
                <th className={th}>Per day</th>
                <th className={th}>{vs}</th>
                <th className={th}>Gross margin</th>
                <th className={th}>Transactions</th>
                <th className={th}>Basket</th>
                <th className={th}>Stock turn</th>
              </tr>
            </thead>
            <tbody>
              {m.facilities.map((f, i) => (
                <tr key={f.facility} className={`border-b border-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                  <td className={`${tdL} font-medium text-gray-800`}>{shortName(f.facility)}</td>
                  <td className={`${td} text-gray-900`}>{fmt(f.net)}</td>
                  <td className={`${td} text-gray-700`}>{fmt(f.perDay)}</td>
                  <td className={td}>
                    {f.isNew
                      ? <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">New</span>
                      : <Delta value={f.perDayChangePct} suffix="" />}
                  </td>
                  <td className={`${td} text-gray-700`}>{f.marginPct == null ? '—' : `${f.marginPct}%`}</td>
                  <td className={`${td} text-gray-700`}>{fmt(f.transactions)}</td>
                  <td className={`${td} text-gray-700`}>{f.basket == null ? '—' : fmt(f.basket)}</td>
                  <td className={`${td} text-gray-700`}>{f.turnover == null ? '—' : `${f.turnover}×`}</td>
                </tr>
              ))}
              {m.exited && (
                <tr className="border-b border-gray-50 text-gray-400">
                  <td className={tdL}>Exited facilities ({m.exited.count})</td>
                  <td className={td}>{fmt(m.exited.net)}</td>
                  <td className={td} />
                  <td className={td} />
                  <td className={td}>{m.exited.marginPct == null ? '—' : `${m.exited.marginPct}%`}</td>
                  <td className={td}>{fmt(m.exited.transactions)}</td>
                  <td className={td} />
                  <td className={td} />
                </tr>
              )}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className={tdL}>Network</td>
                <td className={td}>{fmt(m.net)}</td>
                <td className={td}>{fmt(m.perDay)}</td>
                <td className={td}><Delta value={m.perDayChangePct} suffix="" /></td>
                <td className={td}>{m.marginPct == null ? '—' : `${m.marginPct}%`}</td>
                <td className={td}>{fmt(m.transactions)}</td>
                <td className={td}>{m.basket == null ? '—' : fmt(m.basket)}</td>
                <td className={td}>{m.turnover == null ? '—' : `${m.turnover}×`}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Category mix */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">
          What we sell · share of net revenue and margin, active facilities, {monthLong(m.month)}
        </p>
        <div className="mb-3 rounded-xl border border-gray-100 bg-white p-5">
          {m.categories.map((c) => (
            <div key={c.group} className="grid grid-cols-[9.5rem_minmax(0,1fr)_3rem_4.5rem] items-center gap-3 py-1.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)_3rem_5rem]">
              <span className="text-gray-800">{c.group}</span>
              <div className="h-2.5 rounded-sm bg-[#1D9E75]" style={{ width: `${(c.net / topCat) * 100}%` }} />
              <span className="text-right text-gray-900">{c.sharePct == null ? '—' : `${Math.round(c.sharePct)}%`}</span>
              <span className="text-right text-gray-500">{c.marginPct == null ? '—' : `${Math.round(c.marginPct)}% GM`}</span>
            </div>
          ))}
        </div>
        {m.injectablesPct != null && (
          <p className="text-[11px] text-gray-500">
            Injectables: {m.injectablesPct}% of net revenue across all categories
            {m.injectablesTop.length > 0 && ` (${m.injectablesTop.map((x) => `${Math.round(x.sharePct)}% at ${shortName(x.facility)}`).join(', ')})`}.
          </p>
        )}
      </div>
    </main>
  );
}
