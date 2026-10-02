'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Date-range + product filter bar for the partner dashboard.
 *
 * Everything here is client-side. The dashboard already fetches the whole
 * current month at daily grain, so narrowing to a range is a filter over data
 * that's in the browser already — no refetch, no loading state.
 */

export type Filters = { from: string; to: string; product: string };

/**
 * Which range to land on after a month is loaded.
 *
 * Needed because two of the presets cross a month boundary: picking "Last
 * month", or "Today" while an old month is open, means fetching a different
 * month AND then selecting a range inside it. The intent has to survive the
 * refetch, so it travels with the month-change request.
 */
export type RangeIntent = 'full' | 'today' | 'last7';

/** First and last day of a month, clipped to `cap` (today) when given. */
export function monthRangeOf(prefix: string, cap?: string): { from: string; to: string } {
  const [y, m] = prefix.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${prefix}-01`;
  let to = `${prefix}-${String(days).padStart(2, '0')}`;
  if (cap && to > cap) to = cap;
  return { from, to };
}

/** The YYYY-MM immediately before the given one. */
export function previousMonth(prefix: string): string {
  const [y, m] = prefix.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Subsequence match, the way editors match file names: every character of the
 * query must appear in order, but not necessarily adjacently. "amx" finds
 * "AMOXICLAV". Falls back to plain substring scoring for ranking.
 */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().replace(/\s+/g, '');
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return i === n.length;
}

/** Lower is better. Exact prefix beats substring beats scattered subsequence. */
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h.startsWith(n)) return 0;
  const idx = h.indexOf(n);
  if (idx >= 0) return 1 + idx / 100;
  return 100 + h.length / 100;
}

export function rankProducts(products: string[], query: string, limit = 8): string[] {
  if (!query.trim()) return [];
  return products
    .filter((p) => fuzzyMatch(p, query))
    .sort((a, b) => score(a, query) - score(b, query))
    .slice(0, limit);
}

export default function DashboardFilters({
  monthStart,
  monthEnd,
  products,
  filters,
  onChange,
  resultCount,
  month,
  availableMonths,
  onWindow,
  monthLoading,
  currentMonth,
  today,
  dataStart,
}: {
  monthStart: string;
  monthEnd: string;
  products: string[];
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
  month: string;
  availableMonths: Array<{ value: string; label: string }>;
  onWindow: (w: { from: string; to: string } | { month: string }) => void;
  monthLoading: boolean;
  currentMonth: string;
  today: string;
  dataStart: string;
}) {
  const [query, setQuery] = useState(filters.product);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => rankProducts(products, query), [products, query]);

  // Keep the visible text in step when the filter is cleared from elsewhere.
  useEffect(() => {
    if (!filters.product) setQuery('');
  }, [filters.product]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  function pick(name: string) {
    setQuery(name);
    setOpen(false);
    onChange({ ...filters, product: name });
  }

  const isFiltered =
    filters.from !== monthStart || filters.to !== monthEnd || !!filters.product;

  const prev = previousMonth(currentMonth);
  const hasPrev = availableMonths.some((m) => m.value === prev);

  /** N days back from today, inclusive of today — may cross a month boundary. */
  const daysBack = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1));
    const iso = d.toISOString().slice(0, 10);
    return iso < dataStart ? dataStart : iso;
  };

  type Preset = {
    label: string;
    active: boolean;
    disabled?: boolean;
    title?: string;
    apply: () => void;
  };

  const curMonth = monthRangeOf(currentMonth, today);
  const prevMonth = monthRangeOf(prev);
  const last7From = daysBack(7);

  /** True when the loaded window and the visible range are both exactly this. */
  const showing = (from: string, to: string) =>
    monthStart === from && monthEnd === to && filters.from === from && filters.to === to;

  const presets: Preset[] = [
    {
      label: 'This month',
      active: showing(curMonth.from, curMonth.to),
      apply: () => onWindow({ month: currentMonth }),
    },
    {
      label: 'Last month',
      active: showing(prevMonth.from, prevMonth.to),
      disabled: !hasPrev,
      title: hasPrev ? undefined : 'No sales recorded for that month',
      apply: () => onWindow({ month: prev }),
    },
    {
      label: 'Last 7 days',
      active: showing(last7From, today),
      apply: () => onWindow({ from: last7From, to: today }),
    },
    {
      label: 'Today',
      active: showing(today, today),
      apply: () => onWindow({ from: today, to: today }),
    },
  ];

  return (
    <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Month sits first: it's the only control that refetches, and the
            date pickers below are bounded by whichever month is chosen. */}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Month
          </label>
          <select
            value={month}
            disabled={monthLoading}
            onChange={(e) => onWindow({ month: e.target.value })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#066DB7] disabled:opacity-50"
          >
            {availableMonths.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-400">
            From
          </label>
          <input
            type="date"
            value={filters.from}
            min={dataStart}
            max={filters.to}
            disabled={monthLoading}
            onChange={(e) => {
              const from = e.target.value;
              if (!from) return;
              // Outside the loaded window means the browser doesn't have those
              // rows — fetch them rather than silently showing nothing.
              if (from < monthStart) onWindow({ from, to: filters.to });
              else onChange({ ...filters, from });
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#066DB7] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-400">
            To
          </label>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            max={today}
            disabled={monthLoading}
            onChange={(e) => {
              const to = e.target.value;
              if (!to) return;
              if (to > monthEnd) onWindow({ from: filters.from, to });
              else onChange({ ...filters, to });
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#066DB7] disabled:opacity-50"
          />
        </div>

        <div className="relative min-w-[16rem] flex-1" ref={boxRef}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Product
          </label>
          <input
            type="text"
            value={query}
            placeholder="Search products…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
              // Clearing the box clears the filter; otherwise the filter only
              // applies once a product is actually picked from the list.
              if (!e.target.value) onChange({ ...filters, product: '' });
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(suggestions[highlight]);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#066DB7]"
          />
          {open && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {suggestions.map((name, i) => (
                <li key={name}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(name)}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      i === highlight ? 'bg-gray-50 text-[#066DB7]' : 'text-gray-700'
                    }`}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.apply}
              disabled={p.disabled || monthLoading}
              title={p.title}
              className={`rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                p.active
                  ? 'border-[#066DB7] text-[#066DB7]'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isFiltered && (
        <div className="mt-3 flex items-center gap-3 border-t border-gray-50 pt-3 text-xs text-gray-500">
          <span>
            Showing {filters.from === filters.to ? filters.from : `${filters.from} to ${filters.to}`}
            {filters.product && ` · ${filters.product}`}
            {` · ${resultCount} row${resultCount === 1 ? '' : 's'}`}
          </span>
          <button
            onClick={() => {
              setQuery('');
              onChange({ from: monthStart, to: monthEnd, product: '' });
            }}
            className="underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
