/**
 * Sales with no bill — the same estimate as the daily PaaS digest (revenue.py).
 *
 *   No-bill M-Pesa = customer receipts into the facility's paybill account whose
 *                    code is on no bill (codes folded O→0, I→1; receipts that
 *                    arrived after the EMR snapshot ends are left out, since they
 *                    may still be billed).
 *   No-bill cash   = cash a staff/cashier phone banks beyond the cash recorded on
 *                    bills since its last banking (carried day to day).
 *
 * Staff phones come from the `pharmacy_staff_cash_desposits` sheet plus the
 * hashed phones in the EXTRA_STAFF_PAYERS env var (comma-separated). They are
 * kept out of the code because this repository is public.
 *
 * The paybill sheet is slow to read, so the query runs as a BigQuery script
 * that reads it once into a temp table (like card 3437, the code check).
 */

/** Paybill account each facility's customers pay into. */
export const TILLS: Array<{ acct: string; org: string }> = [
  { acct: '2', org: 'Libken Medical Centre Limited' },
  { acct: '3', org: 'Well Living Medical Clinic' },
  { acct: '6', org: 'Healmerc Pharmacy Limited' },
  { acct: '8', org: 'Ndipo Pharm Pharmacy' },
  { acct: '9', org: 'Pharmtech Global Pharmacy' },
  { acct: '10', org: 'Dense Pharmacy' },
  { acct: '11', org: 'DeboMart Medical Centre' },
  { acct: '12', org: 'Palms Chemist' },
  { acct: '514636', org: 'Qaalane Pharmacy and Medical Centre' },
];

const q = (s: string) => `'${s.replace(/[^A-Za-z0-9 &\-.]/g, '')}'`;

export function unbilledQuery(from: string): object {
  const tills = TILLS.map((t) => `(${q(t.acct)}, ${q(t.org)})`).join(',\n  ');
  const extra = (process.env.EXTRA_STAFF_PAYERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f]{64}$/i.test(s))
    .map((s) => `'${s.toLowerCase()}'`);
  const sql = `
DECLARE d0 DATE DEFAULT DATE '${from.replace(/[^0-9-]/g, '')}';
DECLARE till_list ARRAY<STRUCT<acct STRING, org STRING>> DEFAULT [
  ${tills}
];
DECLARE extra_staff ARRAY<STRING> DEFAULT [${extra.join(', ')}];
DECLARE emr_to DATETIME;
SET emr_to = (SELECT MAX(DATETIME(created_at, 'Africa/Nairobi')) FROM \`ilara_emr_dataset.bill-payment\`);

-- Paybill receipts: bank-statement prefixes cut, the same receipt loaded twice kept once,
-- transfers that are not sales dropped
CREATE TEMP TABLE pb AS
SELECT
  REGEXP_REPLACE(UPPER(TRIM(t.reference)), r'^S[0-9]+-', '') AS ref,
  tl.org, t.amount, t.date AS paid_at, TRIM(t.phone_number) AS payer
FROM \`google_sheets.paybill_transactions_reporting\` t
JOIN UNNEST(till_list) tl ON tl.acct = TRIM(t.account_number)
WHERE t.date >= DATETIME(d0)
  AND NOT REGEXP_CONTAINS(UPPER(IFNULL(t.name, '')), 'DHOW HEALTH')
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY t.date, REGEXP_REPLACE(UPPER(TRIM(t.reference)), r'^S[0-9]+-', ''), TRIM(t.account_number), t.amount
  ORDER BY t.date) = 1;

CREATE TEMP TABLE staff AS
SELECT DISTINCT TRIM(phone_number) AS phone FROM \`google_sheets.pharmacy_staff_cash_desposits\` WHERE phone_number IS NOT NULL
UNION DISTINCT SELECT x FROM UNNEST(extra_staff) x;

-- Every M-Pesa code typed on any bill (comma-joined or run-together codes split), folded O→0 I→1
CREATE TEMP TABLE used AS
SELECT DISTINCT TRANSLATE(IF(LENGTH(tok) > 10 AND MOD(LENGTH(tok), 10) = 0, SUBSTR(tok, off + 1, 10), tok), 'OI', '01') AS code
FROM \`ilara_emr_dataset.bill-payment\` bp,
UNNEST(REGEXP_EXTRACT_ALL(REPLACE(UPPER(IFNULL(bp.reference_id, '')), 'REFERENCE', ' '), r'[A-Z0-9]+')) tok,
UNNEST(IF(LENGTH(tok) > 10 AND MOD(LENGTH(tok), 10) = 0, GENERATE_ARRAY(0, LENGTH(tok) - 10, 10), [0])) off
WHERE bp.created_at >= TIMESTAMP(DATE_SUB(d0, INTERVAL 5 DAY), 'Africa/Nairobi') AND bp.reference_id IS NOT NULL;

WITH r AS (
  SELECT p.org, DATE(p.paid_at) AS d, p.amount,
    TRANSLATE(p.ref, 'OI', '01') IN (SELECT code FROM used) AS billed,
    p.payer IN (SELECT phone FROM staff) AS is_staff,
    p.paid_at > emr_to AS late
  FROM pb p
),
agg AS (
  SELECT org, d,
    -- a staff phone paying a bill is a customer payment made from that phone; the rest is cash being banked
    SUM(IF(NOT billed AND NOT is_staff AND NOT late, amount, 0)) AS unbilled_mpesa,
    COUNTIF(NOT billed AND NOT is_staff AND NOT late) AS unbilled_n,
    SUM(IF(NOT billed AND is_staff AND NOT late, amount, 0)) AS banked
  FROM r GROUP BY 1, 2
),
cash AS (
  SELECT o.organization_name AS org, DATE(bp.created_at, 'Africa/Nairobi') AS d, SUM(bp.amount) AS cash
  FROM \`ilara_emr_dataset.bill-payment\` bp
  JOIN \`ilara_emr_dataset.bill\` b ON b.id = bp.bill_id
  JOIN \`ilara_emr_dataset.organization\` o ON o.organization_id = b.organization_id
  JOIN UNNEST(till_list) tl ON tl.org = o.organization_name
  WHERE UPPER(bp.payment_method) = 'CASH' AND bp.created_at >= TIMESTAMP(d0, 'Africa/Nairobi')
  GROUP BY 1, 2
),
feed AS (SELECT org, MIN(paid_at) AS feed_min, MAX(paid_at) AS feed_max FROM pb GROUP BY org)
SELECT
  COALESCE(a.org, c.org) AS org,
  CAST(COALESCE(a.d, c.d) AS STRING) AS d,
  IFNULL(a.unbilled_mpesa, 0) AS unbilled_mpesa,
  IFNULL(a.unbilled_n, 0) AS unbilled_n,
  IFNULL(a.banked, 0) AS banked,
  IFNULL(c.cash, 0) AS cash_on_bills,
  CAST(f.feed_min AS STRING) AS feed_min,
  CAST(f.feed_max AS STRING) AS feed_max,
  CAST(emr_to AS STRING) AS emr_to
FROM agg a
FULL JOIN cash c ON a.org = c.org AND a.d = c.d
LEFT JOIN feed f ON f.org = COALESCE(a.org, c.org)
ORDER BY 1, 2;
`;
  return { database: 5, type: 'native', native: { query: sql } };
}

