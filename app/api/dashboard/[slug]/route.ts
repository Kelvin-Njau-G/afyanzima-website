import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { checkPassword } from '@/lib/facilities';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { userCanViewFacility } from '@/lib/portal/db';
import { getFacility } from '@/lib/portal/facilities';

const BASE = process.env.METABASE_URL!.replace(/\/$/, '');
const MB_USER = process.env.METABASE_USER!;
const MB_PASS = process.env.METABASE_PASSWORD!;

const QAALANE_SLUG = 'qaalane';

type MbCol = { name: string; display_name: string; base_type: string };
type MbResult = { data: { cols: MbCol[]; rows: unknown[][] } };

function mbFetch(path: string, body?: object, token?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Metabase-Session'] = token;
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));
    const url = new URL(BASE + path);
    const options = { hostname: url.hostname, path: url.pathname + url.search, method: body ? 'POST' : 'GET', headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Find a column index by matching any of the given keywords against name or display_name (case-insensitive). */
function colIdx(cols: MbCol[], ...keywords: string[]): number {
  const kws = keywords.map(k => k.toLowerCase());
  return cols.findIndex(c =>
    kws.some(kw =>
      c.name.toLowerCase().includes(kw) ||
      (c.display_name || '').toLowerCase().includes(kw)
    )
  );
}

/** Convert a Metabase base_type string into a simple client-friendly type tag. */
function simplifyType(baseType: string): 'number' | 'date' | 'text' {
  if (/Float|Integer|Decimal|BigInteger/i.test(baseType)) return 'number';
  if (/DateTime|Date|Time/i.test(baseType)) return 'date';
  return 'text';
}

/**
 * Desired display order for the Daily Sales by Product table columns.
 * Each inner array is a list of keywords; the first match wins.
 */
const COL_ORDER_KEYWORDS: string[][] = [
  ['cart_time', 'cart time', 'minute'],           // Cart_Time Minute
  ['product'],                                      // Product
  ['staff', 'served_by', 'cashier', 'attendant'],   // Staff
  ['pack'],                                         // Pack
  // Unit_Purchase_Price must be matched BEFORE Unit_Price to avoid substring clash
  ['unit_purchase', 'purchase_price', 'purchase'],  // Unit_Purchase_Price
  ['unit_price', 'unit price'],                     // Unit_Price
  ['quantity', 'qty'],                              // Sum of Quantity
  ['discount'],                                     // Sum of Discount
  ['sale_amount', 'sale amount', 'revenue'],        // Sum of Sale_Amount
  ['profit'],                                       // Sum of Profit
  ['margin'],                                       // Margin
  ['order_number', 'order'],                        // Order_Number
];

function desiredColRank(col: MbCol): number {
  const name = (col.display_name || col.name || '').toLowerCase();
  for (let i = 0; i < COL_ORDER_KEYWORDS.length; i++) {
    if (COL_ORDER_KEYWORDS[i].some(kw => name.includes(kw))) return i;
  }
  return 999; // unknown columns go to the end
}

/**
 * Products sold in the month, aggregated by product + SKU, highest revenue
 * first. `limit` caps the row count — 2000 is Metabase's ceiling for a single
 * /api/dataset response, so it effectively means "everything".
 */
function topProductsQuery(facilityName: string, monthStart: string, monthEnd: string, limit = 2000) {
  return {
    database: 5,
    type: 'query',
    query: {
      'source-table': 'card__1788',
      filter: ['and',
        ['=', ['field', 'Department', { 'base-type': 'type/Text' }], 'Pharmacy'],
        ['=', ['field', 'Organization_Name', { 'base-type': 'type/Text' }], facilityName],
        ['>=', ['field', 'Cart_Time', { 'base-type': 'type/DateTimeWithLocalTZ', 'temporal-unit': 'minute' }], `${monthStart}T00:00:00`],
        ['<',  ['field', 'Cart_Time', { 'base-type': 'type/DateTimeWithLocalTZ', 'temporal-unit': 'minute' }], `${monthEnd}T00:00:00`],
      ],
      aggregation: [
        ['sum', ['field', 'Quantity',    { 'base-type': 'type/Float' }]],
        ['sum', ['field', 'Sale_Amount', { 'base-type': 'type/Float' }]],
        ['sum', ['field', 'Profit',      { 'base-type': 'type/Float' }]],
      ],
      breakout: [
        ['field', 'Product', { 'base-type': 'type/Text' }],
        ['field', 'SKU',     { 'base-type': 'type/Text' }],
      ],
      'order-by': [['desc', ['aggregation', 1]]],
      limit,
    },
  };
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;
  const facility = await getFacility(slug);
  if (!facility) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ---------------------------------------------------------------------
  // Authorisation. This is the gate that actually matters — the login page
  // and middleware only control what the browser shows, whereas nothing gets
  // past this point without proving access to THIS facility.
  // ---------------------------------------------------------------------
  const body = await req.json().catch(() => ({}));
  const password: string | undefined = body?.password;

  let authorised = false;

  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    // Checked against the database on every request, so revoking a facility
    // in /admin locks the user out immediately rather than at session expiry.
    authorised = await userCanViewFacility(session.sub, slug);
  }

  // Transitional: the old per-facility passwords still work while partners
  // move across. Set PORTAL_LEGACY_PASSWORDS=false in Vercel to switch them
  // off — no code change or redeploy of this file needed.
  if (!authorised && process.env.PORTAL_LEGACY_PASSWORDS !== 'false' && password) {
    authorised = checkPassword(slug, password);
  }

  if (!authorised) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const facilityName = facility.name;

  // ── What window are we reporting on? ────────────────────────────────────────
  // The route fetches an arbitrary [from, to] date range. A month is just the
  // common case of that, so the client can send either:
  //   { month: '2026-09' }              — that whole calendar month
  //   { from: '2026-09-26', to: '...' } — any range, including across months
  // Anything malformed falls back to the current month rather than erroring,
  // so a stale bookmark still loads something sensible.
  //
  // All date maths runs in Africa/Nairobi. The server's UTC clock would put the
  // dashboard a day behind for the first three hours of every Nairobi day.
  const nairobiNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })
  );
  const currentPrefix = `${nairobiNow.getFullYear()}-${String(nairobiNow.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = `${currentPrefix}-${String(nairobiNow.getDate()).padStart(2, '0')}`;

  const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const isDate  = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  /** First and last day of a YYYY-MM. */
  const monthRange = (prefix: string) => {
    const [y, mo] = prefix.split('-').map(Number);
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { from: `${prefix}-01`, to: `${prefix}-${String(days).padStart(2, '0')}`, days };
  };

  let windowFrom: string;
  let windowTo: string;

  if (isDate(body?.from) && isDate(body?.to) && body.from <= body.to) {
    windowFrom = body.from;
    windowTo = body.to;
  } else {
    const prefix = isMonth(body?.month) ? body.month : currentPrefix;
    ({ from: windowFrom, to: windowTo } = monthRange(prefix));
  }

  // Never fetch past today — future dates return nothing and make the chart
  // trail off into empty bars.
  if (windowTo > todayStr) windowTo = todayStr;
  if (windowFrom > windowTo) windowFrom = windowTo;

  // Exclusive upper bound for the Metabase filter: midnight the following day.
  const nextDay = new Date(`${windowTo}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const windowEndExclusive = nextDay.toISOString().slice(0, 10);

  const inWindow = (d: string) => d >= windowFrom && d <= windowTo;

  // Is this window exactly one whole calendar month? That decides whether the
  // month-grain Metabase cards (2536 discounts, 2410 margin) can be used as-is,
  // and whether "month-to-date" and the projection make any sense.
  const windowPrefix = windowFrom.slice(0, 7);
  const asMonth = monthRange(windowPrefix);
  const isWholeMonth =
    windowFrom === asMonth.from &&
    (windowTo === asMonth.to || (windowPrefix === currentPrefix && windowTo === todayStr));
  const isCurrentMonth = isWholeMonth && windowPrefix === currentPrefix;
  const daysInMonth = asMonth.days;

  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

  // "September 2026" for a whole month, "26 Sep – 2 Oct 2026" for a custom range.
  const monthLabel = isWholeMonth
    ? fmtDay(windowFrom, { month: 'long', year: 'numeric' })
    : windowFrom === windowTo
      // A single day shouldn't read "2 Oct – 2 Oct 2026".
      ? fmtDay(windowFrom, { day: 'numeric', month: 'short', year: 'numeric' })
      : `${fmtDay(windowFrom, { day: 'numeric', month: 'short' })} – ${fmtDay(windowTo, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  // Kept under the old names so the rest of the route reads unchanged.
  const monthStart = windowFrom;
  const monthEnd = windowTo;
  const monthEndExclusive = windowEndExclusive;

  const auth = (await mbFetch('/api/session', { username: MB_USER, password: MB_PASS })) as { id: string };
  const token = auth.id;

  const isQaalane = slug === QAALANE_SLUG;

  // Parallel fetch all cards
  const fetches: Promise<unknown>[] = [
    mbFetch('/api/card/2262/query', {}, token),   // 0: daily revenue per facility
    mbFetch('/api/card/2536/query', {}, token),   // 1: discounts / net revenue
    mbFetch('/api/card/2410/query', {}, token),   // 2: gross margin %
    mbFetch('/api/dataset', topProductsQuery(facilityName, monthStart, monthEndExclusive, 2000), token), // 3: all products sold this month
    mbFetch('/api/card/2507/query', {}, token),   // 4: inventory value by class
    mbFetch('/api/card/1661/query', {}, token),   // 5: monthly restock value
    mbFetch('/api/card/3193/query', {}, token),   // 6: daily COGS & profit
    mbFetch('/api/card/3191/query', {}, token),   // 7: daily sales by product
  ];
  if (isQaalane) {
    fetches.push(mbFetch('/api/dataset', topProductsQuery(facilityName, monthStart, monthEndExclusive, 500), token)); // 8
    fetches.push(mbFetch('/api/card/2501/query', {}, token)); // 9
  }

  const results = await Promise.all(fetches) as MbResult[];
  const [dailyRes, discRes, marginRes, topProdRes, invByClassRes, restockRes, dailyProfitRes, dailyByProdRes] = results;

  // ── Daily revenue ────────────────────────────────────────────────────────────
  const monthRows = dailyRes.data.rows.filter(
    r => typeof r[0] === 'string' && inWindow(r[0].slice(0, 10))
  );
  const byDate: Record<string, Record<string, number>> = {};
  const activeFacilities = new Set<string>();
  for (const row of monthRows) {
    const d = (row[0] as string).slice(0, 10);
    const fac = row[1] as string;
    byDate[d] ??= {};
    byDate[d][fac] = Math.round((row[2] as number) || 0);
    activeFacilities.add(fac);
  }
  const dates = Object.keys(byDate).sort();

  // ── Discounts ────────────────────────────────────────────────────────────────
  // Cards 2536 and 2410 hold one pre-aggregated row per facility per month, so
  // they only answer a whole-month window. For any other range these come out
  // as zero and the figures are totalled from the daily series instead.
  const discRow = isWholeMonth
    ? discRes.data.rows.find(r => typeof r[0] === 'string' && r[0].startsWith(windowPrefix) && r[1] === facilityName)
    : undefined;
  const gross       = Math.round((discRow?.[2] as number) || 0);
  const discountPct = Math.round(((discRow?.[3] as number) || 0) * 1000) / 10;
  const discountAmt = Math.round((discRow?.[4] as number) || 0);
  const net         = Math.round((discRow?.[5] as number) || 0);

  // ── Margin ───────────────────────────────────────────────────────────────────
  const margins: Record<string, number> = {};
  if (isWholeMonth) {
    for (const row of marginRes.data.rows) {
      if (typeof row[0] === 'string' && row[0].startsWith(windowPrefix))
        margins[row[1] as string] = Math.round((row[2] as number) * 1000) / 10;
    }
  }
  const marginPct   = margins[facilityName] ?? 0;
  const grossProfit = Math.round(gross * marginPct / 100);
  const netProfit   = grossProfit - discountAmt;

  // ── Daily COGS & profit (card 3193) ─────────────────────────────────────────
  const dpCols      = dailyProfitRes.data.cols;
  const dpDateIdx   = colIdx(dpCols, 'cart_time', 'date', 'day');
  const dpOrgIdx    = colIdx(dpCols, 'organization_name', 'organization', 'facility', 'org');
  const dpProfitIdx = colIdx(dpCols, 'profit');
  const dpCogsIdx   = colIdx(dpCols, 'cogs', 'cost_of_goods', 'cost');
  const dpRevIdx    = colIdx(dpCols, 'sale_amount', 'revenue', 'sales', 'amount');

  const dailyProfitMap: Record<string, number> = {};
  const dailyCOGSMap: Record<string, number> = {};

  for (const row of dailyProfitRes.data.rows) {
    const rawDate = dpDateIdx >= 0 ? row[dpDateIdx] : null;
    const d = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
    if (!d || !inWindow(d)) continue;
    const fac = dpOrgIdx >= 0 ? (row[dpOrgIdx] as string) : '';
    if (fac !== facilityName) continue;

    if (dpProfitIdx >= 0) dailyProfitMap[d] = Math.round((row[dpProfitIdx] as number) || 0);
    if (dpCogsIdx >= 0) {
      dailyCOGSMap[d] = Math.round((row[dpCogsIdx] as number) || 0);
    } else if (dpRevIdx >= 0 && dpProfitIdx >= 0) {
      // Derive COGS from revenue minus profit when no explicit COGS column exists
      dailyCOGSMap[d] = Math.round(((row[dpRevIdx] as number) || 0) - ((row[dpProfitIdx] as number) || 0));
    }
  }

  // ── Daily stats ──────────────────────────────────────────────────────────────
  const daily = dates.map(d => {
    const revenue   = byDate[d]?.[facilityName] ?? 0;
    const rawProfit = dailyProfitMap[d];
    const rawCOGS   = dailyCOGSMap[d];
    // Fall back to the month-level margin estimate when card 3193 has no row for this day
    const profit = rawProfit !== undefined ? rawProfit : Math.round(revenue * marginPct / 100);
    const cogs   = rawCOGS   !== undefined ? rawCOGS   : (revenue - profit);
    return {
      date: d,
      label: fmtDay(d, { day: 'numeric', month: 'short' }),
      revenue,
      cogs:   Math.max(0, cogs),
      profit: Math.max(0, profit),
      // Filled in below, once card 3191 has been parsed.
      discount: 0,
    };
  });

  const completeDays = daily.filter(d => d.date < todayStr && d.revenue > 0).map(d => d.revenue);
  const avgDaily    = completeDays.length ? Math.round(completeDays.reduce((a, b) => a + b, 0) / completeDays.length) : 0;
  // A finished month has no "projection" — the actual total is the answer.
  const monthTotal = daily.reduce((a, d) => a + d.revenue, 0);
  const projected  = isCurrentMonth ? avgDaily * daysInMonth : monthTotal;

  // ── Top 20 products ──────────────────────────────────────────────────────────
  // Every product sold this month, not just the top handful. Rows with no
  // revenue are dropped so the count in the heading reflects actual sales.
  const topProducts = topProdRes.data.rows
    .filter(row => ((row[3] as number) || 0) > 0)
    .map(row => ({
      product: row[0] as string,
      sku:     row[1] as string,
      qty:     Math.round((row[2] as number) || 0),
      revenue: Math.round((row[3] as number) || 0),
      margin:  (row[3] as number) > 0 ? Math.round(((row[4] as number) / (row[3] as number)) * 1000) / 10 : 0,
    }));

  // ── Months this facility has data for ───────────────────────────────────────
  // Card 2262 carries one row per day per facility across the full history, so
  // it's the cheapest honest source for "which months can this partner open?".
  // Built from data already fetched — no extra Metabase round trip.
  const monthSet = new Set<string>();
  let dataStart = todayStr;
  for (const row of dailyRes.data.rows) {
    if (typeof row[0] !== 'string') continue;
    if (row[1] !== facilityName) continue;
    if (((row[2] as number) || 0) <= 0) continue;
    monthSet.add(row[0].slice(0, 7));
    const d = row[0].slice(0, 10);
    if (d < dataStart) dataStart = d;
  }
  // Always offer the current month, even before the first sale lands in it.
  monthSet.add(currentPrefix);
  const availableMonths = Array.from(monthSet)
    .sort()
    .reverse()
    .map(prefix => {
      const [y, mo] = prefix.split('-').map(Number);
      return {
        value: prefix,
        label: new Date(Date.UTC(y, mo - 1, 1))
          .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      };
    });

  // ── Inventory value ──────────────────────────────────────────────────────────
  const invRows = invByClassRes.data.rows.filter(r => r[0] === facilityName);
  const inventoryValue = Math.round(invRows.reduce((s, r) => s + ((r[2] as number) || 0), 0));

  // ── Monthly restock ──────────────────────────────────────────────────────────
  const restockRows = restockRes.data.rows.filter(
    r => r[0] === facilityName && typeof r[1] === 'string' && inWindow(r[1].slice(0, 10))
  );
  const monthlyRestockValue = Math.round(restockRows.reduce((s, r) => s + ((r[6] as number) || 0), 0));

  // ── Daily sales by product (card 3191) ───────────────────────────────────────
  const dbpCols    = dailyByProdRes.data.cols;
  const dbpOrgIdx  = colIdx(dbpCols, 'organization_name', 'organization', 'facility', 'org');
  const dbpDateIdx = colIdx(dbpCols, 'cart_time', 'date', 'day');

  const excludedIdxs = new Set<number>();
  if (dbpOrgIdx >= 0) excludedIdxs.add(dbpOrgIdx);

  const filteredProdRows = dailyByProdRes.data.rows.filter(row => {
    if (dbpOrgIdx >= 0 && row[dbpOrgIdx] !== facilityName) return false;
    if (dbpDateIdx >= 0) {
      const rawD = row[dbpDateIdx];
      if (typeof rawD === 'string' && !inWindow(rawD.slice(0, 10))) return false;
    }
    return true;
  });

  // Build the included columns sorted by the desired display order
  const includedCols = dbpCols
    .map((col, i) => ({ col, i }))
    .filter(({ i }) => !excludedIdxs.has(i))
    .sort((a, b) => desiredColRank(a.col) - desiredColRank(b.col));

  const dailySalesByProduct = {
    headers:  includedCols.map(({ col }) => col.display_name || col.name),
    colTypes: includedCols.map(({ col }) => simplifyType(col.base_type || '')),
    rows: filteredProdRows.map(row =>
      includedCols.map(({ i }) => {
        const val = row[i];
        // Timestamps are passed through in full. Card 3191 groups by minute, so
        // a product sold several times in a day produces several rows — dropping
        // the time made those look like duplicates. The client formats them.
        return val as string | number | null;
      })
    ),
  };

  // ── Column roles for client-side filtering ──────────────────────────────────
  // The client re-aggregates these rows when a date range or product filter is
  // active, so it needs to know which position holds what. Working this out
  // here (where the Metabase column metadata is available) keeps the client
  // from having to guess by matching header text.
  const roleOf = (...kw: string[]) => {
    const abs = colIdx(dbpCols, ...kw);
    return abs < 0 ? -1 : includedCols.findIndex(({ i }) => i === abs);
  };
  const columnRoles = {
    date:     roleOf('cart_time', 'date', 'day'),
    product:  roleOf('product'),
    staff:    roleOf('staff', 'served_by', 'cashier', 'attendant'),
    qty:      roleOf('quantity', 'qty'),
    discount: roleOf('discount'),
    revenue:  roleOf('sale_amount', 'sale amount', 'revenue'),
    profit:   roleOf('profit'),
  };

  // ── Per-day discount (from card 3191) ───────────────────────────────────────
  // The discount and net-revenue scorecards come from card 2536, which is
  // aggregated per month and so can't be sliced to a date range. Summing the
  // per-row discounts here gives the client a daily series it can total over
  // whatever range the user picks.
  const dbpDiscIdx = colIdx(dbpCols, 'discount');
  const dailyDiscountMap: Record<string, number> = {};
  if (dbpDiscIdx >= 0 && dbpDateIdx >= 0) {
    for (const row of filteredProdRows) {
      const rawD = row[dbpDateIdx];
      const d = typeof rawD === 'string' ? rawD.slice(0, 10) : '';
      if (!d) continue;
      dailyDiscountMap[d] = (dailyDiscountMap[d] ?? 0) + ((row[dbpDiscIdx] as number) || 0);
    }
  }

  // Product → SKU lookup, so a client-side rebuild of the product table can
  // still show SKUs (card 3191 carries the product name but not the SKU).
  const productSku: Record<string, string> = {};
  for (const p of topProducts) {
    if (p.product && p.sku) productSku[p.product] = p.sku;
  }

  // ── Full product table (Qaalane only) ────────────────────────────────────────
  let fullProductTable: Array<{
    product: string; sku: string; buyingPrice: number | null;
    sellingPrice: number | null; margin: number; revenue: number; qty: number;
  }> = [];

  if (isQaalane && results[8] && results[9]) {
    const allProdRes  = results[8];
    const invPriceRes = results[9];

    // Build buying price lookup: SKU → avg_buying_price
    // card 2501 cols: org_name, sku, product_name, molecular_name, qty, inv_value, avg_buying_price, last_restock
    const buyingPrices: Record<string, number> = {};
    for (const row of invPriceRes.data.rows) {
      if (row[0] === facilityName && row[1] && row[6] != null)
        buyingPrices[row[1] as string] = row[6] as number;
    }

    fullProductTable = allProdRes.data.rows
      .filter(row => (row[3] as number) > 0)
      .map(row => {
        const qty     = Math.round((row[2] as number) || 0);
        const revenue = Math.round((row[3] as number) || 0);
        const profit  = (row[4] as number) || 0;
        const sku     = row[1] as string;
        const buyingPrice  = buyingPrices[sku] ?? null;
        const sellingPrice = qty > 0 ? Math.round((revenue / qty) * 100) / 100 : null;
        const margin  = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
        return { product: row[0] as string, sku, buyingPrice, sellingPrice, margin, revenue, qty };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  // Attach the per-day discounts now that card 3191 has been parsed.
  for (const d of daily) d.discount = Math.round(dailyDiscountMap[d.date] ?? 0);

  return NextResponse.json({
    facility: facilityName,
    monthLabel,
    month: windowPrefix,
    windowFrom,
    windowTo,
    isWholeMonth,
    monthStart,
    monthEnd,
    // Anchors for the quick presets. Sent by the server so "Today" means today
    // in Nairobi rather than wherever the viewer's browser happens to be.
    currentMonth: currentPrefix,
    dataStart,
    today: `${currentPrefix}-${String(nairobiNow.getDate()).padStart(2, '0')}`,
    isCurrentMonth,
    availableMonths,
    generatedAt: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }),
    dates,
    dateLabels: daily.map(d => d.label),
    allFacilities: Array.from(activeFacilities).sort(),
    margins,
    dataset: Object.fromEntries(Array.from(activeFacilities).sort().map(fac => [fac, dates.map(d => byDate[d]?.[fac] ?? 0)])),
    metrics: {
      gross, net, discountAmt, discountPct, marginPct,
      netMarginPct: gross ? Math.round((net / gross) * marginPct * 10) / 10 : 0,
      grossProfit, netProfit, avgDaily, projected, daysInMonth, daily,
    },
    commercial: { topProducts },
    productSku,
    columnRoles,
    inventory:  { inventoryValue, monthlyRestockValue },
    fullProductTable: isQaalane ? fullProductTable : [],
    dailySalesByProduct,
  });
}
