/**
 * Cashless M-Pesa code check — Metabase card 3437.
 *
 * Every pharmacy bill payment should carry a unique M-Pesa code that exists in
 * the paybill feed and covers the bill. The card does the matching in BigQuery
 * (last 8 days) and returns four kinds of rows, which this module turns into
 * the shape the dashboard renders. Go-live dates live in the card's SQL
 * (`cashless_list`), so adding a facility to the check needs no deploy.
 *
 * The card reads the paybill Google Sheet and takes ~15–20s, so the dashboards
 * fetch it on its own after the main page has loaded.
 */

export const CODE_CHECK_CARD = 3437;

export type CodeCheckFacility = {
  facility: string;
  /** Day the facility stopped taking cash, or null if it hasn't. */
  cashlessSince: string | null;
  /** Latest receipt in this facility's paybill feed (Qaalane's till syncs daily). */
  feedSyncedTo: string | null;
};

export type CodeCheckStaffDay = {
  date: string; facility: string; staff: string;
  lines: number; cashLines: number; cashKes: number; exceptions: number;
};

export type CodeCheckIssue = {
  date: string; facility: string; staff: string | null; time: string;
  bill: string | null; kes: number; code: string | null; issue: string; detail: string | null;
};

export type CodeCheckData = {
  /** The 8 days covered, oldest first; the last one is today. */
  dates: string[];
  /** The EMR copy in BigQuery is a snapshot; nothing after this is checked yet. */
  emrSyncedTo: string | null;
  facilities: CodeCheckFacility[];
  staffDays: CodeCheckStaffDay[];
  /** Bill-side problems and till receipts no bill points to. */
  issues: CodeCheckIssue[];
};

type MbCol = { name: string; display_name: string };
type MbResult = { data?: { cols: MbCol[]; rows: unknown[][] } };

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10));
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

function nairobiDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);
}

/** Parse the card; pass `onlyFacility` to keep a single facility's rows. */
export function parseCodeCheck(res: MbResult, onlyFacility?: string): CodeCheckData | null {
  if (!res?.data) return null;
  const cols = res.data.cols.map((c) => c.display_name || c.name);
  const i = (name: string) => cols.indexOf(name);
  const c = {
    type: i('Row Type'), date: i('Date'), fac: i('Facility'), staff: i('Staff'), time: i('Time'),
    bill: i('Bill'), kes: i('KES'), code: i('Code'), issue: i('Issue'), detail: i('Detail'),
    lines: i('Lines'), cashLines: i('Cash Lines'), cashKes: i('Cash KES'), exc: i('Exceptions'),
    since: i('Cashless Since'),
  };
  if (Object.values(c).some((x) => x === -1)) return null;

  const keep = (r: unknown[]) => !onlyFacility || r[c.fac] === onlyFacility;
  const rows = res.data.rows.filter(keep);

  const today = nairobiDate();
  const dates = Array.from({ length: 8 }, (_, k) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (7 - k));
    return d.toISOString().slice(0, 10);
  });

  const facilityRows = rows.filter((r) => r[c.type] === 'facility');
  return {
    dates,
    emrSyncedTo: str(facilityRows[0]?.[c.time]),
    facilities: facilityRows.map((r) => ({
      facility: String(r[c.fac]),
      cashlessSince: day(r[c.since]),
      feedSyncedTo: str(r[c.detail]),
    })),
    staffDays: rows
      .filter((r) => r[c.type] === 'staff_day')
      .map((r) => ({
        date: day(r[c.date])!, facility: String(r[c.fac]), staff: str(r[c.staff]) ?? 'Unknown',
        lines: num(r[c.lines]), cashLines: num(r[c.cashLines]), cashKes: Math.round(num(r[c.cashKes])),
        exceptions: num(r[c.exc]),
      })),
    issues: rows
      .filter((r) => r[c.type] === 'exception' || r[c.type] === 'receipt')
      .map((r) => ({
        date: day(r[c.date])!, facility: String(r[c.fac]), staff: str(r[c.staff]), time: String(r[c.time] ?? ''),
        bill: str(r[c.bill]), kes: Math.round(num(r[c.kes])), code: str(r[c.code]),
        issue: String(r[c.issue]), detail: str(r[c.detail]),
      })),
  };
}
