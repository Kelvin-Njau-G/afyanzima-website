'use client';

import { useEffect, useRef, useState } from 'react';

type DailyEntry = { date: string; label: string; revenue: number };

type DashboardData = {
  facility: string;
  monthLabel: string;
  generatedAt: string;
  dates: string[];
  dateLabels: string[];
  metrics: {
    gross: number;
    net: number;
    discountAmt: number;
    discountPct: number;
    marginPct: number;
    netMarginPct: number;
    grossProfit: number;
    avgDaily: number;
    projected: number;
    daysInMonth: number;
    daily: DailyEntry[];
  };
};

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function PartnerDashboard({ params }: { params: { slug: string } }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const dailyRef = useRef<HTMLCanvasElement>(null);
  const dailyChartRef = useRef<unknown>(null);

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
      if (res.status === 401) {
        setError('Incorrect password. Please try again.');
        return;
      }
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
    script.onload = () => renderCharts(data);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function renderCharts(d: DashboardData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    if (!Chart || !dailyRef.current) return;

    if (dailyChartRef.current) (dailyChartRef.current as { destroy(): void }).destroy();

    const today = new Date().toISOString().slice(0, 10);
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#b4b2a9' : '#888780';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    dailyChartRef.current = new Chart(dailyRef.current, {
      data: {
        labels: d.metrics.daily.map((e) => e.label),
        datasets: [
          {
            type: 'bar',
            label: 'Sales',
            data: d.metrics.daily.map((e) => e.revenue),
            backgroundColor: d.dates.map((date) =>
              date >= today ? (isDark ? '#5dcaa5' : '#9fe1cb') : '#1d9e75',
            ),
            borderRadius: 4,
            order: 2,
          },
          {
            type: 'line',
            label: 'Average',
            data: Array(d.metrics.daily.length).fill(d.metrics.avgDaily),
            borderColor: '#ba7517',
            borderDash: [5, 4],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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

        {/* KPI grid */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Month-to-date summary</p>
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {[
            { label: 'Gross revenue', value: fmt(m.gross), sub: 'KSh · before discounts' },
            { label: 'Net revenue', value: fmt(m.net), sub: 'KSh · after discounts' },
            { label: 'Discounts given', value: fmt(m.discountAmt), sub: `KSh · ${m.discountPct}% of gross` },
            { label: 'Gross margin %', value: `${m.marginPct}%`, sub: `Net margin ${m.netMarginPct}%` },
            { label: 'Gross margin (KSh)', value: fmt(m.grossProfit), sub: `Gross rev × ${m.marginPct}%`, accent: true },
          ].map((card) => (
            <div
              key={card.label}
              className={`rounded-lg bg-gray-100 p-3.5 ${card.accent ? 'border-l-[3px] border-green-600' : ''}`}
            >
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

        <hr className="my-6 border-gray-200" />

        {/* Daily chart */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily sales — {data.monthLabel}</p>
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
          <div className="relative h-56 w-full">
            <canvas ref={dailyRef} role="img" aria-label="Bar chart of daily pharmacy sales this month." />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" />
              Daily sales (KSh)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 border-t-2 border-dashed border-amber-600" />
              Daily avg
            </span>
            <span className="ml-auto">* today is partial</span>
          </div>
        </div>

        {/* Breakdown table */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Revenue breakdown</p>
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
          {[
            { label: 'Gross revenue (MTD)', value: `KSh ${fmt(m.gross)}`, cls: '' },
            { label: 'Less: discounts', value: `− KSh ${fmt(m.discountAmt)}`, cls: 'text-red-600' },
            { label: 'Net revenue (MTD)', value: `KSh ${fmt(m.net)}`, cls: '', bold: true },
            { label: `Est. COGS (${100 - m.marginPct}% of gross)`, value: `− KSh ${fmt(m.gross - m.grossProfit)}`, cls: 'text-red-600' },
            { label: 'Gross profit (MTD)', value: `KSh ${fmt(m.grossProfit)}`, cls: 'text-green-700', bold: true },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className={`flex justify-between py-1.5 text-sm ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <span className="text-gray-500">{row.label}</span>
              <span className={`font-medium ${row.cls}`}>{row.value}</span>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-[11px] text-gray-400">
          Generated automatically · AfyaNzima Pharmacy as a Service
        </p>
      </div>
    </main>
  );
}