type MbResult = { data?: { cols: { name: string; display_name: string }[]; rows: unknown[][] } };

export type UnbilledDay = { mpesa: number; mpesaN: number; cash: number };
export type UnbilledFacility = {
  /** Per Nairobi day: no-bill M-Pesa, its receipt count, and banked cash beyond cash billed. */
  days: Record<string, UnbilledDay>;
  /** First and last day the paybill feed covers (Qaalane's comes from bank statements). */
  feedFrom: string | null;
  feedTo: string | null;
};

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

/**
 * Per facility and day. Banked cash beyond the cash on bills is carried day to day:
 * cash billed but not yet banked is "pending", and only banking beyond that pending
 * amount counts as cash with no bill (revenue.py's rule).
 */
export function parseUnbilled(res: MbResult | null): { byFacility: Record<string, UnbilledFacility>; emrTo: string | null } | null {
  if (!res?.data) return null;
  const cols = res.data.cols.map((c) => c.name);
  const i = (n: string) => cols.indexOf(n);
  const c = {
    org: i('org'), d: i('d'), mp: i('unbilled_mpesa'), n: i('unbilled_n'), banked: i('banked'),
    cash: i('cash_on_bills'), fmin: i('feed_min'), fmax: i('feed_max'), emr: i('emr_to'),
  };
  const rows = res.data.rows;
  const byFacility: Record<string, UnbilledFacility> = {};
  let emrTo: string | null = null;
  const grouped: Record<string, unknown[][]> = {};
  for (const r of rows) {
    const org = String(r[c.org] ?? '');
    if (!org) continue;
    (grouped[org] ??= []).push(r);
    if (r[c.emr]) emrTo = String(r[c.emr]).slice(0, 16);
  }
  for (const [org, rs] of Object.entries(grouped)) {
    rs.sort((a, b) => String(a[c.d]).localeCompare(String(b[c.d])));
    const feedFrom = rs[0][c.fmin] ? String(rs[0][c.fmin]).slice(0, 10) : null;
    const feedTo = rs[0][c.fmax] ? String(rs[0][c.fmax]).slice(0, 10) : null;
    let pend = 0;
    const days: Record<string, UnbilledDay> = {};
    for (const r of rs) {
      const d = String(r[c.d]).slice(0, 10);
      const cashBilled = num(r[c.cash]);
      const banked = num(r[c.banked]);
      const gap = Math.max(0, banked - (pend + cashBilled));
      pend = Math.max(0, pend + cashBilled - banked);
      // Days the feed doesn't cover (a bank statement not loaded yet) can't be judged.
      const covered = (!feedFrom || d >= feedFrom) && (!feedTo || d <= feedTo);
      days[d] = covered ? { mpesa: num(r[c.mp]), mpesaN: num(r[c.n]), cash: gap } : { mpesa: 0, mpesaN: 0, cash: 0 };
    }
    byFacility[org] = { days, feedFrom, feedTo };
  }
  return { byFacility, emrTo };
}
