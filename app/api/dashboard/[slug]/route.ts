import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { checkPassword, FACILITIES } from '@/lib/facilities';

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

function topProductsQuery(facilityName: string, monthStart: string, monthEnd: string, limit = 20) {
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
  if (!FACILITIES[slug]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { password } = await req.json();
  if (!checkPassword(slug, password)) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });

  const facilityName = FACILITIES[slug].name;
  const today = new Date();
  const monthPrefix = today.toISOString().slice(0, 7);
  const monthLabel  = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayStr    = today.toISOString().slice(0, 10);
  const monthStart  = `${monthPrefix}-01`;
  const nextMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthEnd    = nextMonth.toISOString().slice(0, 10);

  const auth = (await mbFetch('/api/session', { username: MB_USER, password: MB_PASS })) as { id: string };
  const token = auth.id;

  const isQaalane = slug === QAALANE_SLUG;

  // Parallel fetch all cards
  const fetches: Promise<unknown>[] = [
    mbFetch('/api/card/2262/query', {}, token),   // 0: daily revenue per facility
    mbFetch('/api/card/2536/query', {}, token),   // 1: discounts / net revenue
    mbFetch('/api/card/2410/query', {}, token),   // 2: gross margin %
    mbFetch('/api/dataset', topProductsQuery(facilityName, monthStart, monthEnd, 20), token), // 3: top 20 products
    mbFetch('/api/card/2507/query', {}, token),   // 4: inventory value by class
    mbFetch('/api/card/1661/query', {}, token),   // 5: monthly restock value
    mbFetch('/api/card/3193/query', {}, token),   // 6: daily COGS & profit
    mbFetch('/api/card/3191/query', {}, token),   // 7: daily sales by product
  ];
  if (isQaalane) {
    fetches.push(mbFetch('/api/dataset', topProductsQuery(facilityName, monthStart, monthEnd, 500), token)); // 8
    fetches.push(mbFetch('/api/card/2501/query', {}, token)); // 9
  }

  const results = await Promise.all(fetches) as MbResult[];
  const [dailyRes, discRes, marginRes, topProdRes, invByClassRes, restockRes, dailyProfitRes, dailyByProdRes] = results;

  // ── Daily revenue ────────────────────────────────────────────────────────────
  const monthRows = dailyRes.data.rows.filter(r => typeof r[0] === 'string' && r[0].startsWith(monthPrefix));
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
  const discRow = discRes.data.rows.find(r => typeof r[0] === 'string' && r[0].startsWith(monthPrefix) && r[1] === facilityName);
  const gross       = Math.round((discRow?.[2] as number) || 0);
  const discountPct = Math.round(((discRow?.[3] as number) || 0) * 1000) / 10;
  const discountAmt = Math.round((discRow?.[4] as number) || 0);
  const net         = Math.round((discRow?.[5] as number) || 0);

  // ── Margin ───────────────────────────────────────────────────────────────────
  const margins: Record<string, number> = {};
  for (const row of marginRes.data.rows) {
    if (typeof row[0] === 'string' && row[0].startsWith(monthPrefix))
      margins[row[1] as string] = Math.round((row[2] as number) * 1000) / 10;
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
    if (!d.startsWith(monthPrefix)) continue;
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
      label: `${today.toLocaleDateString('en-GB', { month: 'short' })} ${parseInt(d.slice(8))}`,
      revenue,
      cogs:   Math.max(0, cogs),
      profit: Math.max(0, profit),
    };
  });

  const completeDays = daily.filter(d => d.date < todayStr && d.revenue > 0).map(d => d.revenue);
  const avgDaily    = completeDays.length ? Math.round(completeDays.reduce((a, b) => a + b, 0) / completeDays.length) : 0;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projected   = avgDaily * daysInMonth;

  // ── Top 20 products ──────────────────────────────────────────────────────────
  const topProducts = topProdRes.data.rows.map(row => ({
    product: row[0] as string,
    sku:     row[1] as string,
    qty:     Math.round((row[2] as number) || 0),
    revenue: Math.round((row[3] as number) || 0),
    margin:  (row[3] as number) > 0 ? Math.round(((row[4] as number) / (row[3] as number)) * 1000) / 10 : 0,
  }));

  // ── Inventory value ──────────────────────────────────────────────────────────
  const invRows = invByClassRes.data.rows.filter(r => r[0] === facilityName);
  const inventoryValue = Math.round(invRows.reduce((s, r) => s + ((r[2] as number) || 0), 0));

  // ── Monthly restock ──────────────────────────────────────────────────────────
  const restockRows = restockRes.data.rows.filter(
    r => r[0] === facilityName && typeof r[1] === 'string' && r[1].startsWith(monthPrefix)
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
      if (typeof rawD === 'string' && !rawD.startsWith(monthPrefix)) return false;
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
        // Truncate datetime strings to date-only for cleaner display
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) return val.slice(0, 10);
        return val as string | number | null;
      })
    ),
  };

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

  return NextResponse.json({
    facility: facilityName,
    monthLabel,
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
    inventory:  { inventoryValue, monthlyRestockValue },
    fullProductTable: isQaalane ? fullProductTable : [],
    dailySalesByProduct,
  });
}
