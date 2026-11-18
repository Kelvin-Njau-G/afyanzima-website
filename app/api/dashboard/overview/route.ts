import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { checkDashboardPassword } from '@/lib/facilities';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { portalDb } from '@/lib/portal/db';
import { CODE_CHECK_CARD, parseCodeCheck } from '@/lib/dashboard/code-check';
import { unbilledQuery, parseUnbilled } from '@/lib/dashboard/unbilled';
import { readNetProfitConfig, projectNetProfit, type NetProfitRow } from '@/lib/dashboard/net-profit';

// A dozen-odd Metabase queries run per load; give them room on Vercel.
export const maxDuration = 60;

const BASE = process.env.METABASE_URL!.replace(/\/$/, '');
const MB_USER = process.env.METABASE_USER!;
const MB_PASS = process.env.METABASE_PASSWORD!;

type MbCol = { name: string; display_name: string; base_type: string };
type MbResult = { data: { cols: MbCol[]; rows: unknown[][] } };

function mbFetch(path: string, body?: object, token?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Metabase-Session'] = token;
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));

    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: body ? 'POST' : 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Find a column by display name or name. Exact matches win over substring
 * matches, so "Created By" and "Bill Item → Created At" don't collide.
 */
function findCol(cols: MbCol[], ...candidates: string[]): number {
  const norm = (s: string) => (s || '').toLowerCase().trim();
  for (const c of candidates.map(norm)) {
    const i = cols.findIndex((col) => norm(col.display_name) === c || norm(col.name) === c);
    if (i !== -1) return i;
  }
  for (const c of candidates.map(norm)) {
    const i = cols.findIndex((col) => norm(col.display_name).includes(c) || norm(col.name).includes(c));
    if (i !== -1) return i;
  }
  return -1;
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const round = (v: number) => Math.round(v);
const pct1 = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** YYYY-MM-DD in Nairobi — the server runs in UTC, the pharmacies don't. */
function nairobiDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);
}

