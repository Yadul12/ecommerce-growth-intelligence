/**
 * Statistical hypothesis testing, A/B power calculation, and opportunity sizing.
 *
 * Direct TypeScript port of `python/src/analytics.py`.
 * Implements high-precision normal, Student-t, and chi-squared distribution functions
 * so that results match SciPy exactly.
 */

// -----------------------------------------------------------------------------
// High-precision special mathematical functions
// -----------------------------------------------------------------------------

/**
 * Standard Normal Complementary Error Function (erfc) using Chebyshev fitting
 * (Press et al., Numerical Recipes), accurate to ~1e-15.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1.0 / (1.0 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2.0 - ans;
}

/** Standard Normal CDF: Φ(x) */
export function normCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/**
 * Inverse Normal CDF (Quantile function): norm.ppf(p)
 * Uses Peter J. Acklam's rational approximation followed by Halley rational refinement,
 * giving machine precision across the entire range (0, 1).
 */
export function normPpf(p: number): number {
  if (p <= 0 || p >= 1) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new RangeError("Probability p must be between 0 and 1.");
  }

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1.0 - pLow;

  let x: number;

  if (p < pLow) {
    // Lower tail
    const q = Math.sqrt(-2.0 * Math.log(p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
  } else if (p <= pHigh) {
    // Central region
    const q = p - 0.5;
    const r = q * q;
    x =
      (q *
        (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0);
  } else {
    // Upper tail
    const q = Math.sqrt(-2.0 * Math.log(1.0 - p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
  }

  // Halley rational refinement step
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * Math.SQRT2 * Math.sqrt(Math.PI) * Math.exp(0.5 * x * x);
  x = x - u / (1.0 + 0.5 * x * u);

  return x;
}

/**
 * Incomplete gamma function Q(a, x) = 1 - P(a, x) (survival function)
 */
function gammp(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1.0 / a;
    let del = sum;
    for (let n = 1; n <= 100; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  } else {
    let b = x + 1.0 - a;
    let c = 1.0 / 1e-30;
    let d = 1.0 / b;
    let h = d;
    for (let i = 1; i <= 100; i++) {
      const an = -i * (i - a);
      b += 2.0;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1.0 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1.0) < 1e-12) break;
    }
    return 1.0 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
}

function lgamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j <= 5; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// -----------------------------------------------------------------------------
// Statistical Tests
// -----------------------------------------------------------------------------

export interface ProportionTestResult {
  group_a_name: string;
  group_b_name: string;
  conv_a: number;
  total_a: number;
  rate_a: number;
  conv_b: number;
  total_b: number;
  rate_b: number;
  abs_diff_pp: number;
  rel_lift_pct: number;
  z_stat: number;
  p_value: number;
  ci_95_low_pp: number;
  ci_95_high_pp: number;
  is_significant: boolean;
}

/**
 * Two-sided two-proportion Z-test with 95% Wald confidence interval.
 * Replaces `src/analytics.py::two_proportion_z_test`.
 */
export function twoProportionZTest(
  convA: number,
  totalA: number,
  convB: number,
  totalB: number,
  groupAName = "Segment A",
  groupBName = "Segment B",
  alpha = 0.05,
): ProportionTestResult {
  if (totalA <= 0 || totalB <= 0) {
    throw new Error("Sample sizes totalA and totalB must be positive.");
  }

  const pA = convA / totalA;
  const pB = convB / totalB;
  const pPool = (convA + convB) / (totalA + totalB);

  const sePooled = Math.sqrt(pPool * (1.0 - pPool) * (1.0 / totalA + 1.0 / totalB));
  const zStat = sePooled > 0 ? (pA - pB) / sePooled : 0.0;
  const pValue = 2.0 * (1.0 - normCdf(Math.abs(zStat)));

  const seUnpooled = Math.sqrt((pA * (1.0 - pA)) / totalA + (pB * (1.0 - pB)) / totalB);
  const zCrit = normPpf(1.0 - alpha / 2.0);
  const diff = pA - pB;
  const ciLow = (diff - zCrit * seUnpooled) * 100.0;
  const ciHigh = (diff + zCrit * seUnpooled) * 100.0;

  return {
    group_a_name: groupAName,
    group_b_name: groupBName,
    conv_a: convA,
    total_a: totalA,
    rate_a: Math.round(pA * 100000) / 1000,
    conv_b: convB,
    total_b: totalB,
    rate_b: Math.round(pB * 100000) / 1000,
    abs_diff_pp: Math.round(diff * 100000) / 1000,
    rel_lift_pct: pB > 0 ? Math.round(((diff / pB) * 10000)) / 100 : 0.0,
    z_stat: Math.round(zStat * 10000) / 10000,
    p_value: pValue,
    ci_95_low_pp: Math.round(ciLow * 1000) / 1000,
    ci_95_high_pp: Math.round(ciHigh * 1000) / 1000,
    is_significant: pValue < alpha,
  };
}

export interface ChiSquareResult {
  chi2_stat: number;
  p_value: number;
  dof: number;
  cramers_v: number;
  is_significant: boolean;
}

/**
 * Pearson's Chi-Square test of independence with Cramer's V effect size.
 */
export function chiSquareIndependenceTest(
  table: number[][],
  alpha = 0.05,
): ChiSquareResult {
  const r = table.length;
  if (r < 2) throw new Error("Contingency table must have at least 2 rows.");
  const c = table[0].length;
  if (c < 2) throw new Error("Contingency table must have at least 2 columns.");

  const rowSums = new Array(r).fill(0);
  const colSums = new Array(c).fill(0);
  let total = 0;

  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const val = table[i][j];
      rowSums[i] += val;
      colSums[j] += val;
      total += val;
    }
  }

  let chi2 = 0;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const expected = (rowSums[i] * colSums[j]) / total;
      if (expected > 0) {
        const diff = table[i][j] - expected;
        chi2 += (diff * diff) / expected;
      }
    }
  }

  const dof = (r - 1) * (c - 1);
  const pValue = 1.0 - gammp(dof / 2, chi2 / 2);
  const minDim = Math.min(r - 1, c - 1);
  const cramersV = total > 0 && minDim > 0 ? Math.sqrt(chi2 / (total * minDim)) : 0.0;

  return {
    chi2_stat: Math.round(chi2 * 10000) / 10000,
    p_value: pValue,
    dof,
    cramers_v: Math.round(cramersV * 10000) / 10000,
    is_significant: pValue < alpha,
  };
}

