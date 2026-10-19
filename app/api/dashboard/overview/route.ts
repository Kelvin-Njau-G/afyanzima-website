import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { checkDashboardPassword } from '@/lib/facilities';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { portalDb } from '@/lib/portal/db';
import { CODE_CHECK_CARD, parseCodeCheck } from '@/lib/dashboard/code-check';

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

function ordersQuery(q: { from?: string; to?: string; org?: string; extra?: unknown[]; aggregation: unknown[]; breakout?: unknown[]; orderBy?: unknown[]; limit?: number }) {
  const filter: unknown[] = ['and', ['=', F.dept, 'Pharmacy']];
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

  const todayStr    = nairobiDate();
  const monthPrefix = todayStr.slice(0, 7);
  const monthStart  = `${monthPrefix}-01`;
  const [yy, mm]    = monthPrefix.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthEnd    = addDays(monthStart, daysInMonth); // exclusive
  const monthLabel  = new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
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
    const res = await dataset(topProducts(monthStart, monthEnd, body.topProductsFor));
    return NextResponse.json({ topProducts: parseTopProducts(res) });
  }

  // Everything runs in parallel; card 1788 queries take ~10s each on BigQuery.
  const [dailyRes, networkTopRes, invByClassRes, restockRes, reconRes, staffDailyRes, staffMonthRes, missedRes, unpaidRes, historyRes] =
    await Promise.all([
      dataset(ordersQuery({
        from: monthStart, to: monthEnd,
        aggregation: [['sum', F.amount], ['sum', F.discount], ['sum', F.net], ['sum', F.profit]],
        breakout: [F.time('day'), F.org],
      })),
      dataset(topProducts(monthStart, monthEnd)),
      card(2507),                                   // inventory value by class
      card(1661),                                   // monthly restock value
      safe('reconciliation', card(3431)),           // revenue vs collections, month to date
      safe('staff discounts (daily)', dataset(ordersQuery({
        from: monthStart, to: monthEnd,
        extra: [['!=', F.discount, 0]],
        aggregation: [['sum', F.discount], ['sum', F.amount], ['distinct', F.order]],
        breakout: [F.time('day'), F.org, F.staff],
        limit: 5000,
      }))),
      safe('staff discounts (month)', dataset(ordersQuery({
        from: monthStart, to: monthEnd,
        aggregation: [['sum', F.amount], ['sum', F.discount], ['distinct', F.order]],
        breakout: [F.org, F.staff],
      }))),
      safe('missed sales', dataset(missedSalesQuery(monthStart, monthEnd))),
      safe('unpaid bills', card(2824)),
      // Every previous month, per facility: net revenue, gross profit and the
      // number of days that had sales.
      safe('history', dataset(ordersQuery({
        to: monthStart,
        aggregation: [['sum', F.net], ['sum', F.profit], ['distinct', F.time('day')]],
        breakout: [F.time('month'), F.org],
        limit: 10000,
      }))),
    ]);

  // Daily revenue per facility
  type DayFigures = { gross: number; discount: number; net: number; profit: number };
  const byDate: Record<string, Record<string, DayFigures>> = {};
  const activeFacilities = new Set<string>();
  for (const row of dailyRes.data.rows) {
    const d = String(row[0]).slice(0, 10);
    const fac = row[1] as string;
    if (!fac) continue;
    byDate[d] ??= {};
    byDate[d][fac] = { gross: num(row[2]), discount: num(row[3]), net: num(row[4]), profit: num(row[5]) };
    activeFacilities.add(fac);
  }
  const dates = Object.keys(byDate).sort();
  const allFacilities = Array.from(activeFacilities).sort();
  const dateLabels = dates.map((d) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  );

  // ── Per-facility summary (all NET) ────────────────────────────────────────
  type Summary = {
    gross: number; discountAmt: number; discountPct: number; net: number;
    grossProfit: number; marginPct: number; avgDaily: number; projected: number; daysTraded: number;
  };
  const facilitySummary: Record<string, Summary> = {};
  const daily: Record<string, DayFigures[]> = {};

  for (const fac of allFacilities) {
    daily[fac] = dates.map((d) => {
      const f = byDate[d]?.[fac];
      return f
        ? { gross: round(f.gross), discount: round(f.discount), net: round(f.net), profit: round(f.profit) }
        : { gross: 0, discount: 0, net: 0, profit: 0 };
    });
    const tot = daily[fac].reduce(
      (a, f) => ({ gross: a.gross + f.gross, discount: a.discount + f.discount, net: a.net + f.net, profit: a.profit + f.profit }),
      { gross: 0, discount: 0, net: 0, profit: 0 },
    );
    // Average over completed trading days — today is still in progress.
    const complete = dates
      .map((d, i) => ({ d, net: daily[fac][i].net }))
      .filter((x) => x.d < todayStr && x.net > 0);
    const avgDaily = complete.length ? round(complete.reduce((a, x) => a + x.net, 0) / complete.length) : 0;

    facilitySummary[fac] = {
      gross: tot.gross,
      discountAmt: tot.discount,
      discountPct: pct1(tot.discount, tot.gross),
      net: tot.net,
      grossProfit: tot.profit,
      marginPct: pct1(tot.profit, tot.net),
      avgDaily,
      projected: avgDaily * daysInMonth,
      daysTraded: complete.length,
    };
  }

  const sum = (k: keyof Summary) => allFacilities.reduce((s, f) => s + facilitySummary[f][k], 0);
  const totalNet = sum('net');
  const totalProfit = sum('grossProfit');
  const network = {
    totalGross: sum('gross'),
    totalNet,
    totalDiscount: sum('discountAmt'),
    totalProfit,
    totalProjected: sum('projected'),
    totalAvgDaily: sum('avgDaily'),
    avgMargin: pct1(totalProfit, totalNet),
    daysInMonth,
    totalInventoryValue: 0,
    totalRestockValue: 0,
  };

  // ── This month vs the last 3 full months ──────────────────────────────────
  // Each baseline month contributes its own average net revenue per trading day
  // and its own GP margin (net revenue − COGS) / net revenue; the baseline is
  // the plain mean of those months. Months with fewer than BASELINE_MIN_DAYS
  // trading days are skipped: a facility's onboarding month is usually partial
  // and its prices are still being set up (Healmerc's June 2026 shows net
  // revenue above list price and a 56% margin), which skewed an all-history
  // average far away from how the facility normally runs.
  const BASELINE_MONTHS = 3;
  const BASELINE_MIN_DAYS = 20;
  const comparison: Record<string, {
    thisAvgDaily: number; thisMargin: number;
    prevAvgDaily: number | null; prevMargin: number | null;
    baselineMonths: string[];
  }> = {};
  const historyByFacility: Record<string, Array<[string, { net: number; profit: number; days: number }]>> = {};
  for (const row of historyRes?.data?.rows ?? []) {
    const fac = row[1] as string;
    if (!fac) continue;
    (historyByFacility[fac] ??= []).push([String(row[0]).slice(0, 7), { net: num(row[2]), profit: num(row[3]), days: num(row[4]) }]);
  }
  allFacilities.forEach((fac) => {
    const valid = (historyByFacility[fac] ?? [])
      .filter(([, v]) => v.days >= BASELINE_MIN_DAYS && v.net > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-BASELINE_MONTHS);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const prevAvg = mean(valid.map(([, v]) => v.net / v.days));
    const prevMargin = mean(valid.map(([, v]) => (v.profit / v.net) * 100));
    comparison[fac] = {
      thisAvgDaily: facilitySummary[fac].avgDaily,
      thisMargin: facilitySummary[fac].marginPct,
      prevAvgDaily: prevAvg == null ? null : round(prevAvg),
      prevMargin: prevMargin == null ? null : Math.round(prevMargin * 10) / 10,
      baselineMonths: valid.map(([m]) => m),
    };
  });

  // ── Inventory value per facility (card 2507: org, class, value) ───────────
  const inventoryByFacility: Record<string, number> = {};
  for (const row of invByClassRes.data.rows) {
    const fac = row[0] as string;
    inventoryByFacility[fac] = (inventoryByFacility[fac] ?? 0) + num(row[2]);
  }
  // Monthly restock per facility (card 1661)
  const restockByFacility: Record<string, number> = {};
  for (const row of restockRes.data.rows) {
    if (typeof row[1] === 'string' && row[1].startsWith(monthPrefix)) {
      const fac = row[0] as string;
      restockByFacility[fac] = (restockByFacility[fac] ?? 0) + num(row[6]);
    }
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
