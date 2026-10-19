'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import CodeCheckSection from '@/components/code-check-section';
import type { CodeCheckData } from '@/lib/dashboard/code-check';

type DayFigures = { gross: number; discount: number; net: number; profit: number };

type FacilitySummary = {
  gross: number; discountAmt: number; discountPct: number; net: number;
  grossProfit: number; marginPct: number; avgDaily: number; projected: number; daysTraded: number;
};

type TopProduct = { product: string; sku: string; qty: number; revenue: number; margin: number };

type OverviewData = {
  monthLabel: string;
  monthPrefix: string;
  today: string;
  generatedAt: string;
  dates: string[];
  dateLabels: string[];
  allFacilities: string[];
  daily: Record<string, DayFigures[]>;
  facilitySummary: Record<string, FacilitySummary>;
  network: {
    totalGross: number; totalNet: number; totalDiscount: number; totalProfit: number;
    totalProjected: number; totalAvgDaily: number; avgMargin: number; daysInMonth: number;
    totalInventoryValue: number; totalRestockValue: number;
  };
  comparison: Record<string, {
    thisAvgDaily: number; thisMargin: number;
    prevAvgDaily: number | null; prevMargin: number | null;
    baselineMonths: string[];
  }>;
  commercial: {
    topProducts: TopProduct[];
  };
  inventory: {
    inventoryByFacility: Record<string, number>;
    restockByFacility: Record<string, number>;
  };
  reconciliation: Array<{
    facility: string; billed: number; collected: number;
    mpesaBilled: number; mpesaCollected: number; cashBilled: number; cashCollected: number; netBalance: number;
  }> | null;
  discounts: {
    staffDaily: Array<{ date: string; facility: string; staff: string; discount: number; discountedGross: number; bills: number }> | null;
    staffMonth: Array<{ facility: string; staff: string; gross: number; discount: number; bills: number }> | null;
  };
  missedSales: Array<{ date: string; facility: string; count: number; value: number }> | null;
  unpaidBills: Array<{
    facility: string; order: string; status: string; createdAt: string; staff: string;
    payable: number; paid: number; balance: number; items: string[];
  }> | null;
  unpaidBillsFrom: string;
};

const PALETTE = ['#533ab7', '#185fa5', '#1d9e75', '#3b6d11', '#ba7517', '#d85a30', '#993556'];
const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const ALL = '__all__';

/** "Qaalane Pharmacy and Medical Centre" → "Qaalane", for tight column headers. */
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