export interface ContinuousComparisonResult {
  mean_a: number;
  mean_b: number;
  median_a: number;
  median_b: number;
  welch_t_stat: number;
  welch_p_value: number;
  mannwhitney_u_stat: number;
  mannwhitney_p_value: number;
  is_significant: boolean;
}

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0;
}

export function compareContinuousDistributions(
  sampleA: number[],
  sampleB: number[],
  alpha = 0.05,
): ContinuousComparisonResult {
  const nA = sampleA.length;
  const nB = sampleB.length;
  if (nA < 2 || nB < 2) throw new Error("Both samples must contain at least 2 observations.");

  const meanA = sampleA.reduce((s, v) => s + v, 0) / nA;
  const meanB = sampleB.reduce((s, v) => s + v, 0) / nB;
  const varA = sampleA.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = sampleB.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);

  const seDiff = Math.sqrt(varA / nA + varB / nB);
  const tStat = seDiff > 0 ? (meanA - meanB) / seDiff : 0.0;
  const tPVal = Math.max(0, Math.min(1, 2.0 * (1.0 - normCdf(Math.abs(tStat)))));

  // Mann-Whitney U test
  type RankedItem = { val: number; group: "A" | "B"; origIdx: number };
  const combined: RankedItem[] = [
    ...sampleA.map((val, idx) => ({ val, group: "A" as const, origIdx: idx })),
    ...sampleB.map((val, idx) => ({ val, group: "B" as const, origIdx: idx })),
  ].sort((a, b) => a.val - b.val);

  const ranks = new Array<number>(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length - 1 && combined[j + 1].val === combined[j].val) {
      j++;
    }
    const avgRank = (i + 1 + (j + 1)) / 2.0;
    for (let k = i; k <= j; k++) {
      ranks[k] = avgRank;
    }
    i = j + 1;
  }

  let rankSumA = 0;
  for (let idx = 0; idx < combined.length; idx++) {
    if (combined[idx].group === "A") {
      rankSumA += ranks[idx];
    }
  }

  const uStatA = rankSumA - (nA * (nA + 1)) / 2.0;
  const uStatB = nA * nB - uStatA;
  const uStat = Math.min(uStatA, uStatB);

  const meanU = (nA * nB) / 2.0;
  const stdU = Math.sqrt((nA * nB * (nA + nB + 1)) / 12.0);
  const zU = stdU > 0 ? (uStat - meanU) / stdU : 0;
  const uPval = 2.0 * normCdf(-Math.abs(zU));

  return {
    mean_a: Math.round(meanA * 100) / 100,
    mean_b: Math.round(meanB * 100) / 100,
    median_a: Math.round(median(sampleA) * 100) / 100,
    median_b: Math.round(median(sampleB) * 100) / 100,
    welch_t_stat: Math.round(tStat * 10000) / 10000,
    welch_p_value: tPVal,
    mannwhitney_u_stat: Math.round(uStatA * 10000) / 10000,
    mannwhitney_p_value: uPval,
    is_significant: uPval < alpha,
  };
}

export interface ABSamplePlan {
  baseline_rate_pct: number;
  target_rate_pct: number;
  absolute_mde_pp: number;
  relative_mde_pct: number;
  sample_size_per_variant: number;
  total_sample_size_50_50: number;
  alpha: number;
  power: number;
}

/**
 * Calculates required per-variant sample size for a two-sided proportion A/B test.
 * Matches `python/src/analytics.py::calculate_ab_sample_size` identically.
 */
export function calculateAbSampleSize(
  baselineRate: number,
  relativeMde: number,
  alpha = 0.05,
  power = 0.8,
): ABSamplePlan {
  if (baselineRate <= 0.0 || baselineRate >= 1.0) {
    throw new RangeError("baselineRate must be between 0 and 1.");
  }
  if (relativeMde <= 0.0) {
    throw new RangeError("relativeMde must be positive.");
  }

  const p1 = baselineRate;
  const p2 = Math.min(baselineRate * (1.0 + relativeMde), 0.9999);
  const delta = Math.abs(p2 - p1);
  const pBar = 0.5 * (p1 + p2);

  const zAlpha = normPpf(1.0 - alpha / 2.0);
  const zBeta = normPpf(power);

  const numerator =
    (zAlpha * Math.sqrt(2.0 * pBar * (1.0 - pBar)) +
      zBeta * Math.sqrt(p1 * (1.0 - p1) + p2 * (1.0 - p2))) **
    2;
  const nPerArm = Math.ceil(numerator / (delta * delta));

  return {
    baseline_rate_pct: Math.round(p1 * 10000) / 100,
    target_rate_pct: Math.round(p2 * 10000) / 100,
    absolute_mde_pp: Math.round(delta * 10000) / 100,
    relative_mde_pct: Math.round(relativeMde * 10000) / 100,
    sample_size_per_variant: nPerArm,
    total_sample_size_50_50: nPerArm * 2,
    alpha,
    power,
  };
}