function addDays(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ── Card 1788 (Base-Orders) query builders ────────────────────────────────────
// Every revenue figure on this page comes from one source, card 1788, so net
// revenue, discounts and gross profit always reconcile with each other.
//   Amount      = list price × qty (pre-discount, "gross")
//   Discount    = Amount − Sale_Amount
//   Sale_Amount = what the customer was charged (NET revenue)
//   Profit      = Sale_Amount − COGS (gross profit on NET revenue)

const F = {
  org:      ['field', 'Organization_Name', { 'base-type': 'type/Text' }],
  dept:     ['field', 'Department',        { 'base-type': 'type/Text' }],
  staff:    ['field', 'Staff',             { 'base-type': 'type/Text' }],
  order:    ['field', 'Order_Number',      { 'base-type': 'type/Text' }],
  product:  ['field', 'Product',           { 'base-type': 'type/Text' }],
  sku:      ['field', 'SKU',               { 'base-type': 'type/Text' }],
  amount:   ['field', 'Amount',            { 'base-type': 'type/Float' }],
  discount: ['field', 'Discount',          { 'base-type': 'type/Float' }],
  net:      ['field', 'Sale_Amount',       { 'base-type': 'type/Float' }],
  profit:   ['field', 'Profit',            { 'base-type': 'type/Float' }],
  qty:      ['field', 'Quantity',          { 'base-type': 'type/Float' }],
  time: (unit: string) => ['field', 'Cart_Time', { 'base-type': 'type/DateTimeWithLocalTZ', 'temporal-unit': unit }],
};

function ordersQuery(q: { from?: string; to?: string; org?: string; allDepts?: boolean; extra?: unknown[]; aggregation: unknown[]; breakout?: unknown[]; orderBy?: unknown[]; limit?: number }) {
  const filter: unknown[] = q.allDepts ? ['and', ['not-null', F.org]] : ['and', ['=', F.dept, 'Pharmacy']];
  if (q.from) filter.push(['>=', F.time('minute'), `${q.from}T00:00:00`]);
  if (q.to)   filter.push(['<',  F.time('minute'), `${q.to}T00:00:00`]);
  if (q.org)  filter.push(['=', F.org, q.org]);
  if (q.extra) filter.push(...q.extra);
  return {
    database: 5,
    type: 'query',
    query: {
      'source-table': 'card__1788',
      filter,
      aggregation: q.aggregation,
      ...(q.breakout ? { breakout: q.breakout } : {}),
      ...(q.orderBy ? { 'order-by': q.orderBy } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    },
  };
}

const topProducts = (from: string, to: string, org?: string) => ordersQuery({
  from, to, org,
  aggregation: [['sum', F.qty], ['sum', F.net], ['sum', F.profit]],
  breakout: [F.product, F.sku],
  orderBy: [['desc', ['aggregation', 1]]],
  limit: 20,
});

function parseTopProducts(res: MbResult | null) {
  return (res?.data?.rows ?? []).map((row) => ({
    product: row[0] as string,
    sku:     row[1] as string,
    qty:     round(num(row[2])),
    revenue: round(num(row[3])),
    margin:  num(row[3]) > 0 ? pct1(num(row[4]), num(row[3])) : 0,
  }));
}

/**
 * Missed-sales log (table 735, the source behind card 2801 "Missed Sales per
 * Month"). Its timestamps are 3 hours ahead, which card 2801 corrects with an
 * "Adjusted Time" expression — reused here so the daily buckets match Metabase.
 */
function missedSalesQuery(from: string, to: string) {
  const adjusted = (unit: string) => ['expression', 'Adjusted Time', { 'base-type': 'type/DateTimeWithLocalTZ', 'temporal-unit': unit }];
  return {
    database: 5,
    type: 'query',
    query: {
      'source-table': 735,
      expressions: {
        'Adjusted Time': ['datetime-subtract', ['field', 10461, { 'base-type': 'type/DateTimeWithLocalTZ' }], 3, 'hour'],
      },
      filter: ['and',
        ['>=', adjusted('minute'), `${from}T00:00:00`],
        ['<',  adjusted('minute'), `${to}T00:00:00`],
      ],
      aggregation: [['count'], ['sum', ['field', 10455, { 'base-type': 'type/Float' }]]], // estimated lost sale value
      breakout: [adjusted('day'), ['field', 10457, { 'base-type': 'type/Text' }]],       // pharmacy name
    },
  };
}

/** Run a query, but let one broken section fail without taking the page down. */
async function safe<T>(label: string, p: Promise<T>): Promise<T | null> {
  try {
    const r = await p;
    const err = (r as { error?: string })?.error;
    if (err) { console.error(`[overview] ${label}:`, err); return null; }
    return r;
  } catch (e) {
    console.error(`[overview] ${label}:`, e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  // The cross-facility overview is admin-only: it aggregates every partner's
  // numbers, so no partner account should ever reach it.
  const body = await req.json().catch(() => ({}));
  const password: string | undefined = body?.password;

  let authorised = false;

  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const { data: user } = await portalDb
      .from('portal_users')
      .select('role, is_active')
      .eq('id', session.sub)
      .maybeSingle();
    authorised = !!user && user.is_active && user.role === 'admin';
  }

  if (!authorised && process.env.PORTAL_LEGACY_PASSWORDS !== 'false' && password) {
    authorised = checkDashboardPassword(password);
  }

  if (!authorised) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  // The page shows a rolling window: the last WINDOW_DAYS completed days plus
  // today so far, so it is never empty on the 1st. The current calendar month is
  // still fetched in full for its month-end projection.
  const WINDOW_DAYS = 30;
  const todayStr    = nairobiDate();
  const monthPrefix = todayStr.slice(0, 7);
  const monthStart  = `${monthPrefix}-01`;
  const [yy, mm]    = monthPrefix.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthLabel  = new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const windowFrom  = addDays(todayStr, -WINDOW_DAYS);              // first of the 30 completed days
  const windowEnd   = addDays(todayStr, 1);                         // exclusive: includes today so far
  const fetchFrom   = monthStart < windowFrom ? monthStart : windowFrom;
  const billsFrom   = addDays(todayStr, -3);

  const auth = (await mbFetch('/api/session', { username: MB_USER, password: MB_PASS })) as { id: string };
  const token = auth.id;
  const dataset = (q: object) => mbFetch('/api/dataset', q, token) as Promise<MbResult>;
  const card    = (id: number) => mbFetch(`/api/card/${id}/query`, {}, token) as Promise<MbResult>;

  // The M-Pesa code check reads a Google Sheet and takes ~20s, so the page
  // asks for it separately once everything else has rendered.
  if (body?.codeCheck) {
    const res = await safe('code check', card(CODE_CHECK_CARD));
    const codeCheck = res ? parseCodeCheck(res) : null;
    return codeCheck
      ? NextResponse.json({ codeCheck })
      : NextResponse.json({ error: 'Code check unavailable' }, { status: 502 });
  }

  // A single facility's top products are fetched on demand, when the facility
  // filter is used — running all of them up front doubled the page load time.
  if (typeof body?.topProductsFor === 'string') {
    const res = await dataset(topProducts(windowFrom, todayStr, body.topProductsFor));
    return NextResponse.json({ topProducts: parseTopProducts(res) });
  }

  // Stock received per facility over the window (card 1782 = stock movements;
  // card 1661 is the same thing broken out per product and month).
  const restockQuery = {
    database: 5,
    type: 'query',
    query: {
      'source-table': 'card__1782',
      filter: ['and',
        ['=', ['field', 'stock_movement_type', { 'base-type': 'type/Text' }], 'Restock'],
        ['>=', ['field', 'stock_movement_date', { 'base-type': 'type/Date' }], windowFrom],
        ['<',  ['field', 'stock_movement_date', { 'base-type': 'type/Date' }], todayStr],
      ],
      aggregation: [['sum', ['field', 'movement_value', { 'base-type': 'type/Decimal' }]]],
      breakout: [['field', 'organization_name', { 'base-type': 'type/Text' }]],
    },
  };

  // Everything runs in parallel; card 1788 queries take ~10s each on BigQuery.
  const [dailyRes, networkTopRes, invByClassRes, restockRes, reconRes, staffDailyRes, staffMonthRes, missedRes, unpaidRes, historyRes, deptRes, unbilledRes] =
    await Promise.all([
      dataset(ordersQuery({
        from: fetchFrom, to: windowEnd,
        aggregation: [['sum', F.amount], ['sum', F.discount], ['sum', F.net], ['sum', F.profit]],
        breakout: [F.time('day'), F.org],
      })),
      dataset(topProducts(windowFrom, todayStr)),
      card(2507),                                   // inventory value by class
      safe('restock', dataset(restockQuery)),
      safe('reconciliation', card(3431)),           // revenue vs collections, month to date
      safe('staff discounts (daily)', dataset(ordersQuery({
        from: windowFrom, to: windowEnd,
        extra: [['!=', F.discount, 0]],
        aggregation: [['sum', F.discount], ['sum', F.amount], ['distinct', F.order]],
        breakout: [F.time('day'), F.org, F.staff],
        limit: 10000,
      }))),
      safe('staff discounts (window)', dataset(ordersQuery({
        from: windowFrom, to: todayStr,
        aggregation: [['sum', F.amount], ['sum', F.discount], ['distinct', F.order]],
        breakout: [F.org, F.staff],
      }))),
      safe('missed sales', dataset(missedSalesQuery(windowFrom, windowEnd))),
      safe('unpaid bills', card(2824)),
      // Every completed month, per facility: net revenue, gross profit and the
      // number of days that had sales.
      safe('history', dataset(ordersQuery({
        to: monthStart,
        aggregation: [['sum', F.net], ['sum', F.profit], ['distinct', F.time('day')], ['min', F.time('day')]],
        breakout: [F.time('month'), F.org],
        limit: 10000,
      }))),
      // Pharmacy share of everything billed, for scaling sales with no bill at
      // sites that also bill clinic services (Well Living).
      safe('departments', dataset(ordersQuery({
        from: windowFrom, to: todayStr, allDepts: true,
        aggregation: [['sum', F.net]],
        breakout: [F.org, F.dept],
      }))),
      safe('sales with no bill', dataset(unbilledQuery(fetchFrom))),
    ]);

  // Daily revenue per facility (billed pharmacy sales, card 1788)
  type DayFigures = { gross: number; discount: number; net: number; profit: number; unbilled: number };
  const byDate: Record<string, Record<string, Omit<DayFigures, 'unbilled'>>> = {};
  const activeFacilities = new Set<string>();
  for (const row of dailyRes.data.rows) {
    const d = String(row[0]).slice(0, 10);
    const fac = row[1] as string;
    if (!fac) continue;
    byDate[d] ??= {};
    byDate[d][fac] = { gross: num(row[2]), discount: num(row[3]), net: num(row[4]), profit: num(row[5]) };
    if (d >= windowFrom) activeFacilities.add(fac);
  }
  const allFacilities = Array.from(activeFacilities).sort();
  // Every calendar day from fetchFrom to today, so days with no sales show as zero.
  const allDays: string[] = [];
  for (let d = fetchFrom; d <= todayStr; d = addDays(d, 1)) allDays.push(d);
  const dates = allDays.filter((d) => d >= windowFrom);               // shown: 30 days + today
  const completed = dates.filter((d) => d < todayStr);                 // the 30 completed days
  const dateLabels = dates.map((d) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  );

  // Completed months per facility (also tells us when each facility started).
  const historyByFacility: Record<string, Array<[string, { net: number; profit: number; days: number; first: string }]>> = {};
  for (const row of historyRes?.data?.rows ?? []) {
    const fac = row[1] as string;
    if (!fac) continue;
    (historyByFacility[fac] ??= []).push([
      String(row[0]).slice(0, 7),
      { net: num(row[2]), profit: num(row[3]), days: num(row[4]), first: String(row[5] ?? '').slice(0, 10) },
    ]);
  }
  for (const h of Object.values(historyByFacility)) h.sort(([a], [b]) => a.localeCompare(b));

  // Sales with no bill (paybill receipts whose code is on no bill + cash banked beyond
  // cash billed), scaled to the pharmacy's share of billing at mixed clinic sites.
  const unbilled = parseUnbilled(unbilledRes);
  const pharmShare: Record<string, number> = {};
  {
    const tot: Record<string, { ph: number; all: number }> = {};
    for (const row of deptRes?.data?.rows ?? []) {
      const fac = row[0] as string;
      if (!fac) continue;
      const t = (tot[fac] ??= { ph: 0, all: 0 });
      t.all += num(row[2]);
      if (row[1] === 'Pharmacy') t.ph += num(row[2]);
    }
    for (const [fac, t] of Object.entries(tot)) pharmShare[fac] = t.all > 0 ? Math.min(1, t.ph / t.all) : 1;
  }
  const unbilledOn = (fac: string, d: string) => {
    const u = unbilled?.byFacility[fac]?.days[d];
    return u ? { mpesa: u.mpesa * (pharmShare[fac] ?? 1), cash: u.cash * (pharmShare[fac] ?? 1), n: u.mpesaN } : { mpesa: 0, cash: 0, n: 0 };
  };

  // ── Per-facility summary over the 30 completed days (all NET) ─────────────
  // Daily averages count every calendar day since the facility opened (closed
  // days are zero, not skipped), and use estimated sales = billed + no bill.
  // Projection for the calendar month = month so far (estimated) + the remaining
  // days at that daily average.
  type Summary = {
    gross: number; discountAmt: number; discountPct: number; net: number;
    grossProfit: number; marginPct: number;
    unbilledMpesa: number; unbilledMpesaN: number; unbilledCash: number; estSales: number;
    avgDaily: number; avgDailyBilled: number; daysOpen: number; daysTraded: number;
    monthEst: number; projected: number; startedOn: string | null; feedTo: string | null;
  };
  const facilitySummary: Record<string, Summary> = {};
  const daily: Record<string, DayFigures[]> = {};
  // Unrounded inputs for the net profit projection.
  const npInputs: Record<string, { monthBilled: number; billedPerDay: number; margin: number; monthNoBill: number; noBillPerDay: number }> = {};
  const monthDaysDone = allDays.filter((d) => d >= monthStart && d < todayStr).length;

  for (const fac of allFacilities) {
    const day = (d: string) => byDate[d]?.[fac];
    daily[fac] = dates.map((d) => {
      const f = day(d);
      const u = unbilledOn(fac, d);
      return {
        gross: round(f?.gross ?? 0), discount: round(f?.discount ?? 0), net: round(f?.net ?? 0), profit: round(f?.profit ?? 0),
        unbilled: round(u.mpesa + u.cash),
      };
    });
    // A facility with no completed month yet opened in this window: its first day of
    // takings is the first day with a bill or a receipt with no bill (Palms' first
    // day's sales were billed the next morning).
    const firstTaking = allDays.find((d) => (day(d)?.net ?? 0) > 0 || unbilledOn(fac, d).mpesa + unbilledOn(fac, d).cash > 0);
    const firstEver = historyByFacility[fac]?.[0]?.[1].first || firstTaking || windowFrom;
    const startedOn = firstEver > windowFrom ? firstEver : null;
    const openDays = completed.filter((d) => d >= firstEver);
    const tot = completed.reduce(
      (a, d) => {
        const f = day(d);
        const u = unbilledOn(fac, d);
        return {
          gross: a.gross + (f?.gross ?? 0), discount: a.discount + (f?.discount ?? 0), net: a.net + (f?.net ?? 0), profit: a.profit + (f?.profit ?? 0),
          um: a.um + u.mpesa, un: a.un + u.n, uc: a.uc + u.cash, traded: a.traded + ((f?.net ?? 0) > 0 ? 1 : 0),
        };
      },
      { gross: 0, discount: 0, net: 0, profit: 0, um: 0, un: 0, uc: 0, traded: 0 },
    );
    const estSales = tot.net + tot.um + tot.uc;
    const avgDaily = openDays.length ? estSales / openDays.length : 0;
    const monthDays = allDays.filter((d) => d >= monthStart && d < todayStr);
    const monthBilled = monthDays.reduce((s, d) => s + (day(d)?.net ?? 0), 0);
    const monthNoBill = monthDays.reduce((s, d) => { const u = unbilledOn(fac, d); return s + u.mpesa + u.cash; }, 0);
    const monthEst = monthBilled + monthNoBill;
    npInputs[fac] = {
      monthBilled,
      billedPerDay: openDays.length ? tot.net / openDays.length : 0,
      margin: tot.net ? tot.profit / tot.net : 0,
      monthNoBill,
      noBillPerDay: openDays.length ? (tot.um + tot.uc) / openDays.length : 0,
    };

    facilitySummary[fac] = {
      gross: round(tot.gross),
      discountAmt: round(tot.discount),
      discountPct: pct1(tot.discount, tot.gross),
      net: round(tot.net),
      grossProfit: round(tot.profit),
      marginPct: pct1(tot.profit, tot.net),
      unbilledMpesa: round(tot.um),
      unbilledMpesaN: tot.un,
      unbilledCash: round(tot.uc),
      estSales: round(estSales),
      avgDaily: round(avgDaily),
      avgDailyBilled: openDays.length ? round(tot.net / openDays.length) : 0,
      daysOpen: openDays.length,
      daysTraded: tot.traded,
      monthEst: round(monthEst),
      projected: round(monthEst + (daysInMonth - monthDaysDone) * avgDaily),
      startedOn,
      feedTo: unbilled?.byFacility[fac]?.feedTo ?? null,
    };
  }

  const sum = (k: 'gross' | 'discountAmt' | 'net' | 'grossProfit' | 'unbilledMpesa' | 'unbilledCash' | 'estSales' | 'avgDaily' | 'monthEst' | 'projected') =>
    allFacilities.reduce((s, f) => s + facilitySummary[f][k], 0);
  const totalNet = sum('net');
  const totalProfit = sum('grossProfit');
  const network = {
    totalGross: sum('gross'),
    totalNet,
    totalDiscount: sum('discountAmt'),
    totalProfit,
    totalUnbilled: sum('unbilledMpesa') + sum('unbilledCash'),
    totalEstSales: sum('estSales'),
    totalProjected: sum('projected'),
    totalMonthEst: sum('monthEst'),
    totalAvgDaily: sum('avgDaily'),
    avgMargin: pct1(totalProfit, totalNet),
    daysInMonth,
    monthDaysDone,
    windowDays: WINDOW_DAYS,
    windowFrom,
    windowTo: addDays(todayStr, -1),
    totalInventoryValue: 0,
    totalRestockValue: 0,
  };

  // ── Net profit projection for the calendar month ──────────────────────────
  // Billed sales basis (as in the monthly statements); opex and profit-share terms
  // come from NET_PROFIT_CONFIG (see lib/dashboard/net-profit.ts). Null when unset.
  const npConfig = readNetProfitConfig();
  const netProfit = npConfig
    ? {
        asOf: npConfig.asOf ?? null,
        rows: Object.fromEntries(
          allFacilities.map((fac): [string, NetProfitRow | null] => {
            const terms = npConfig.facilities[fac];
            return [fac, terms ? projectNetProfit(terms, { ...npInputs[fac], daysLeft: daysInMonth - monthDaysDone }) : null];
          }),
        ),
      }
    : null;

  // ── Last 30 days vs the last 3 full months ────────────────────────────────
  // Billed net revenue per calendar day (closed days count as zero, as above)
  // and GP margin. Baseline = plain mean of the last 3 completed months with at
  // least BASELINE_MIN_DAYS trading days, never a facility's first month: an
  // onboarding month is partial and its prices are still being set up
  // (Healmerc's June 2026 showed net revenue above list and a 56% margin).
  const BASELINE_MONTHS = 3;
  const BASELINE_MIN_DAYS = 20;
  const daysIn = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
  const comparison: Record<string, {
    thisAvgDaily: number; thisMargin: number;
    prevAvgDaily: number | null; prevMargin: number | null;
    baselineMonths: string[];
  }> = {};
  allFacilities.forEach((fac) => {
    const valid = (historyByFacility[fac] ?? [])
      .slice(1)
      .filter(([, v]) => v.days >= BASELINE_MIN_DAYS && v.net > 0)
      .slice(-BASELINE_MONTHS);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const prevAvg = mean(valid.map(([m, v]) => v.net / daysIn(m)));
    const prevMargin = mean(valid.map(([, v]) => (v.profit / v.net) * 100));
    comparison[fac] = {
      thisAvgDaily: facilitySummary[fac].avgDailyBilled,
      thisMargin: facilitySummary[fac].marginPct,
      prevAvgDaily: prevAvg == null ? null : round(prevAvg),
      prevMargin: prevMargin == null ? null : Math.round(prevMargin * 10) / 10,
      baselineMonths: valid.map(([m]) => m),
    };
  });

  // ── Completed months, per facility (last 12) ──────────────────────────────
  const monthsAll = Array.from(new Set(Object.values(historyByFacility).flat().map(([m]) => m))).sort();
  const months = monthsAll.slice(-12);
  const monthly: Record<string, Array<{ net: number; profit: number; days: number }>> = {};
  for (const fac of Array.from(new Set([...allFacilities, ...Object.keys(historyByFacility)]))) {
    const h = Object.fromEntries(historyByFacility[fac] ?? []);
    const rows = months.map((m) => ({ net: round(h[m]?.net ?? 0), profit: round(h[m]?.profit ?? 0), days: h[m]?.days ?? 0 }));
    if (rows.some((r) => r.net > 0)) monthly[fac] = rows;
  }

  // ── Inventory value per facility (card 2507: org, class, value) ───────────
  const inventoryByFacility: Record<string, number> = {};
  for (const row of invByClassRes.data.rows) {
    const fac = row[0] as string;
    inventoryByFacility[fac] = (inventoryByFacility[fac] ?? 0) + num(row[2]);
  }
  // Stock received per facility over the 30 completed days
  const restockByFacility: Record<string, number> = {};
  for (const row of restockRes?.data?.rows ?? []) {
    const fac = row[0] as string;
    if (fac) restockByFacility[fac] = (restockByFacility[fac] ?? 0) + num(row[1]);
  }
  network.totalInventoryValue = round(Object.values(inventoryByFacility).reduce((s, v) => s + v, 0));
  network.totalRestockValue = round(Object.values(restockByFacility).reduce((s, v) => s + v, 0));

  // ── Reconciliation, month to date (card 3431) ─────────────────────────────
  let reconciliation: Array<{
    facility: string; billed: number; collected: number;
    mpesaBilled: number; mpesaCollected: number; cashBilled: number; cashCollected: number; netBalance: number;
  }> | null = null;
  if (reconRes?.data) {
    const c = reconRes.data.cols;
    const i = {
      fac: findCol(c, 'Organization Name'),
      billed: findCol(c, 'Sum of Total Amount Billed', 'Total Amount Billed'),
      collected: findCol(c, 'Sum of Total Amount Collected', 'Total Amount Collected'),
      mb: findCol(c, 'Sum of Mpesa Billed', 'Mpesa Billed'),
      mc: findCol(c, 'Sum of Mpesa Collected', 'Mpesa Collected'),
      cb: findCol(c, 'Sum of Cash Billed', 'Cash Billed'),
      cc: findCol(c, 'Sum of Cash Collected', 'Cash Collected'),
      bal: findCol(c, 'Sum of Net Balance', 'Net Balance'),
    };
    reconciliation = reconRes.data.rows
      .filter((r) => r[i.fac])
      .map((r) => ({
        facility: String(r[i.fac]),
        billed: round(num(r[i.billed])),
        collected: round(num(r[i.collected])),
        mpesaBilled: round(num(r[i.mb])),
        mpesaCollected: round(num(r[i.mc])),
        cashBilled: round(num(r[i.cb])),
        cashCollected: round(num(r[i.cc])),
        netBalance: round(num(r[i.bal])),
      }));
  }

  // ── Discounts by staff ────────────────────────────────────────────────────
  const staffDiscountsDaily = staffDailyRes?.data
    ? staffDailyRes.data.rows
        .filter((r) => r[1])
        .map((r) => ({
          date: String(r[0]).slice(0, 10),
          facility: String(r[1]),
          staff: (r[2] as string) || 'Unknown',
          discount: round(num(r[3])),
          discountedGross: round(num(r[4])),
          bills: num(r[5]),
        }))
    : null;
  const staffDiscountsMonth = staffMonthRes?.data
    ? staffMonthRes.data.rows
        .filter((r) => r[0])
        .map((r) => ({
          facility: String(r[0]),
          staff: (r[1] as string) || 'Unknown',
          gross: round(num(r[2])),
          discount: round(num(r[3])),
          bills: num(r[4]),
        }))
    : null;

  // ── Missed sales: count and estimated lost value per day and facility ────
  const missedSales = missedRes?.data
    ? missedRes.data.rows
        .filter((r) => r[1])
        .map((r) => ({ date: String(r[0]).slice(0, 10), facility: String(r[1]).trim(), count: num(r[2]), value: round(num(r[3])) }))
    : null;

  // ── Unpaid & partially paid bills, last 3 days (card 2824 — one row per bill item) ──
  type UnpaidBill = {
    facility: string; order: string; status: string; createdAt: string; staff: string;
    payable: number; paid: number; balance: number; items: string[];
  };
  let unpaidBills: UnpaidBill[] | null = null;
  if (unpaidRes?.data) {
    const c = unpaidRes.data.cols;
    const i = {
      id: findCol(c, 'ID'),
      status: findCol(c, 'Bill Payment Status'),
      order: findCol(c, 'Order Number'),
      payable: findCol(c, 'Amount Payable'),
      paid: findCol(c, 'Amount Paid'),
      dept: findCol(c, 'Department'),
      staff: findCol(c, 'Created By'),
      product: findCol(c, 'Bill Item → Product Name', 'Product Name'),
      created: findCol(c, 'Bill Item → Created At', 'Created At'),
      fac: findCol(c, 'Organization → Organization Name', 'Organization Name'),
    };
    const bills: Record<string, UnpaidBill> = {};
    for (const r of unpaidRes.data.rows) {
      if (i.dept !== -1 && r[i.dept] && r[i.dept] !== 'Pharmacy') continue;
      const key = String(r[i.id] ?? r[i.order]);
      const created = String(r[i.created] ?? '');
      const b = (bills[key] ??= {
        facility: String(r[i.fac] ?? ''),
        order: String(r[i.order] ?? ''),
        status: String(r[i.status] ?? ''),
        createdAt: created,
        staff: String(r[i.staff] ?? ''),
        payable: round(num(r[i.payable])),
        paid: round(num(r[i.paid])),
        balance: round(num(r[i.payable]) - num(r[i.paid])),
        items: [],
      });
      if (created && created < b.createdAt) b.createdAt = created;
      const product = r[i.product] as string | null;
      if (product && !b.items.includes(product)) b.items.push(product);
    }
    unpaidBills = Object.values(bills)
      .filter((b) => b.balance > 0 && b.createdAt && nairobiDate(new Date(b.createdAt)) >= billsFrom)
      .sort((a, b) => b.balance - a.balance);
  }

  return NextResponse.json({
    monthLabel,
    monthPrefix,
    today: todayStr,
    generatedAt: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }),
    dates,
    dateLabels,
    allFacilities,
    daily,
    facilitySummary,
    network,
    comparison,
    history: { months, monthly },
    netProfit,
    unbilledAvailable: !!unbilled,
    emrTo: unbilled?.emrTo ?? null,
    commercial: {
      topProducts: parseTopProducts(networkTopRes),
    },
    inventory: {
      inventoryByFacility: Object.fromEntries(Object.entries(inventoryByFacility).map(([k, v]) => [k, round(v)])),
      restockByFacility: Object.fromEntries(Object.entries(restockByFacility).map(([k, v]) => [k, round(v)])),
    },
    reconciliation,
    discounts: { staffDaily: staffDiscountsDaily, staffMonth: staffDiscountsMonth },
    missedSales,
    unpaidBills,
    unpaidBillsFrom: billsFrom,
  });
}
