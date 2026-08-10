'use client';

import { useEffect, useRef, useState } from 'react';

type FacilitySummary = {
  gross: number; net: number; discountAmt: number; discountPct: number;
  marginPct: number; grossProfit: number; avgDaily: number; projected: number;
};

type OverviewData = {
  monthLabel: string;
  generatedAt: string;
  dates: string[];
  dateLabels: string[];
  allFacilities: string[];
  margins: Record<string, number>;
  dataset: Record<string, number[]>;
  facilitySummary: Record<string, FacilitySummary>;
  network: {
    totalGross: number; totalNet: number; totalDiscount: number;
    totalProfit: number; totalProjected: number; avgMargin: number; daysInMonth: number;
    totalInventoryValue: number; totalRestockValue: number;
  };
  commercial: {
    topProducts: Array<{ product: string; sku: string; qty: number; revenue: number; margin: number }>;
  };
  inventory: {
    inventoryByFacility: Record<string, number>;
    restockByFacility: Record<string, number>;
  };
};

const PALETTE = ['#533ab7', '#185fa5', '#1d9e75', '#3b6d11', '#ba7517', '#d85a30', '#993556'];
const fmt = (n: number) => Math.round(n).toLocaleString();

export default function OverviewDashboard() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  // True until we've checked for an existing admin portal session.
  const [checking, setChecking] = useState(true);

  const stackRef = useRef<HTMLCanvasElement>(null);
  const stackChartRef = useRef<unknown>(null);

  // Admins signed into the portal skip the password prompt entirely.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!cancelled && res.ok) setData(await res.json());
      } catch {
        // Fall through to the password form.
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
      const res = await fetch('/api/dashboard/overview', {
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
    script.onload = () => renderChart(data);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function renderChart(d: OverviewData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    if (!Chart || !stackRef.current) return;
    if (stackChartRef.current) (stackChartRef.current as { destroy(): void }).destroy();

    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#b4b2a9' : '#888780';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    stackChartRef.current = new Chart(stackRef.current, {
      type: 'bar',
      data: {
        labels: d.dateLabels,
        datasets: d.allFacilities.map((fac, i) => ({
          label: fac,
          data: d.dataset[fac],
          backgroundColor: PALETTE[i % PALETTE.length],
          stack: 'rev', borderWidth: 0,
          borderRadius: i === d.allFacilities.length - 1 ? { topLeft: 3, topRight: 3 } : 0,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: { dataIndex: number; parsed: { y: number } }[]) => {
                const total = items.reduce((s, i) => s + i.parsed.y, 0);
                return `${d.dateLabels[items[0].dataIndex]} · Total: KSh ${fmt(total)}`;
              },
              label: (ctx: { parsed: { y: number }; dataset: { label: string } }) => {
                if (!ctx.parsed.y) return null;
                const m = d.margins[ctx.dataset.label] ?? '—';
                const name = ctx.dataset.label.length > 30 ? ctx.dataset.label.slice(0, 28) + '…' : ctx.dataset.label;
                return `  ${name}: KSh ${fmt(ctx.parsed.y)} · margin ${m}%`;
              },
            },
            padding: 10, boxPadding: 4,
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: textColor, autoSkip: false, maxRotation: 45 } },
          y: { stacked: true, grid: { color: gridColor }, ticks: { font: { size: 11 }, color: textColor, callback: (v: number) => `KSh ${(v / 1000).toFixed(0)}k` } },
        },
      },
    });
  }

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
            <h1 className="text-lg font-medium text-gray-900">AfyaNzima Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Enter the dashboard password to continue.</p>
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

  const { network: n, facilitySummary, allFacilities } = data;

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-8">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-medium text-gray-900">PaaS Network Overview</h1>
            <p className="mt-0.5 text-sm text-gray-500">{data.monthLabel} · All facilities</p>
          </div>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Updated {data.generatedAt}
          </span>
        </div>

        {/* ── COMMERCIAL ──────────────────────────────────── */}
        <div className="mb-4 mt-2 border-b border-gray-200 pb-2">
          <h2 className="text-sm font-medium text-gray-700">Commercial</h2>
        </div>

        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Network month-to-date</p>
        <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {[
            { label: 'Total gross revenue',    value: fmt(n.totalGross),    sub: 'KSh across all facilities' },
            { label: 'Total net revenue',      value: fmt(n.totalNet),      sub: `KSh after KSh ${fmt(n.totalDiscount)} discounts` },
            { label: 'Total gross profit',     value: fmt(n.totalProfit),   sub: `${n.avgMargin}% avg margin`, accent: true },
            { label: 'Projected network revenue', value: fmt(n.totalProjected), sub: `KSh · avg × ${n.daysInMonth} days`, accent: true },
          ].map((card) => (
            <div key={card.label} className={`rounded-lg bg-gray-100 p-3.5 ${card.accent ? 'border-l-[3px] border-green-600' : ''}`}>
              <p className="mb-1 text-[11px] text-gray-500">{card.label}</p>
              <p className={`text-xl font-medium ${card.accent ? 'text-green-700' : 'text-gray-900'}`}>{card.value}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Top 20 products — network */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Top 20 products this month — all facilities</p>
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

        {/* ── INVENTORY ──────────────────────────────────── */}
        <div className="mb-4 mt-8 border-b border-gray-200 pb-2">
          <h2 className="text-sm font-medium text-gray-700">Inventory</h2>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-100 p-3.5">
            <p className="mb-1 text-[11px] text-gray-500">Total network inventory value</p>
            <p className="text-xl font-medium text-gray-900">{fmt(n.totalInventoryValue)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · current stock at buying price</p>
          </div>
          <div className="rounded-lg bg-gray-100 p-3.5 border-l-[3px] border-green-600">
            <p className="mb-1 text-[11px] text-gray-500">Total monthly restock value</p>
            <p className="text-xl font-medium text-green-700">{fmt(n.totalRestockValue)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · stock received this month</p>
          </div>
        </div>

        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Inventory & restock per facility</p>
        <div className="mb-6 overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3 text-right">Inventory value (KSh)</th>
                <th className="px-4 py-3 text-right">Monthly restock (KSh)</th>
              </tr>
            </thead>
            <tbody>
              {allFacilities.map((fac, i) => (
                <tr key={fac} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    <span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                    {fac}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{fmt(data.inventory.inventoryByFacility[fac] ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{fmt(data.inventory.restockByFacility[fac] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr className="my-6 border-gray-200" />

        {/* ── COMMERCIAL cont. — per-facility summary ─── */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Per-facility commercial summary</p>
        <div className="mb-6 overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3 text-right">Gross profit</th>
                <th className="px-4 py-3 text-right">Avg/day</th>
                <th className="px-4 py-3 text-right">Projected</th>
              </tr>
            </thead>
            <tbody>
              {allFacilities.map((fac, i) => {
                const s = facilitySummary[fac];
                return (
                  <tr key={fac} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      <span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                      {fac}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(s.gross)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(s.net)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{s.marginPct}%</td>
                    <td className="px-4 py-2.5 text-right font-medium text-green-700">{fmt(s.grossProfit)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(s.avgDaily)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(s.projected)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                <td className="px-4 py-2.5 text-gray-900">Total</td>
                <td className="px-4 py-2.5 text-right text-gray-900">{fmt(n.totalGross)}</td>
                <td className="px-4 py-2.5 text-right text-gray-900">{fmt(n.totalNet)}</td>
                <td className="px-4 py-2.5 text-right text-gray-900">{n.avgMargin}%</td>
                <td className="px-4 py-2.5 text-right text-green-700">{fmt(n.totalProfit)}</td>
                <td className="px-4 py-2.5 text-right text-gray-900">—</td>
                <td className="px-4 py-2.5 text-right text-gray-900">{fmt(n.totalProjected)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <hr className="my-6 border-gray-200" />

        {/* Stacked chart */}
        <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">Daily revenue by facility</p>
        <div className="mb-3 flex flex-wrap gap-3">
          {allFacilities.map((fac, i) => (
            <span key={fac} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              {fac}
              {data.margins[fac] != null && <span className="text-gray-400">{data.margins[fac]}%</span>}
            </span>
          ))}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="relative h-80 w-full">
            <canvas ref={stackRef} role="img" aria-label="Stacked bar chart of daily revenue per facility this month." />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Hover any bar to see per-facility revenue and gross margin %</p>
        </div>

        <p className="mt-10 text-center text-[11px] text-gray-400">
          Generated automatically · AfyaNzima Pharmacy as a Service
        </p>
      </div>
    </main>
  );
}
