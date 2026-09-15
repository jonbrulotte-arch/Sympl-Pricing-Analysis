import type { RateTuple, ForwardPassResult, VerificationCheck } from "./types";
import { computeFeeRate, forwardPass, solveGoalPrice } from "./engine";

const TOL = 1e-6;
const SOLVE_TOL = 1e-9;

function check(
  what: string,
  routeA: string,
  a: number,
  routeB: string,
  b: number,
  tolerance = TOL,
  cmp?: string,
): VerificationCheck {
  return {
    what,
    routeA,
    a,
    routeB,
    b,
    ok: Math.abs(a - b) < tolerance,
    cmp: cmp ?? "=",
  };
}

function gte(
  what: string,
  routeA: string,
  a: number,
  routeB: string,
  b: number,
): VerificationCheck {
  return { what, routeA, a, routeB, b, ok: a >= b - TOL, cmp: ">=" };
}

export function verifyAnalysis(
  P: number,
  r: RateTuple,
  commR: number,
  royRate: number,
  royFlat: number,
  fvfFixed: number,
  ppc: number,
  units: number,
  shipping: number,
  cost: number,
  goalUsed: number,
  cur: ForwardPassResult,
  rec: number | null,
  recCalc: ForwardPassResult | null,
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];

  // 1. Sale base after coupon
  checks.push(
    check(
      "Sale base after coupon",
      "list - coupon",
      P - P * r.c,
      "list * (1 - couponRate)",
      P * (1 - r.c),
    ),
  );

  // 2. Sales tax
  const saleBase = P - P * r.c;
  checks.push(
    check("Sales tax", "(list - coupon) * taxRate", saleBase * r.t, "saleBase * taxRate", cur.saleBase * r.t),
  );

  // 3. Sold price
  checks.push(
    check(
      "Sold price (incl. tax)",
      "saleBase + tax",
      saleBase + saleBase * r.t,
      "list * (1-c) * (1+t)",
      P * (1 - r.c) * (1 + r.t),
    ),
  );

  // 4. Fee base carries tax
  checks.push(
    check(
      "Fee base carries tax",
      "sold price",
      cur.sold,
      "list - coupon + tax",
      P - P * r.c + saleBase * r.t,
    ),
  );

  // 5. Net revenue after fees
  const independentNet =
    saleBase * units -
    (cur.coupon + cur.fvfRate + fvfFixed + cur.promo + cur.roy + cur.ccVar + cur.ret + cur.ad) * units -
    r.ccFlat -
    ppc;
  checks.push(
    check(
      "Net revenue after fees",
      "saleBase*U - allocations",
      saleBase * units - cur.alloc + cur.coupon * units,
      "independent calc",
      independentNet + cur.coupon * units,
    ),
  );

  // 6. Total allocations
  const kP =
    (cur.coupon + cur.fvfRate + fvfFixed + cur.promo + cur.roy + cur.ccVar + cur.ret + cur.ad) * units + r.ccFlat;
  checks.push(check("Total allocations", "sum of fees", cur.fees, "component sum", kP));

  // 7. Net margin
  const netViaRevenue = P * units - cur.alloc - shipping - cost * units;
  checks.push(check("Net margin", "revenue - alloc - ship - cost*U", cur.net, "independent route", netViaRevenue));

  // 8. Net GM%
  const gmViaNet = P * units > 0 ? cur.net / (P * units) : 0;
  checks.push(check("Net GM%", "net / revenue", cur.gm, "net / (P*U)", gmViaNet));

  // 9. Fee rate k composition
  const k = computeFeeRate(r, commR, royRate);
  const saleRate = 1 - r.c;
  const grossUp = saleRate * (1 + r.t);
  const kSum =
    r.c +
    grossUp * commR * (1 - r.tsd) +
    grossUp * r.promo +
    saleRate * royRate +
    saleRate * r.ccPct +
    saleRate * r.ret +
    saleRate * r.ad;
  checks.push(check("Fee rate k composition", "computeFeeRate()", k, "component sum", kSum));

  // 10. Goal price solves exactly
  const flatUnit = fvfFixed + royFlat;
  const flatOrder = r.ccFlat + ppc;
  const { price: solvedP, achievable } = solveGoalPrice(cost, units, shipping, k, goalUsed, flatUnit, flatOrder);
  if (achievable) {
    const solvedCalc = forwardPass(solvedP, r, commR, royRate, royFlat, fvfFixed, ppc, units, shipping, cost);
    checks.push(check("Goal price solves exactly", "solved GM%", solvedCalc.gm, "goal", goalUsed, SOLVE_TOL));
  }

  // 11. Rounded price re-analyzed matches
  if (rec != null && recCalc != null) {
    const recheck = forwardPass(rec, r, commR, royRate, royFlat, fvfFixed, ppc, units, shipping, cost);
    checks.push(check("Rounded price re-analyzed", "recCalc.gm", recCalc.gm, "recheck.gm", recheck.gm));
  }

  // 12. Rounded price clears goal
  if (recCalc != null) {
    checks.push(gte("Rounded price clears goal", "recCalc.gm", recCalc.gm, "goal", goalUsed));
  }

  return checks;
}
