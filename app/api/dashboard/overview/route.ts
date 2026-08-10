import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { checkDashboardPassword } from '@/lib/facilities';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { portalDb } from '@/lib/portal/db';

const BASE = process.env.METABASE_URL!.replace(/\/$/, '');
const MB_USER = process.env.METABASE_USER!;
const MB_PASS = process.env.METABASE_PASSWORD!;

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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
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

  const today = new Date();
  const monthPrefix = today.toISOString().slice(0, 7);
  const monthLabel  = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayStr    = today.toISOString().slice(0, 10);
  const monthStart  = `${monthPrefix}-01`;
  const nextMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthEnd    = nextMonth.toISOString().slice(0, 10);

  const auth = (await mbFetch('/api/session', { username: MB_USER, password: MB_PASS })) as { id: string };
  const token = auth.id;

  const topProductsQuery = {
    database: 5, type: 'query',
    query: {
      'source-table': 'card__1788',
      filter: ['and',
        ['=',  ['field', 'Department', { 'base-type': 'type/Text' }], 'Pharmacy'],
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
      limit: 20,
    },
  };

  const [dailyRes, discRes, marginRes, topProdRes, invByClassRes, restockRes] = await Promise.all([
    mbFetch('/api/card/2262/query', {}, token),
    mbFetch('/api/card/2536/query', {}, token),
    mbFetch('/api/card/2410/query', {}, token),
    mbFetch('/api/dataset', topProductsQuery, token),
    mbFetch('/api/card/2507/query', {}, token),
    mbFetch('/api/card/1661/query', {}, token),
  ]) as Array<{ data: { rows: unknown[][] } }>;

  // Daily revenue per facility
  const monthRows = dailyRes.data.rows.filter(
    (r) => typeof r[0] === 'string' && r[0].startsWith(monthPrefix),
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
  const allFacilities = Array.from(activeFacilities).sort();
  const dateLabels = dates.map((d) => `${today.toLocaleDateString('en-GB', { month: 'short' })} ${parseInt(d.slice(8))}`);

  // Margins
  const margins: Record<string, number> = {};
  for (const row of marginRes.data.rows) {
    if (typeof row[0] === 'string' && row[0].startsWith(monthPrefix)) {
      margins[row[1] as string] = Math.round((row[2] as number) * 1000) / 10;
    }
  }

  // Per-facility summary
  const facilitySummary: Record<string, {
    gross: number; net: number; discountAmt: number; discountPct: number;
    marginPct: number; grossProfit: number; avgDaily: number; projected: number;
  }> = {};

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  for (const fac of allFacilities) {
    const discRow = discRes.data.rows.find(
      (r) => typeof r[0] === 'string' && r[0].startsWith(monthPrefix) && r[1] === fac,
    );
    const gross = Math.round((discRow?.[2] as number) || 0);
    const net = Math.round((discRow?.[5] as number) || 0);
    const discountAmt = Math.round((discRow?.[4] as number) || 0);
    const discountPct = Math.round(((discRow?.[3] as number) || 0) * 1000) / 10;
    const marginPct = margins[fac] ?? 0;
    const grossProfit = Math.round(gross * marginPct / 100);

    const completeDays = dates
      .filter((d) => d < todayStr && (byDate[d]?.[fac] ?? 0) > 0)
      .map((d) => byDate[d][fac]);
    const avgDaily = completeDays.length
      ? Math.round(completeDays.reduce((a, b) => a + b, 0) / completeDays.length)
      : 0;

    facilitySummary[fac] = { gross, net, discountAmt, discountPct, marginPct, grossProfit, avgDaily, projected: avgDaily * daysInMonth };
  }

  // Network totals
  const totalGross = allFacilities.reduce((s, f) => s + facilitySummary[f].gross, 0);
  const totalNet = allFacilities.reduce((s, f) => s + facilitySummary[f].net, 0);
  const totalDiscount = allFacilities.reduce((s, f) => s + facilitySummary[f].discountAmt, 0);
  const totalProfit = allFacilities.reduce((s, f) => s + facilitySummary[f].grossProfit, 0);
  const totalProjected = allFacilities.reduce((s, f) => s + facilitySummary[f].projected, 0);
  const avgMargin = totalGross ? Math.round((totalProfit / totalGross) * 1000) / 10 : 0;

  // Stacked dataset
  const dataset: Record<string, number[]> = {};
  for (const fac of allFacilities) {
    dataset[fac] = dates.map((d) => byDate[d]?.[fac] ?? 0);
  }

  // Top 20 products across network
  const topProducts = topProdRes.data.rows.map(row => ({
    product: row[0] as string,
    sku:     row[1] as string,
    qty:     Math.round((row[2] as number) || 0),
    revenue: Math.round((row[3] as number) || 0),
    margin:  (row[3] as number) > 0 ? Math.round(((row[4] as number) / (row[3] as number)) * 1000) / 10 : 0,
  }));

  // Inventory value per facility (card 2507: org, class, value)
  const inventoryByFacility: Record<string, number> = {};
  for (const row of invByClassRes.data.rows) {
    const fac = row[0] as string;
    inventoryByFacility[fac] = (inventoryByFacility[fac] ?? 0) + ((row[2] as number) || 0);
  }
  const totalInventoryValue = Math.round(Object.values(inventoryByFacility).reduce((s, v) => s + v, 0));

  // Monthly restock per facility (card 1661)
  const restockByFacility: Record<string, number> = {};
  for (const row of restockRes.data.rows) {
    if (typeof row[1] === 'string' && row[1].startsWith(monthPrefix)) {
      const fac = row[0] as string;
      restockByFacility[fac] = (restockByFacility[fac] ?? 0) + ((row[6] as number) || 0);
    }
  }
  const totalRestockValue = Math.round(Object.values(restockByFacility).reduce((s, v) => s + v, 0));

  return NextResponse.json({
    monthLabel,
    generatedAt: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }),
    dates,
    dateLabels,
    allFacilities,
    margins,
    dataset,
    facilitySummary,
    network: { totalGross, totalNet, totalDiscount, totalProfit, totalProjected, avgMargin, daysInMonth, totalInventoryValue, totalRestockValue },
    commercial: { topProducts },
    inventory: { inventoryByFacility: Object.fromEntries(Object.entries(inventoryByFacility).map(([k,v]) => [k, Math.round(v)])), restockByFacility: Object.fromEntries(Object.entries(restockByFacility).map(([k,v]) => [k, Math.round(v)])) },
  });
}
