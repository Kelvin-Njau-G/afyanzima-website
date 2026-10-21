import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import crypto from 'crypto';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { portalDb } from '@/lib/portal/db';

/**
 * Investor dashboard (/investors): monthly commercial performance per PaaS
 * facility, from January 2026.
 *
 * Sources
 *   card 1788 (Base-Orders)  net revenue, gross profit (net revenue − COGS),
 *                            transactions and category, per day — the same
 *                            source as the internal overview dashboard
 *   card 3438                month-end pharmacy stock at cost, for stock turnover
 *
 * Facilities are whatever card 1788 reports. "Active" means the facility sold
 * something in the last 14 days, so a facility that leaves drops out of the
 * facility table on its own while its history stays in the network figures.
 */

export const maxDuration = 60;

const BASE = process.env.METABASE_URL!.replace(/\/$/, '');
const MB_USER = process.env.METABASE_USER!;
const MB_PASS = process.env.METABASE_PASSWORD!;

const STOCK_CARD = 3438;
const START_MONTH = '2026-01';
const WEEKS = 26;
const ACTIVE_WINDOW_DAYS = 14;

// SHA-256 of the investor password (the password itself is not in the repo).
// Set INVESTOR_PASSWORD_HASH in Vercel to change it without a code change.
const INVESTOR_PASSWORD_HASH =
  process.env.INVESTOR_PASSWORD_HASH || '905b08d4d2868d8caa8fc20fbd1fea06bc3448dbf64ae2e8ccedbcf4bafebd1d';

/** Therapeutic categories (card 1788 sku_category) grouped for investors. */
const CATEGORY_GROUPS: Record<string, string[]> = {
  'Anti-infectives': ['antimicrobials', 'urinary tract infections', 'combination therapy'],
  'Chronic care': ['cardiometabolic', 'anti-asthma', 'endocrine', 'anti-convulsants', 'antipsychotic', 'antidepressant',
    "alzheimer's disease", 'dopamine agonist', 'antiplatelets', 'anticoagulant', 'hyperthyroidism'],
  'Pain & inflammation': ['analgesics', 'analgesic', 'nsaids', 'steroids', 'muscle relaxant', 'antispasmodic',
    'anaesthetics', 'analgesic and antiseptic'],
  'Cough, cold & allergy': ['cough', 'cough syrup', 'antihistamines', 'nasal decongestant'],
  'Digestive health': ['gastrointestinal', 'probiotics', 'hemorrhoids'],
  'Wellness & sexual health': ['supplements', 'hematinics', 'complements', 'family planning', 'sexual health', 'uterotonic', 'vaccine'],
};
const OTHER_CATEGORY = 'Personal care & supplies';
/** Injectables cut across categories, so they're picked out by product name. */
const INJECTABLE_WORDS = ['INJ', 'INFUSION', 'VIAL', 'AMPOUL'];
const categoryOf = (sku: unknown) => {
  const s = String(sku ?? '').trim().toLowerCase();
  for (const [group, members] of Object.entries(CATEGORY_GROUPS)) if (members.includes(s)) return group;
  return OTHER_CATEGORY;
};

type MbResult = { data?: { cols: { name: string; display_name: string }[]; rows: unknown[][] }; error?: string };

function mbFetch(path: string, body?: object, token?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Metabase-Session'] = token;
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));
    const url = new URL(BASE + path);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: body ? 'POST' : 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const round = (v: number) => Math.round(v);
const pct1 = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const one = (v: number) => Math.round(v * 10) / 10;

function nairobiDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);
}
function addDays(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const daysInMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};
const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

