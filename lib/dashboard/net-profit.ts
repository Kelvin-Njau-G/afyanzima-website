/**
 * Net profit projection for the calendar month, per facility, and Dhow's share of it.
 *
 *   Revenue      = billed pharmacy sales so far this month + the remaining days at
 *                  the last 30 days' billed rate (the monthly statements use billed sales)
 *   Gross profit = revenue × (30-day GP margin − logistics % of revenue); the monthly
 *                  statements book logistics into cost of sales
 *   Net profit   = gross profit − opex (average of recent full months)
 *   Dhow profit  = net profit × Dhow's share under the facility's agreement (tier set
 *                  by the month's revenue) + any extra share agreed while a profit-share
 *                  advance is repaid. A loss is carried by Dhow in full.
 *
 * Opex, logistics and the profit-share terms are commercial and partner-specific, and
 * this repository is public, so they come from the NET_PROFIT_CONFIG env var (JSON,
 * generated from the "Pharmacy as a Service revenue 2026" workbook). Shape:
 *
 *   {
 *     "asOf": "2026-10",
 *     "facilities": {
 *       "<EMR organisation name>": {
 *         "opex": 125783, "opexBasis": "Sep–Oct avg", "logistics": 0.008,
 *         "tiers": [[1050000, 0.4], [1500000, 0.5], [null, 0.6]],   // [revenue up to, Dhow share]; null = no cap
 *         "marginal": false,   // true: each revenue band's profit takes its own share (Healmerc)
 *         "uplift": 0.05       // extra Dhow share while an advance is repaid
 *       }
 *     }
 *   }
 */

export type FacilityTerms = {
  opex: number;
  opexBasis?: string;
  logistics?: number;
  tiers: Array<[number | null, number]>;
  marginal?: boolean;
  uplift?: number;
};

export type NetProfitConfig = { asOf?: string; facilities: Record<string, FacilityTerms> };

export function readNetProfitConfig(): NetProfitConfig | null {
  const raw = process.env.NET_PROFIT_CONFIG;
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as NetProfitConfig;
    return c && typeof c.facilities === 'object' ? c : null;
  } catch (e) {
    console.error('[net profit] NET_PROFIT_CONFIG is not valid JSON', e);
    return null;
  }
}

const DEFAULT_LOGISTICS = 0.012;

/** Dhow's share of the month's net profit at this revenue (contract tier + any advance uplift). */
export function dhowShare(t: FacilityTerms, revenue: number): number {
  const tiers = t.tiers.map(([cap, s]) => [cap ?? Infinity, s] as const);
  let share: number;
  if (t.marginal && revenue > 0) {
    // Profit split pro rata to the revenue in each band.
    let lo = 0;
    let acc = 0;
    for (const [cap, s] of tiers) {
      const band = Math.max(0, Math.min(revenue, cap) - lo);
      acc += band * s;
      lo = cap;
      if (revenue <= cap) break;
    }
    share = acc / revenue;
  } else {
    share = (tiers.find(([cap]) => revenue <= cap) ?? tiers[tiers.length - 1])[1];
  }
  return share + (t.uplift ?? 0);
}

export type NetProfitRow = {
  revenue: number; marginPct: number; logisticsPct: number; grossProfit: number;
  opex: number; opexBasis: string | null; netProfit: number;
  dhowSharePct: number; upliftPct: number; dhowProfit: number;
  noBillRevenue: number; noBillDhowProfit: number;
};

export function projectNetProfit(
  t: FacilityTerms,
  x: { monthBilled: number; billedPerDay: number; daysLeft: number; margin: number; monthNoBill: number; noBillPerDay: number },
): NetProfitRow {
  const revenue = x.monthBilled + x.daysLeft * x.billedPerDay;
  const logistics = t.logistics ?? DEFAULT_LOGISTICS;
  const gm = x.margin - logistics;
  const grossProfit = revenue * gm;
  const netProfit = grossProfit - t.opex;
  const share = dhowShare(t, revenue);
  const dhowProfit = netProfit > 0 ? netProfit * share : netProfit;
  // Sales with no bill over the same month (so far + the rest at the 30-day rate), at the same
  // margin and share, are upside not in the statements.
  const noBillRevenue = x.monthNoBill + x.daysLeft * x.noBillPerDay;
  return {
    revenue: Math.round(revenue),
    marginPct: Math.round(gm * 1000) / 10,
    logisticsPct: Math.round(logistics * 1000) / 10,
    grossProfit: Math.round(grossProfit),
    opex: Math.round(t.opex),
    opexBasis: t.opexBasis ?? null,
    netProfit: Math.round(netProfit),
    dhowSharePct: Math.round(share * 1000) / 10,
    upliftPct: Math.round((t.uplift ?? 0) * 1000) / 10,
    dhowProfit: Math.round(dhowProfit),
    noBillRevenue: Math.round(noBillRevenue),
    noBillDhowProfit: Math.round(Math.max(0, noBillRevenue * gm * share)),
  };
}
