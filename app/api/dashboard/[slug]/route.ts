import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { checkPassword, FACILITIES } from '@/lib/facilities';

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

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;

  if (!FACILITIES[slug]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { password } = await req.json();
  if (!checkPassword(slug, password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const facilityName = FACILITIES[slug].name;
  const today = new Date();
  const monthPrefix = today.toISOString().slice(0, 7); // YYYY-MM
  const monthLabel = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayStr = today.toISOString().slice(0, 10);

  // Auth
  const auth = (await mbFetch('/api/session', { username: MB_USER, password: MB_PASS })) as {
    id: string;
  };
  const token = auth.id;

  // Parallel fetch: daily revenue (2262), discounts (2536), margins (2410)
  const [dailyRes, discRes, marginRes] = await Promise.all([
    mbFetch('/api/card/2262/query', {}, token),
    mbFetch('/api/card/2536/query', {}, token),
    mbFetch('/api/card/2410/query', {}, token),
  ]) as [{ data: { rows: unknown[][] } }, { data: { rows: unknown[][] } }, { data: { rows: unknown[][] } }];

  // Daily revenue per facility
  const monthRows = dailyRes.data.rows.filter(
    (r) => typeof r[0] === 'string' && r[0].startsWith(monthPrefix),
  );
  const byDate: Record<string, Record<string, number>> = {};
  const activeFacilities = new Set<string>();
  for (const row of monthRows) {
    const d = (row[0] as string).slice(0, 10);
    const fac = row[1] as string;
    const rev = Math.round((row[2] as number) || 0);
    byDate[d] ??= {};
    byDate[d][fac] = rev;
    activeFacilities.add(fac);
  }
  const dates = Object.keys(byDate).sort();
  const allFacilities = [...activeFacilities].sort();

  // Discounts for this facility
  const discRow = discRes.data.rows.find(
    (r) => typeof r[0] === 'string' && r[0].startsWith(monthPrefix) && r[1] === facilityName,
  );
  const gross = Math.round((discRow?.[2] as number) || 0);
  const discountPct = Math.round(((discRow?.[3] as number) || 0) * 1000) / 10;
  const discountAmt = Math.round((discRow?.[4] as number) || 0);
  const net = Math.round((discRow?.[5] as number) || 0);

  // Margins
  const margins: Record<string, number> = {};
  for (const row of marginRes.data.rows) {
    if (typeof row[0] === 'string' && row[0].startsWith(monthPrefix)) {
      margins[row[1] as string] = Math.round((row[2] as number) * 1000) / 10;
    }
  }
  const marginPct = margins[facilityName] ?? 0;
  const grossProfit = Math.round(gross * marginPct / 100);

  // Per-facility daily data
  const daily = dates.map((d) => ({
    date: d,
    label: `${today.toLocaleDateString('en-GB', { month: 'short' })} ${parseInt(d.slice(8))}`,
    revenue: byDate[d]?.[facilityName] ?? 0,
  }));
  const completeDays = daily.filter((d) => d.date < todayStr && d.revenue > 0).map((d) => d.revenue);
  const avgDaily = completeDays.length
    ? Math.round(completeDays.reduce((a, b) => a + b, 0) / completeDays.length)
    : 0;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projected = avgDaily * daysInMonth;

  // All-facilities stacked dataset
  const dataset: Record<string, number[]> = {};
  for (const fac of allFacilities) {
    dataset[fac] = dates.map((d) => byDate[d]?.[fac] ?? 0);
  }

  return NextResponse.json({
    facility: facilityName,
    monthLabel,
    generatedAt: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }),
    dates,
    dateLabels: daily.map((d) => d.label),
    allFacilities,
    margins,
    dataset,
    metrics: {
      gross,
      net,
      discountAmt,
      discountPct,
      marginPct,
      netMarginPct: gross ? Math.round((net / gross) * marginPct * 10) / 10 : 0,
      grossProfit,
      avgDaily,
      projected,
      daysInMonth,
      daily,
    },
  });
}