// Card 1788 fields
const F = (name: string, type = 'type/Text') => ['field', name, { 'base-type': type }];
const T = (unit: string) => ['field', 'Cart_Time', { 'base-type': 'type/DateTimeWithLocalTZ', 'temporal-unit': unit }];
const NET = F('Sale_Amount', 'type/Float');
const PHARMACY = ['=', F('Department'), 'Pharmacy'];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Portal admins get in with their session; the investor uses the password.
  let authorised = false;
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const { data: user } = await portalDb.from('portal_users').select('role, is_active').eq('id', session.sub).maybeSingle();
    authorised = !!user && user.is_active && user.role === 'admin';
  }
  if (!authorised && typeof body?.password === 'string') {
    const hash = crypto.createHash('sha256').update(body.password).digest('hex');
    authorised = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(INVESTOR_PASSWORD_HASH));
  }
  if (!authorised) return NextResponse.json({ error: 'Not authorised' }, { status: 401 });

  const today = nairobiDate();
  const currentMonth = today.slice(0, 7);
  // Complete Monday–Sunday weeks: the last one ends on the most recent Sunday before today.
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = addDays(today, -dow);
  const firstWeek = addDays(thisMonday, -7 * WEEKS);
  const queryFrom = firstWeek < `${START_MONTH}-01` ? firstWeek : `${START_MONTH}-01`;

  const auth = (await mbFetch('/api/session', { username: MB_USER, password: MB_PASS })) as { id: string };
  const token = auth.id;
  const dataset = (q: object) => mbFetch('/api/dataset', q, token) as Promise<MbResult>;

  let dailyRes: MbResult, catRes: MbResult, stockRows: Array<Record<string, unknown>>;
  try {
    [dailyRes, catRes, stockRows] = await Promise.all([
      dataset({
        database: 5, type: 'query',
        query: {
          'source-table': 'card__1788',
          filter: ['and', PHARMACY, ['>=', T('minute'), `${queryFrom}T00:00:00`], ['<', T('minute'), `${today}T00:00:00`]],
          aggregation: [['sum', NET], ['sum', F('Profit', 'type/Float')], ['sum', F('COGS', 'type/Float')], ['distinct', F('Order_Number')]],
          breakout: [T('day'), F('Organization_Name')],
          limit: 10000,
        },
      }),
      dataset({
        database: 5, type: 'query',
        query: {
          'source-table': 'card__1788',
          filter: ['and', PHARMACY, ['>=', T('minute'), `${START_MONTH}-01T00:00:00`], ['<', T('minute'), `${currentMonth}-01T00:00:00`]],
          aggregation: [['sum', NET], ['sum', F('Profit', 'type/Float')],
            ['sum-where', NET, ['or', ...INJECTABLE_WORDS.map((w) => ['contains', F('Product'), w, { 'case-sensitive': false }])]]],
          breakout: [T('month'), F('Organization_Name'), F('sku_category')],
          limit: 10000,
        },
      }),
      // The export endpoint has no 2,000-row cap; the card covers every organisation.
      mbFetch(`/api/card/${STOCK_CARD}/query/json`, {}, token) as Promise<Array<Record<string, unknown>>>,
    ]);
  } catch (e) {
    console.error('[investors] metabase:', e);
    return NextResponse.json({ error: 'Data unavailable' }, { status: 502 });
  }
  if (!dailyRes?.data || !catRes?.data || !Array.isArray(stockRows)) {
    console.error('[investors] metabase error:', dailyRes?.error, catRes?.error);
    return NextResponse.json({ error: 'Data unavailable' }, { status: 502 });
  }

  // ── Daily figures per facility ─────────────────────────────────────────────
  type Day = { net: number; gp: number; cogs: number; orders: number };
  const daily: Array<Day & { date: string; org: string }> = dailyRes.data.rows
    .filter((r) => r[1])
    .map((r) => ({ date: String(r[0]).slice(0, 10), org: String(r[1]), net: num(r[2]), gp: num(r[3]), cogs: num(r[4]), orders: num(r[5]) }));

  const activeSince = addDays(today, -ACTIVE_WINDOW_DAYS);
  const active = new Set(daily.filter((d) => d.date >= activeSince && d.net > 0).map((d) => d.org));

  // ── Month-end stock per facility ───────────────────────────────────────────
  const stock = new Map<string, number>(); // `${org}|YYYY-MM` → value at that month's end
  for (const r of stockRows) {
    const date = String(r['Snapshot Date'] ?? '').slice(0, 10);
    const org = String(r['Organization Name'] ?? '');
    if (date && date.slice(0, 7) < currentMonth) stock.set(`${org}|${date.slice(0, 7)}`, num(r['Stock Value']));
  }

  // ── Months ─────────────────────────────────────────────────────────────────
  const months: string[] = [];
  for (let m = START_MONTH; m < currentMonth; ) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }

  type FacMonth = Day & { days: number };
  const byOrgMonth = new Map<string, FacMonth>(); // `${org}|YYYY-MM`
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    if (m < START_MONTH || m >= currentMonth) continue;
    const k = `${d.org}|${m}`;
    const a = byOrgMonth.get(k) ?? { net: 0, gp: 0, cogs: 0, orders: 0, days: 0 };
    a.net += d.net; a.gp += d.gp; a.cogs += d.cogs; a.orders += d.orders;
    if (d.net > 0) a.days += 1;
    byOrgMonth.set(k, a);
  }
  const orgsIn = (m: string) =>
    Array.from(byOrgMonth.keys()).filter((k) => k.endsWith(`|${m}`) && byOrgMonth.get(k)!.net > 0).map((k) => k.split('|')[0]);

  /** COGS × 12 ÷ average stock, plus days of stock, for a set of facilities in a month. */
  function stockTurn(orgs: string[], m: string) {
    let cogs = 0, avgStock = 0, endStock = 0;
    for (const org of orgs) {
      const end = stock.get(`${org}|${m}`);
      if (end == null) continue;
      const tradedBefore = (byOrgMonth.get(`${org}|${prevMonth(m)}`)?.net ?? 0) > 0;
      const start = tradedBefore ? stock.get(`${org}|${prevMonth(m)}`) : undefined;
      cogs += byOrgMonth.get(`${org}|${m}`)!.cogs;
      avgStock += start != null ? (start + end) / 2 : end;
      endStock += end;
    }
    if (!avgStock || !cogs) return { turnover: null, daysOfStock: null };
    return { turnover: one((cogs * 12) / avgStock), daysOfStock: round(endStock / (cogs / daysInMonth(m))) };
  }

  const sumOf = (orgs: string[], m: string) =>
    orgs.reduce((a, org) => {
      const f = byOrgMonth.get(`${org}|${m}`)!;
      return { net: a.net + f.net, gp: a.gp + f.gp, orders: a.orders + f.orders };
    }, { net: 0, gp: 0, orders: 0 });

  // ── Category mix (active facilities) ───────────────────────────────────────
  const cats = new Map<string, Map<string, { net: number; gp: number }>>(); // month → group → figures
  const injectables = new Map<string, Map<string, { inj: number; net: number }>>(); // month → org → figures
  for (const r of catRes.data.rows) {
    const m = String(r[0]).slice(0, 7);
    const org = String(r[1] ?? '');
    if (!active.has(org)) continue;
    const g = categoryOf(r[2]);
    const mc = cats.get(m) ?? new Map();
    const c = mc.get(g) ?? { net: 0, gp: 0 };
    c.net += num(r[3]); c.gp += num(r[4]);
    mc.set(g, c); cats.set(m, mc);
    const mi = injectables.get(m) ?? new Map();
    const i = mi.get(org) ?? { inj: 0, net: 0 };
    i.inj += num(r[5]); i.net += num(r[3]);
    mi.set(org, i); injectables.set(m, mi);
  }

  // ── Per month: headline figures, facility table, categories ────────────────
  const monthly = months.map((m) => {
    const orgs = orgsIn(m);
    const net = sumOf(orgs, m);
    const prevOrgs = orgsIn(prevMonth(m));
    const prev = months.includes(prevMonth(m)) ? sumOf(prevOrgs, prevMonth(m)) : null;
    const days = daysInMonth(m);
    const perDay = net.net / days;
    const prevPerDay = prev ? prev.net / daysInMonth(prevMonth(m)) : null;
    const activeOrgs = orgs.filter((o) => active.has(o));
    const exitedOrgs = orgs.filter((o) => !active.has(o));
    const activeSum = sumOf(activeOrgs, m);
    const exitedSum = sumOf(exitedOrgs, m);
    const turn = stockTurn(orgs, m);

    const facilities = activeOrgs
      .map((org) => {
        const f = byOrgMonth.get(`${org}|${m}`)!;
        const p = byOrgMonth.get(`${org}|${prevMonth(m)}`);
        const fPerDay = f.days ? f.net / f.days : 0;
        const pPerDay = p && p.net > 0 && p.days ? p.net / p.days : null;
        return {
          facility: org,
          net: round(f.net),
          perDay: round(fPerDay),
          perDayChangePct: pPerDay ? one(((fPerDay - pPerDay) / pPerDay) * 100) : null,
          // New = didn't trade the month before (unknown for the first month shown)
          isNew: months.includes(prevMonth(m)) && !pPerDay,
          marginPct: pct1(f.gp, f.net),
          transactions: f.orders,
          basket: f.orders ? round(f.net / f.orders) : null,
          turnover: stockTurn([org], m).turnover,
        };
      })
      .sort((a, b) => b.net - a.net);

    const mc = cats.get(m) ?? new Map<string, { net: number; gp: number }>();
    const catTotal = Array.from(mc.values()).reduce((s, c) => s + c.net, 0);
    const categories = Array.from(mc.entries())
      .map(([group, c]) => ({ group, net: round(c.net), sharePct: pct1(c.net, catTotal), marginPct: pct1(c.gp, c.net) }))
      .sort((a, b) => b.net - a.net);
    const mi = injectables.get(m) ?? new Map<string, { inj: number; net: number }>();
    const injTotal = Array.from(mi.values()).reduce((s, x) => s + x.inj, 0);
    const injTop = Array.from(mi.entries())
      .map(([facility, x]) => ({ facility, sharePct: pct1(x.inj, x.net) ?? 0 }))
      .filter((x) => x.sharePct >= 5)
      .sort((a, b) => b.sharePct - a.sharePct)
      .slice(0, 3);

    return {
      month: m,
      days,
      net: round(net.net),
      netChangePct: prev?.net ? one(((net.net - prev.net) / prev.net) * 100) : null,
      perDay: round(perDay),
      perDayChangePct: prevPerDay ? one(((perDay - prevPerDay) / prevPerDay) * 100) : null,
      marginPct: pct1(net.gp, net.net),
      marginChangePts: prev?.net ? one((net.gp / net.net - prev.gp / prev.net) * 100) : null,
      transactions: net.orders,
      basket: net.orders ? round(net.net / net.orders) : null,
      turnover: turn.turnover,
      daysOfStock: turn.daysOfStock,
      activeNet: round(activeSum.net),
      exitedNet: round(exitedSum.net),
      activeMarginPct: pct1(activeSum.gp, activeSum.net),
      facilityCount: orgs.length,
      facilities,
      exited: exitedOrgs.length
        ? { count: exitedOrgs.length, net: round(exitedSum.net), marginPct: pct1(exitedSum.gp, exitedSum.net), transactions: exitedSum.orders }
        : null,
      categories,
      injectablesPct: pct1(injTotal, catTotal),
      injectablesTop: injTop,
    };
  });

  // ── Weekly series: last 26 complete Monday–Sunday weeks ────────────────────
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(firstWeek, 7 * i);
    const end = addDays(start, 7);
    const rows = daily.filter((d) => d.date >= start && d.date < end);
    const act = rows.filter((d) => active.has(d.org));
    const ex = rows.filter((d) => !active.has(d.org));
    const s = (xs: typeof rows, k: 'net' | 'gp') => xs.reduce((a, d) => a + d[k], 0);
    return {
      weekStart: start,
      activeNet: round(s(act, 'net')),
      exitedNet: round(s(ex, 'net')),
      marginPct: pct1(s(rows, 'gp'), s(rows, 'net')),
      activeMarginPct: pct1(s(act, 'gp'), s(act, 'net')),
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }),
    monthly,
    weekly,
  });
}
