'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCheckData, CodeCheckIssue } from '@/lib/dashboard/code-check';

/**
 * "M-Pesa code check" — daily view of cashless compliance for the overview and
 * facility dashboards. A status line per facility, a facility × day grid of
 * problems, and a drill-down listing the problem bills and who entered them.
 */

const fmt = (n: number) => Math.round(n).toLocaleString();
const ALL_DAYS = '';
const NO_BILL = 'Till payment with no bill';

function dayLabel(d: string, today: string): string {
  if (d === today) return 'Today';
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

function longDay(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "2026-10-19T11:49:32" → "19 Oct 11:49" (already Nairobi time). */
function syncLabel(ts: string | null): string {
  if (!ts) return '—';
  const [d, t] = ts.split('T');
  return `${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ${t.slice(0, 5)}`;
}

const ISSUE_STYLE: Record<string, string> = {
  'Code used twice':       'bg-red-50 text-red-700',
  'Code not in M-Pesa':    'bg-red-50 text-red-700',
  'Taken in cash':         'bg-red-50 text-red-700',
  'Paid less than billed': 'bg-amber-50 text-amber-800',
  [NO_BILL]:               'bg-amber-50 text-amber-800',
  'Code typo':             'bg-gray-100 text-gray-600',
};

function cellTone(problems: number): string {
  if (problems === 0) return 'bg-green-50 text-green-800 hover:bg-green-100';
  if (problems <= 3) return 'bg-amber-50 text-amber-900 hover:bg-amber-100';
  return 'bg-red-50 text-red-800 hover:bg-red-100';
}

const th = 'px-3 py-3 whitespace-nowrap';
const thR = `${th} text-right`;
const td = 'px-3 py-2.5 whitespace-nowrap';
const tdR = `${td} text-right`;
const headRow = 'border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400';
const tableWrap = 'mb-6 overflow-x-auto rounded-xl border border-gray-100 bg-white';
const zebra = (i: number) => `border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`;

export default function CodeCheckSection({
  state,
  onRetry,
  scope,
  shortName = (s) => s,
}: {
  state: CodeCheckData | 'loading' | 'error' | null;
  onRetry: () => void;
  /** Facilities to show (the page's facility filter); all of the card's if omitted. */
  scope?: string[];
  shortName?: (name: string) => string;
}) {
  const data = state && typeof state === 'object' ? state : null;
  const today = data?.dates[data.dates.length - 1] ?? '';
  const yesterday = data?.dates[data.dates.length - 2] ?? '';

  const facs = useMemo(() => {
    if (!data) return [];
    const names = data.facilities.map((f) => f.facility).sort();
    return scope ? names.filter((f) => scope.includes(f)) : names;
  }, [data, scope]);

  const [drillFac, setDrillFac] = useState('');
  const [drillDate, setDrillDate] = useState<string>(ALL_DAYS);
  const drillRef = useRef<HTMLDivElement>(null);

  // Default the drill-down to yesterday, the last complete day.
  useEffect(() => {
    if (data && !drillDate) setDrillDate(yesterday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    if (facs.length && !facs.includes(drillFac)) setDrillFac(facs[0]);
  }, [facs, drillFac]);

  if (state === 'loading' || state === null) {
    return <p className="mb-6 rounded-lg border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500">Checking M-Pesa codes against the paybill… this takes about 20 seconds.</p>;
  }
  if (state === 'error' || !data) {
    return (
      <p className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Couldn&apos;t load the M-Pesa code check from Metabase. The rest of the dashboard is unaffected.
        <button onClick={onRetry} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100">Retry</button>
      </p>
    );
  }
  if (!facs.length) {
    return <p className="mb-6 text-xs text-gray-400">This facility isn&apos;t on the M-Pesa code check yet.</p>;
  }

  const daysDesc = [...data.dates].reverse();
  const facInfo = (f: string) => data.facilities.find((x) => x.facility === f);
  const staffDays = (f: string, d?: string) => data.staffDays.filter((r) => r.facility === f && (!d || r.date === d));
  const issuesOf = (f: string, d?: string) => data.issues.filter((r) => r.facility === f && (!d || r.date === d));
  const cell = (f: string, d: string) => {
    const sd = staffDays(f, d);
    const is = issuesOf(f, d);
    const noBill = is.filter((r) => r.issue === NO_BILL);
    return {
      lines: sd.reduce((s, r) => s + r.lines, 0),
      exceptions: sd.reduce((s, r) => s + r.exceptions, 0),
      noBillCount: noBill.length,
      noBillKes: noBill.reduce((s, r) => s + r.kes, 0),
    };
  };

  function open(f: string, d: string) {
    setDrillFac(f);
    setDrillDate(d);
    drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Drill-down ──
  const drillDay = drillDate || undefined;
  const drillInfo = facInfo(drillFac);
  const isCashless = (d: string) => !!drillInfo?.cashlessSince && d >= drillInfo.cashlessSince;
  const staffRows = Object.values(
    staffDays(drillFac, drillDay).reduce<Record<string, { staff: string; lines: number; exceptions: number; cash: number }>>((acc, r) => {
      const a = (acc[r.staff] ??= { staff: r.staff, lines: 0, exceptions: 0, cash: 0 });
      a.lines += r.lines;
      a.exceptions += r.exceptions;
      if (isCashless(r.date)) a.cash += r.cashLines;
      return acc;
    }, {}),
  ).sort((a, b) => b.exceptions - a.exceptions || b.lines - a.lines);
  const showCash = staffRows.some((r) => r.cash > 0);
  // Bill-side problems first (staff can fix those), then unclaimed receipts.
  const drillIssues: CodeCheckIssue[] = issuesOf(drillFac, drillDay).sort(
    (a, b) => Number(a.issue === NO_BILL) - Number(b.issue === NO_BILL)
      || b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
  );
  const issueCounts = drillIssues.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.issue]: (acc[r.issue] ?? 0) + 1 }), {});

  const lagging = facs
    .map((f) => facInfo(f))
    .filter((f) => f?.feedSyncedTo && data.emrSyncedTo && f.feedSyncedTo < data.emrSyncedTo);

  return (
    <>
      {/* Status per facility */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {facs.map((f) => {
          const since = facInfo(f)?.cashlessSince;
          if (!since) {
            return (
              <span key={f} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">
                {shortName(f)} · not cashless yet
              </span>
            );
          }
          const recentCash = [yesterday, today]
            .filter((d) => d >= since)
            .map((d) => ({ d, n: staffDays(f, d).reduce((s, r) => s + r.cashLines, 0) }))
            .filter((x) => x.n > 0);
          if (recentCash.length) {
            const last = recentCash[recentCash.length - 1];
            return (
              <button key={f} onClick={() => open(f, last.d)} className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
                {shortName(f)} · ⚠ back to cash: {last.n} cash bill{last.n === 1 ? '' : 's'} {last.d === today ? 'today' : 'yesterday'}
              </button>
            );
          }
          return (
            <span key={f} className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-800">
              {shortName(f)} · cashless since {longDay(since)} ✓
            </span>
          );
        })}
      </div>

      {/* Facility × day grid */}
      <div className={tableWrap}>
        <table className="w-full text-sm">
          <thead>
            <tr className={headRow}>
              <th className={th}>Facility</th>
              {daysDesc.map((d) => (
                <th key={d} className={`${th} text-center`}>
                  {dayLabel(d, today)}
                  {d === today && <span className="block text-[10px] normal-case tracking-normal text-gray-400">to {syncLabel(data.emrSyncedTo).split(' ').pop()}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facs.map((f, i) => (
              <tr key={f} className={zebra(i)}>
                <td className={`${td} font-medium text-gray-800`}>{shortName(f)}</td>
                {daysDesc.map((d) => {
                  const c = cell(f, d);
                  if (!c.lines && !c.noBillCount) return <td key={d} className={`${td} text-center text-gray-300`}>—</td>;
                  const problems = c.exceptions + c.noBillCount;
                  const selected = drillFac === f && drillDate === d;
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      <button
                        onClick={() => open(f, d)}
                        title={`${c.exceptions} problem bill payment${c.exceptions === 1 ? '' : 's'} out of ${c.lines}${c.noBillCount ? ` · ${c.noBillCount} till payment${c.noBillCount === 1 ? '' : 's'} (KSh ${fmt(c.noBillKes)}) with no bill` : ''}`}
                        className={`w-full rounded-md px-2 py-1.5 leading-tight transition ${cellTone(problems)} ${selected ? 'ring-2 ring-gray-900' : ''}`}
                      >
                        <span className="font-medium">{c.exceptions}</span>
                        <span className="text-[11px] opacity-60"> / {c.lines}</span>
                        {c.noBillCount > 0 && <span className="block text-[10px] opacity-80">KSh {fmt(c.noBillKes)} no bill</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="-mt-4 mb-6 text-[11px] text-gray-400">
        Cells show problem bill payments / bill payments that day, plus M-Pesa money that reached the till without a bill. Green = none, amber = 1–3, red = 4+.
        Bills are checked up to the EMR sync at {syncLabel(data.emrSyncedTo)}
        {lagging.length > 0 && <> · {lagging.map((f) => `${shortName(f!.facility)}'s paybill feed is synced to ${syncLabel(f!.feedSyncedTo)}`).join(', ')}, so its newer bills are checked once that catches up</>}.
      </p>

      {/* Drill-down */}
      <div ref={drillRef} className="scroll-mt-28">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400">Problems by staff</p>
          {facs.length > 1 && (
            <select value={drillFac} onChange={(e) => setDrillFac(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
              {facs.map((f) => <option key={f} value={f}>{shortName(f)}</option>)}
            </select>
          )}
          <select value={drillDate} onChange={(e) => setDrillDate(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
            <option value={ALL_DAYS}>Last 8 days</option>
            {daysDesc.map((d) => <option key={d} value={d}>{d === today ? 'Today' : longDay(d)}</option>)}
          </select>
        </div>

        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>Staff</th>
                <th className={thR}>Bill payments</th>
                <th className={thR}>Problems</th>
                <th className={thR}>Clean</th>
                {showCash && <th className={thR}>Taken in cash</th>}
              </tr>
            </thead>
            <tbody>
              {staffRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-gray-400">No bill payments recorded.</td></tr>
              )}
              {staffRows.map((r, i) => (
                <tr key={r.staff} className={zebra(i)}>
                  <td className={`${td} font-medium text-gray-800`}>{r.staff}</td>
                  <td className={`${tdR} text-gray-700`}>{fmt(r.lines)}</td>
                  <td className={`${tdR} font-medium ${r.exceptions ? 'text-red-600' : 'text-gray-400'}`}>{r.exceptions}</td>
                  <td className={`${tdR} text-gray-700`}>{r.lines ? Math.round(((r.lines - r.exceptions) / r.lines) * 1000) / 10 : 0}%</td>
                  {showCash && <td className={`${tdR} ${r.cash ? 'font-medium text-red-600' : 'text-gray-400'}`}>{r.cash}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <p className="mr-1 text-xs font-medium uppercase tracking-widest text-gray-400">
            {shortName(drillFac)} · {drillDate ? (drillDate === today ? 'today' : longDay(drillDate)) : 'last 8 days'}
          </p>
          {Object.entries(issueCounts).map(([k, n]) => (
            <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ISSUE_STYLE[k] ?? 'bg-gray-100 text-gray-600'}`}>{n} × {k}</span>
          ))}
        </div>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>{drillDate ? 'Time' : 'When'}</th>
                <th className={th}>Problem</th>
                <th className={th}>Bill</th>
                <th className={th}>Staff</th>
                <th className={thR}>KSh</th>
                <th className={th}>Code entered</th>
                <th className={th}>What we found</th>
              </tr>
            </thead>
            <tbody>
              {drillIssues.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-xs text-gray-400">No problems found.</td></tr>
              )}
              {drillIssues.map((r, i) => (
                <tr key={`${r.date}-${r.time}-${r.bill ?? r.code}-${i}`} className={zebra(i)}>
                  <td className={`${td} text-gray-600`}>{drillDate ? r.time : `${longDay(r.date)} ${r.time}`}</td>
                  <td className={td}><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ISSUE_STYLE[r.issue] ?? 'bg-gray-100 text-gray-600'}`}>{r.issue}</span></td>
                  <td className={`${td} font-mono text-xs text-gray-700`}>{r.bill ?? '—'}</td>
                  <td className={`${td} text-gray-700`}>{r.staff ?? '—'}</td>
                  <td className={`${tdR} font-medium text-gray-900`}>{fmt(r.kes)}</td>
                  <td className={`${td} max-w-[10rem] truncate font-mono text-xs text-gray-700`} title={r.code ?? ''}>{r.code ?? '—'}</td>
                  <td className="min-w-[16rem] px-3 py-2.5 text-xs text-gray-600">{r.detail ?? (r.issue === NO_BILL ? 'M-Pesa received but no bill uses this code' : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