function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function monthName(prefix: string): string {
  return new Date(`${prefix}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "Jul–Sep 2026", "Sep 2026", or a note when there's no full month yet. */
function baselineLabel(months: string[]): string {
  if (!months.length) return 'No full month yet';
  const first = monthName(months[0]);
  if (months.length === 1) return first;
  const last = monthName(months[months.length - 1]);
  const sameYear = months[0].slice(0, 4) === months[months.length - 1].slice(0, 4);
  return `${sameYear ? first.split(' ')[0] : first}–${last}`;
}

function Section({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4 mt-10 border-b border-gray-200 pb-2">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-xs font-medium uppercase tracking-widest text-gray-400">{children}</p>;
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      Couldn&apos;t load {what} from Metabase. The rest of the dashboard is unaffected.
    </p>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="mr-2 inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />;
}

function Change({ value, unit = '%' }: { value: number | null; unit?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-gray-400">—</span>;
  const v = Math.round(value * 10) / 10;
  const cls = v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-gray-500';
  return <span className={`text-xs font-medium ${cls}`}>{v > 0 ? '+' : ''}{v}{unit}</span>;
}

const th = 'px-4 py-3 whitespace-nowrap';
const thR = `${th} text-right`;
const td = 'px-4 py-2.5 whitespace-nowrap';
const tdR = `${td} text-right`;
const headRow = 'border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400';
const tableWrap = 'mb-6 overflow-x-auto rounded-xl border border-gray-100 bg-white';
const zebra = (i: number) => `border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`;

export default function OverviewDashboard() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  // True until we've checked for an existing admin portal session.
  const [checking, setChecking] = useState(true);
  const [facility, setFacility] = useState<string>(ALL);
  const [chartReady, setChartReady] = useState(false);
  // Discount drill-down: which facility and which day ('' = whole month).
  const [drillFacility, setDrillFacility] = useState<string>('');
  const [drillDate, setDrillDate] = useState<string>('');
  // Per-facility top products, fetched the first time a facility is selected.
  const [facilityTop, setFacilityTop] = useState<Record<string, TopProduct[] | 'loading' | 'error'>>({});
  // M-Pesa code check: slow (~20s), so loaded after the rest of the page.
  const [codeCheck, setCodeCheck] = useState<CodeCheckData | 'loading' | 'error' | null>(null);

  const stackRef = useRef<HTMLCanvasElement>(null);
  const stackChartRef = useRef<unknown>(null);
  const drillRef = useRef<HTMLDivElement>(null);

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

  // Load Chart.js once the dashboard is showing.
  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Chart) { setChartReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => setChartReady(true);
    document.head.appendChild(script);
  }, [data]);

  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    data?.allFacilities.forEach((f, i) => { m[f] = PALETTE[i % PALETTE.length]; });
    return (f: string) => m[f] ?? '#888780';
  }, [data]);

  // Facilities in scope for every section below.
  const facs = useMemo(
    () => (!data ? [] : facility === ALL ? data.allFacilities : data.allFacilities.filter((f) => f === facility)),
    [data, facility],
  );

  useEffect(() => {
    if (!data || facility === ALL || facilityTop[facility]) return;
    setFacilityTop((m) => ({ ...m, [facility]: 'loading' }));
    fetch('/api/dashboard/overview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, topProductsFor: facility }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { topProducts: TopProduct[] }) => setFacilityTop((m) => ({ ...m, [facility]: j.topProducts })))
      .catch(() => setFacilityTop((m) => ({ ...m, [facility]: 'error' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, facility]);

  function loadCodeCheck() {
    setCodeCheck('loading');
    fetch('/api/dashboard/overview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, codeCheck: true }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { codeCheck: CodeCheckData }) => setCodeCheck(j.codeCheck))
      .catch(() => setCodeCheck('error'));
  }

  useEffect(() => {
    if (data && codeCheck === null) loadCodeCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Keep the drill-down pointed at a facility that's in scope.
  useEffect(() => {
    if (!facs.length) return;
    if (!facs.includes(drillFacility)) setDrillFacility(facs[0]);
  }, [facs, drillFacility]);

  useEffect(() => {
    if (!data || !chartReady) return;
    renderChart(data, facs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartReady, facs]);

  useEffect(() => () => {
    if (stackChartRef.current) (stackChartRef.current as { destroy(): void }).destroy();
  }, []);

  function renderChart(d: OverviewData, scope: string[]) {
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
        datasets: scope.map((fac, i) => ({
          label: fac,
          data: d.daily[fac].map((x) => x.net),
          backgroundColor: colorOf(fac),
          stack: 'rev', borderWidth: 0,
          borderRadius: i === scope.length - 1 ? { topLeft: 3, topRight: 3 } : 0,
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
                return `${d.dateLabels[items[0].dataIndex]} · Net: KSh ${fmt(total)}`;
              },
              label: (ctx: { dataIndex: number; parsed: { y: number }; dataset: { label: string } }) => {
                if (!ctx.parsed.y) return null;
                const day = d.daily[ctx.dataset.label][ctx.dataIndex];
                const m = day.net ? Math.round((day.profit / day.net) * 1000) / 10 : 0;
                return `  ${shortName(ctx.dataset.label)}: KSh ${fmt(ctx.parsed.y)} · GP margin ${m}%`;
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

  const { facilitySummary, dates } = data;
  const isAll = facility === ALL;
  const S = (k: keyof FacilitySummary) => facs.reduce((s, f) => s + facilitySummary[f][k], 0);
  const scopeNet = S('net');
  const scopeProfit = S('grossProfit');
  const scopeGross = S('gross');
  const scopeDiscount = S('discountAmt');
  const scopeAvgDaily = S('avgDaily');
  const scopeProjected = S('projected');
  const scopeMargin = scopeNet ? Math.round((scopeProfit / scopeNet) * 1000) / 10 : 0;
  const datesDesc = [...dates].reverse();
  const daysTraded = Math.max(0, ...facs.map((f) => facilitySummary[f].daysTraded));

  const facilityTopState = isAll ? null : facilityTop[facility];
  const topProducts = isAll ? data.commercial.topProducts : Array.isArray(facilityTopState) ? facilityTopState : [];

  // ── Discounts ──
  const discountOn = (fac: string, d: string) => data.daily[fac][dates.indexOf(d)]?.discount ?? 0;
  const staffDaily = data.discounts.staffDaily;
  const staffMonth = data.discounts.staffMonth;
  const drillRows = (() => {
    if (!drillFacility) return [];
    if (drillDate) {
      return (staffDaily ?? [])
        .filter((r) => r.facility === drillFacility && r.date === drillDate)
        .map((r) => ({ staff: r.staff, discount: r.discount, bills: r.bills, base: r.discountedGross }))
        .sort((a, b) => b.discount - a.discount);
    }
    return (staffMonth ?? [])
      .filter((r) => r.facility === drillFacility)
      .map((r) => ({ staff: r.staff, discount: r.discount, bills: r.bills, base: r.gross }))
      .sort((a, b) => b.discount - a.discount);
  })();
  // Per-staff daily grid for the selected facility, whole month.
  const drillStaffNames = Array.from(new Set((staffDaily ?? []).filter((r) => r.facility === drillFacility).map((r) => r.staff))).sort();
  const staffDayDiscount = (staff: string, d: string) =>
    (staffDaily ?? []).find((r) => r.facility === drillFacility && r.staff === staff && r.date === d)?.discount ?? 0;

  function openDrill(fac: string, d: string) {
    setDrillFacility(fac);
    setDrillDate(d);
    drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Missed sales ──
  const missed = data.missedSales;
  const missedAt = (fac: string, d: string) => missed?.find((m) => m.facility === fac && m.date === d);
  const missedMonth = (fac: string) =>
    (missed ?? []).filter((m) => m.facility === fac).reduce((a, m) => ({ count: a.count + m.count, value: a.value + m.value }), { count: 0, value: 0 });
  const missedDates = Array.from(new Set((missed ?? []).filter((m) => facs.includes(m.facility)).map((m) => m.date))).sort().reverse();
  const MissedCell = ({ m }: { m?: { count: number; value: number } }) =>
    !m || !m.count ? <span className="text-gray-300">—</span> : (
      <span>
        <span className="font-medium text-gray-800">{m.count}</span>
        <span className="ml-1.5 text-[11px] text-gray-500">KSh {fmt(m.value)}</span>
      </span>
    );

  // ── Reconciliation ──
  const recon = data.reconciliation;
  const reconRows = (recon ?? []).filter((r) => facs.includes(r.facility));
  const reconUnattributed = (recon ?? []).filter((r) => !data.allFacilities.includes(r.facility));
  const reconTotal = reconRows.reduce(
    (a, r) => ({
      cashBilled: a.cashBilled + r.cashBilled, cashCollected: a.cashCollected + r.cashCollected,
      mpesaBilled: a.mpesaBilled + r.mpesaBilled, mpesaCollected: a.mpesaCollected + r.mpesaCollected,
      billed: a.billed + r.billed, collected: a.collected + r.collected, netBalance: a.netBalance + r.netBalance,
    }),
    { cashBilled: 0, cashCollected: 0, mpesaBilled: 0, mpesaCollected: 0, billed: 0, collected: 0, netBalance: 0 },
  );
  const Variance = ({ v }: { v: number }) => (
    <span className={`font-medium ${v < 0 ? 'text-red-600' : v > 0 ? 'text-green-700' : 'text-gray-500'}`}>{signed(v)}</span>
  );

  // ── Unpaid bills ──
  const bills = (data.unpaidBills ?? []).filter((b) => facs.includes(b.facility));

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-16 pt-8">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-gray-900">PaaS Network Overview</h1>
            <p className="mt-0.5 text-sm text-gray-500">{data.monthLabel} · {isAll ? 'All facilities' : facility}</p>
          </div>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Updated {data.generatedAt}
          </span>
        </div>

        {/* Facility filter — applies to every section */}
        <div className="sticky top-14 z-[5] -mx-4 mb-2 overflow-x-auto bg-gray-50/95 px-4 py-2 backdrop-blur">
          <div className="flex gap-1.5">
            {[ALL, ...data.allFacilities].map((f) => {
              const active = facility === f;
              return (
                <button
                  key={f}
                  onClick={() => setFacility(f)}
                  className={`flex shrink-0 items-center rounded-full border px-3 py-1 text-xs transition ${
                    active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {f !== ALL && <span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: colorOf(f) }} />}
                  {f === ALL ? 'All facilities' : shortName(f)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── COMMERCIAL ──────────────────────────────────── */}
        <Section title="Commercial" sub="All revenue is net of discounts. Gross profit = net revenue − cost of goods sold." />

        <Label>{isAll ? 'Network' : shortName(facility)} month-to-date</Label>
        <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: 'Net revenue', value: fmt(scopeNet), sub: `KSh after ${fmt(scopeDiscount)} discounts (${scopeGross ? Math.round((scopeDiscount / scopeGross) * 1000) / 10 : 0}%)` },
            { label: 'Gross profit', value: fmt(scopeProfit), sub: `${scopeMargin}% margin on net revenue`, accent: true },
            { label: 'Avg net revenue / day', value: fmt(scopeAvgDaily), sub: `KSh · ${daysTraded} completed day${daysTraded === 1 ? '' : 's'}` },
            { label: 'Projected net revenue', value: fmt(scopeProjected), sub: `KSh · avg × ${data.network.daysInMonth} days`, accent: true },
          ].map((card) => (
            <div key={card.label} className={`rounded-lg bg-gray-100 p-3.5 ${card.accent ? 'border-l-[3px] border-green-600' : ''}`}>
              <p className="mb-1 text-[11px] text-gray-500">{card.label}</p>
              <p className={`text-xl font-medium ${card.accent ? 'text-green-700' : 'text-gray-900'}`}>{card.value}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── COMMERCIAL cont. — per-facility summary ─── */}
        <Label>Per-facility commercial summary</Label>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>Facility</th>
                <th className={thR}>Net revenue</th>
                <th className={thR}>Discounts</th>
                <th className={thR}>Gross profit</th>
                <th className={thR}>GP margin</th>
                <th className={thR}>Avg net/day</th>
                <th className={thR}>Projected</th>
              </tr>
            </thead>
            <tbody>
              {facs.map((fac, i) => {
                const s = facilitySummary[fac];
                return (
                  <tr key={fac} className={zebra(i)}>
                    <td className={`${td} font-medium text-gray-800`}><Dot color={colorOf(fac)} />{fac}</td>
                    <td className={`${tdR} font-medium text-gray-900`}>{fmt(s.net)}</td>
                    <td className={`${tdR} text-gray-700`}>{fmt(s.discountAmt)} <span className="text-[11px] text-gray-400">{s.discountPct}%</span></td>
                    <td className={`${tdR} font-medium text-green-700`}>{fmt(s.grossProfit)}</td>
                    <td className={`${tdR} text-gray-700`}>{s.marginPct}%</td>
                    <td className={`${tdR} text-gray-700`}>{fmt(s.avgDaily)}</td>
                    <td className={`${tdR} font-medium text-gray-800`}>{fmt(s.projected)}</td>
                  </tr>
                );
              })}
              {facs.length > 1 && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                  <td className={`${td} text-gray-900`}>Total</td>
                  <td className={`${tdR} text-gray-900`}>{fmt(scopeNet)}</td>
                  <td className={`${tdR} text-gray-900`}>{fmt(scopeDiscount)}</td>
                  <td className={`${tdR} text-green-700`}>{fmt(scopeProfit)}</td>
                  <td className={`${tdR} text-gray-900`}>{scopeMargin}%</td>
                  <td className={`${tdR} text-gray-900`}>{fmt(scopeAvgDaily)}</td>
                  <td className={`${tdR} text-gray-900`}>{fmt(scopeProjected)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Stacked chart */}
        <Label>Daily net revenue {isAll ? 'by facility' : `— ${shortName(facility)}`}</Label>
        {isAll && (
          <div className="mb-3 flex flex-wrap gap-3">
            {facs.map((fac) => (
              <span key={fac} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(fac) }} />
                {shortName(fac)}
                <span className="text-gray-400">{facilitySummary[fac].marginPct}%</span>
              </span>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="relative h-80 w-full">
            <canvas ref={stackRef} role="img" aria-label="Stacked bar chart of daily net revenue per facility this month." />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Hover any bar to see net revenue and gross margin per facility</p>
        </div>

        {/* This month vs previous months */}
        <Label>This month vs average of last 3 full months</Label>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th} rowSpan={2}>Facility</th>
                <th className="border-l border-gray-100 px-4 pt-3 text-center" colSpan={3}>Avg net revenue / day (KSh)</th>
                <th className="border-l border-gray-100 px-4 pt-3 text-center" colSpan={3}>GP margin</th>
                <th className={`${thR} border-l border-gray-100`} rowSpan={2}>Baseline</th>
              </tr>
              <tr className={headRow}>
                <th className={`${thR} border-l border-gray-100`}>This month</th>
                <th className={thR}>3-mo avg</th>
                <th className={thR}>Change</th>
                <th className={`${thR} border-l border-gray-100`}>This month</th>
                <th className={thR}>3-mo avg</th>
                <th className={thR}>Change</th>
              </tr>
            </thead>
            <tbody>
              {facs.map((fac, i) => {
                const c = data.comparison[fac];
                return (
                  <tr key={fac} className={zebra(i)}>
                    <td className={`${td} font-medium text-gray-800`}><Dot color={colorOf(fac)} />{fac}</td>
                    <td className={`${tdR} border-l border-gray-100 font-medium text-gray-900`}>{fmt(c.thisAvgDaily)}</td>
                    <td className={`${tdR} text-gray-700`}>{c.prevAvgDaily == null ? '—' : fmt(c.prevAvgDaily)}</td>
                    <td className={tdR}><Change value={c.prevAvgDaily ? ((c.thisAvgDaily - c.prevAvgDaily) / c.prevAvgDaily) * 100 : null} /></td>
                    <td className={`${tdR} border-l border-gray-100 font-medium text-gray-900`}>{c.thisMargin}%</td>
                    <td className={`${tdR} text-gray-700`}>{c.prevMargin == null ? '—' : `${c.prevMargin}%`}</td>
                    <td className={tdR}><Change value={c.prevMargin == null ? null : c.thisMargin - c.prevMargin} unit=" pts" /></td>
                    <td className={`${tdR} border-l border-gray-100 text-[11px] text-gray-500`}>
                      {baselineLabel(c.baselineMonths)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── RECONCILIATION ─────────────────────────────── */}
        <Section title="Payments reconciliation" sub="Month to date · billed vs collected, from the Metabase reconciliation table. Negative = collected less than billed." />
        {!recon ? <Unavailable what="the reconciliation table" /> : (
          <>
            <div className={tableWrap}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={headRow}>
                    <th className={th} rowSpan={2}>Facility</th>
                    <th className="border-l border-gray-100 px-4 pt-3 text-center" colSpan={3}>Cash (KSh)</th>
                    <th className="border-l border-gray-100 px-4 pt-3 text-center" colSpan={3}>M-Pesa (KSh)</th>
                    <th className="border-l border-gray-100 px-4 pt-3 text-center" colSpan={3}>Total (KSh)</th>
                  </tr>
                  <tr className={headRow}>
                    {['Billed', 'Collected', 'Variance', 'Billed', 'Collected', 'Variance', 'Billed', 'Collected', 'Net balance'].map((h, i) => (
                      <th key={i} className={`${thR} ${i % 3 === 0 ? 'border-l border-gray-100' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reconRows.map((r, i) => (
                    <tr key={r.facility} className={zebra(i)}>
                      <td className={`${td} font-medium text-gray-800`}><Dot color={colorOf(r.facility)} />{shortName(r.facility)}</td>
                      <td className={`${tdR} border-l border-gray-100 text-gray-700`}>{fmt(r.cashBilled)}</td>
                      <td className={`${tdR} text-gray-700`}>{fmt(r.cashCollected)}</td>
                      <td className={tdR}><Variance v={r.cashCollected - r.cashBilled} /></td>
                      <td className={`${tdR} border-l border-gray-100 text-gray-700`}>{fmt(r.mpesaBilled)}</td>
                      <td className={`${tdR} text-gray-700`}>{fmt(r.mpesaCollected)}</td>
                      <td className={tdR}><Variance v={r.mpesaCollected - r.mpesaBilled} /></td>
                      <td className={`${tdR} border-l border-gray-100 text-gray-700`}>{fmt(r.billed)}</td>
                      <td className={`${tdR} text-gray-700`}>{fmt(r.collected)}</td>
                      <td className={tdR}><Variance v={r.netBalance} /></td>
                    </tr>
                  ))}
                  {reconRows.length > 1 && (
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                      <td className={`${td} text-gray-900`}>Total</td>
                      <td className={`${tdR} border-l border-gray-100`}>{fmt(reconTotal.cashBilled)}</td>
                      <td className={tdR}>{fmt(reconTotal.cashCollected)}</td>
                      <td className={tdR}><Variance v={reconTotal.cashCollected - reconTotal.cashBilled} /></td>
                      <td className={`${tdR} border-l border-gray-100`}>{fmt(reconTotal.mpesaBilled)}</td>
                      <td className={tdR}>{fmt(reconTotal.mpesaCollected)}</td>
                      <td className={tdR}><Variance v={reconTotal.mpesaCollected - reconTotal.mpesaBilled} /></td>
                      <td className={`${tdR} border-l border-gray-100`}>{fmt(reconTotal.billed)}</td>
                      <td className={tdR}>{fmt(reconTotal.collected)}</td>
                      <td className={tdR}><Variance v={reconTotal.netBalance} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {isAll && reconUnattributed.some((r) => r.collected) && (
              <p className="-mt-4 mb-6 text-[11px] text-gray-400">
                Plus {reconUnattributed.map((r) => `KSh ${fmt(r.collected)} collected under “${r.facility}”`).join(', ')} — not matched to a facility.
              </p>
            )}
          </>
        )}

        {/* ── M-PESA CODE CHECK ─────────────────────────── */}
        <Section
          title="M-Pesa code check"
          sub="Last 8 days · every bill payment should carry its own M-Pesa code that is in the paybill and covers the bill. Click a cell to see which bills and which staff."
        />
        <CodeCheckSection state={codeCheck} onRetry={loadCodeCheck} scope={facs} shortName={shortName} />

        {/* ── DISCOUNTS ──────────────────────────────────── */}
        <Section title="Discounts" sub="Daily discounts per facility. Click any amount to see which staff gave it." />
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>Date</th>
                {facs.map((f) => <th key={f} className={thR}><Dot color={colorOf(f)} />{shortName(f)}</th>)}
                {facs.length > 1 && <th className={thR}>Total</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b-2 border-gray-200 bg-gray-50 font-medium">
                <td className={`${td} text-gray-900`}>This month</td>
                {facs.map((f) => (
                  <td key={f} className={tdR}>
                    <button onClick={() => openDrill(f, '')} className="text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-700">
                      {fmt(facilitySummary[f].discountAmt)}
                    </button>
                    <span className="ml-1 text-[11px] font-normal text-gray-400">{facilitySummary[f].discountPct}%</span>
                  </td>
                ))}
                {facs.length > 1 && <td className={`${tdR} text-gray-900`}>{fmt(scopeDiscount)}</td>}
              </tr>
              {datesDesc.map((d, i) => {
                const rowTotal = facs.reduce((s, f) => s + discountOn(f, d), 0);
                return (
                  <tr key={d} className={zebra(i)}>
                    <td className={`${td} text-gray-600`}>{dayLabel(d)}</td>
                    {facs.map((f) => {
                      const v = discountOn(f, d);
                      return (
                        <td key={f} className={tdR}>
                          {v ? (
                            <button onClick={() => openDrill(f, d)} className="text-gray-700 underline decoration-gray-200 underline-offset-2 hover:decoration-gray-700">
                              {fmt(v)}
                            </button>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    {facs.length > 1 && <td className={`${tdR} font-medium text-gray-800`}>{rowTotal ? fmt(rowTotal) : '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Staff drill-down */}
        <div ref={drillRef} className="scroll-mt-28">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-widest text-gray-400">Discounts by staff</p>
            <select
              value={drillFacility}
              onChange={(e) => setDrillFacility(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
            >
              {facs.map((f) => <option key={f} value={f}>{shortName(f)}</option>)}
            </select>
            <select
              value={drillDate}
              onChange={(e) => setDrillDate(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
            >
              <option value="">Whole month</option>
              {datesDesc.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            </select>
          </div>
          {!staffDaily || !staffMonth ? <Unavailable what="staff discounts" /> : (
            <>
              <div className={tableWrap}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={headRow}>
                      <th className={th}>Staff</th>
                      <th className={thR}>Discount (KSh)</th>
                      <th className={thR}>Bills discounted</th>
                      <th className={thR}>{drillDate ? 'Value of discounted lines' : 'Gross sales'}</th>
                      <th className={thR}>Discount %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillRows.filter((r) => drillDate || r.discount).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-gray-400">No discounts {drillDate ? `on ${dayLabel(drillDate)}` : 'this month'}.</td></tr>
                    )}
                    {drillRows.filter((r) => drillDate || r.discount).map((r, i) => (
                      <tr key={r.staff} className={zebra(i)}>
                        <td className={`${td} font-medium text-gray-800`}>{r.staff}</td>
                        <td className={`${tdR} font-medium text-gray-900`}>{fmt(r.discount)}</td>
                        <td className={`${tdR} text-gray-700`}>{r.bills}</td>
                        <td className={`${tdR} text-gray-700`}>{fmt(r.base)}</td>
                        <td className={`${tdR} text-gray-700`}>{r.base ? Math.round((r.discount / r.base) * 1000) / 10 : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!drillDate && drillStaffNames.length > 0 && (
                <>
                  <Label>{shortName(drillFacility)} — daily discounts per staff member</Label>
                  <div className={tableWrap}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={headRow}>
                          <th className={th}>Date</th>
                          {drillStaffNames.map((s) => <th key={s} className={thR}>{s}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {datesDesc.map((d, i) => (
                          <tr key={d} className={zebra(i)}>
                            <td className={`${td} text-gray-600`}>{dayLabel(d)}</td>
                            {drillStaffNames.map((s) => {
                              const v = staffDayDiscount(s, d);
                              return <td key={s} className={`${tdR} ${v ? 'text-gray-800' : 'text-gray-300'}`}>{v ? fmt(v) : '—'}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ── MISSED SALES ───────────────────────────────── */}
        <Section
          title="Missed sales"
          sub="Entries logged by pharmacy staff · number of missed sales and estimated lost sale value (KSh). Entries without a matched product have no value estimate."
        />
        {!missed ? <Unavailable what="missed sales" /> : (
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>Date</th>
                  {facs.map((f) => <th key={f} className={thR}><Dot color={colorOf(f)} />{shortName(f)}</th>)}
                  {facs.length > 1 && <th className={thR}>Total</th>}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-gray-200 bg-gray-50 font-medium">
                  <td className={`${td} text-gray-900`}>This month</td>
                  {facs.map((f) => <td key={f} className={tdR}><MissedCell m={missedMonth(f)} /></td>)}
                  {facs.length > 1 && (
                    <td className={tdR}>
                      <MissedCell m={facs.map(missedMonth).reduce((a, m) => ({ count: a.count + m.count, value: a.value + m.value }), { count: 0, value: 0 })} />
                    </td>
                  )}
                </tr>
                {missedDates.length === 0 && (
                  <tr><td colSpan={facs.length + 2} className="px-4 py-4 text-center text-xs text-gray-400">No missed sales logged this month.</td></tr>
                )}
                {missedDates.map((d, i) => {
                  const row = facs.map((f) => missedAt(f, d));
                  const tot = row.reduce((a, m) => ({ count: a.count + (m?.count ?? 0), value: a.value + (m?.value ?? 0) }), { count: 0, value: 0 });
                  return (
                    <tr key={d} className={zebra(i)}>
                      <td className={`${td} text-gray-600`}>{dayLabel(d)}</td>
                      {row.map((m, j) => <td key={facs[j]} className={tdR}><MissedCell m={m} /></td>)}
                      {facs.length > 1 && <td className={tdR}><MissedCell m={tot} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── UNPAID & PARTIALLY PAID BILLS ──────────────── */}
        <Section
          title="Unpaid & partially paid bills"
          sub={`Bills created since ${dayLabel(data.unpaidBillsFrom)} with an outstanding balance, largest first.`}
        />
        {!data.unpaidBills ? <Unavailable what="unpaid bills" /> : bills.length === 0 ? (
          <p className="mb-6 rounded-lg border border-gray-100 bg-white px-4 py-4 text-center text-xs text-gray-400">
            No unpaid or partially paid bills in the last 3 days.
          </p>
        ) : (
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>Facility</th>
                  <th className={th}>Bill</th>
                  <th className={thR}>Balance</th>
                  <th className={thR}>Paid / payable</th>
                  <th className={th}>Status</th>
                  <th className={th}>Created</th>
                  <th className={th}>Staff</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b, i) => (
                    <tr key={`${b.facility}-${b.order}`} className={zebra(i)}>
                      <td className={`${td} font-medium text-gray-800`}><Dot color={colorOf(b.facility)} />{shortName(b.facility)}</td>
                      <td className={`${td} font-mono text-xs text-gray-700`} title={b.items.join(', ')}>
                        {b.order}
                        <p className="max-w-[14rem] truncate font-sans text-[11px] text-gray-400">{b.items.join(', ')}</p>
                      </td>
                      <td className={`${tdR} font-medium text-red-600`}>{fmt(b.balance)}</td>
                      <td className={`${tdR} text-gray-600`}>{fmt(b.paid)} / {fmt(b.payable)}</td>
                      <td className={td}>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${b.status === 'Unpaid' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className={`${td} text-gray-600`}>
                        {new Date(b.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className={`${td} text-gray-600`}>{b.staff}</td>
                    </tr>
                ))}
                {bills.length > 1 && (
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                    <td className={`${td} text-gray-900`} colSpan={2}>Total outstanding · {bills.length} bills</td>
                    <td className={`${tdR} text-red-600`}>{fmt(bills.reduce((s, b) => s + b.balance, 0))}</td>
                    <td className={`${tdR} text-gray-600`}>{fmt(bills.reduce((s, b) => s + b.paid, 0))} / {fmt(bills.reduce((s, b) => s + b.payable, 0))}</td>
                    <td colSpan={3} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── INVENTORY ──────────────────────────────────── */}
        <Section title="Inventory" />

        <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-100 p-3.5">
            <p className="mb-1 text-[11px] text-gray-500">{isAll ? 'Total network inventory value' : 'Inventory value'}</p>
            <p className="text-xl font-medium text-gray-900">{fmt(facs.reduce((s, f) => s + (data.inventory.inventoryByFacility[f] ?? 0), 0))}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · current stock at buying price</p>
          </div>
          <div className="rounded-lg border-l-[3px] border-green-600 bg-gray-100 p-3.5">
            <p className="mb-1 text-[11px] text-gray-500">{isAll ? 'Total monthly restock value' : 'Monthly restock value'}</p>
            <p className="text-xl font-medium text-green-700">{fmt(facs.reduce((s, f) => s + (data.inventory.restockByFacility[f] ?? 0), 0))}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">KSh · stock received this month</p>
          </div>
        </div>

        {isAll && (
          <>
            <Label>Inventory & restock per facility</Label>
            <div className={tableWrap}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={headRow}>
                    <th className={th}>Facility</th>
                    <th className={thR}>Inventory value (KSh)</th>
                    <th className={thR}>Monthly restock (KSh)</th>
                  </tr>
                </thead>
                <tbody>
                  {facs.map((fac, i) => (
                    <tr key={fac} className={zebra(i)}>
                      <td className={`${td} font-medium text-gray-800`}><Dot color={colorOf(fac)} />{fac}</td>
                      <td className={`${tdR} text-gray-700`}>{fmt(data.inventory.inventoryByFacility[fac] ?? 0)}</td>
                      <td className={`${tdR} text-gray-700`}>{fmt(data.inventory.restockByFacility[fac] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── PRODUCTS ───────────────────────────────────── */}
        <Section title="Products" />

        {/* Top 20 products */}
        <Label>Top 20 products this month — {isAll ? 'all facilities' : shortName(facility)}</Label>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>#</th>
                <th className={th}>Product</th>
                <th className={thR}>Units sold</th>
                <th className={thR}>Net revenue (KSh)</th>
                <th className={thR}>GP margin</th>
              </tr>
            </thead>
            <tbody>
              {(facilityTopState === 'loading' || facilityTopState === 'error') && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-gray-400">
                  {facilityTopState === 'loading' ? 'Loading products…' : 'Couldn’t load products for this facility.'}
                </td></tr>
              )}
              {topProducts.map((p, i) => (
                <tr key={p.sku || p.product} className={zebra(i)}>
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

        <p className="mt-10 text-center text-[11px] text-gray-400">
          Generated automatically · AfyaNzima Pharmacy as a Service
        </p>
      </div>
    </main>
  );
}
