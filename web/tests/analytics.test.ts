import { describe, it, expect } from "vitest";
import {
  calculateAbSampleSize,
  twoProportionZTest,
  chiSquareIndependenceTest,
  compareContinuousDistributions,
} from "@/lib/analytics";

describe("Analytics Statistical Engine", () => {
  it("calculates exact A/B sample size matching python pytest assertion", () => {
    // In python/tests/test_funnel_and_metrics.py:
    // sample_plan = calculate_ab_sample_size(0.4892, 0.08, alpha=0.05, power=0.80)
    // assert sample_plan["sample_size_per_variant"] == 2561
    // assert sample_plan["total_sample_size_50_50"] == 5122
    const plan = calculateAbSampleSize(0.4892, 0.08, 0.05, 0.8);
    expect(plan.sample_size_per_variant).toBe(2561);
    expect(plan.total_sample_size_50_50).toBe(5122);
    expect(plan.baseline_rate_pct).toBe(48.92);
    expect(plan.relative_mde_pct).toBe(8.0);
    expect(plan.absolute_mde_pp).toBe(3.91);
  });

  it("computes two-proportion z-test matching python test suite", () => {
    // In python/tests/test_funnel_and_metrics.py:
    // res = two_proportion_z_test(420, 1000, 560, 1000, "Legacy", "Stable")
    // assert res.abs_diff_pp == -14.0
    // assert res.is_significant is True
    // assert res.p_value < 1e-8
    const res = twoProportionZTest(420, 1000, 560, 1000, "Legacy", "Stable");
    expect(res.abs_diff_pp).toBe(-14.0);
    expect(res.is_significant).toBe(true);
    expect(res.p_value).toBeLessThan(1e-8);
    expect(res.rate_a).toBe(42.0);
    expect(res.rate_b).toBe(56.0);
    expect(res.z_stat).toBeCloseTo(-6.2622, 2);
  });

  it("computes chi-square test of independence", () => {
    const chiRes = chiSquareIndependenceTest([
      [5228, 5458],
      [13640, 8851],
    ]);
    expect(chiRes.is_significant).toBe(true);
    expect(chiRes.cramers_v).toBeGreaterThan(0.05);
    expect(chiRes.dof).toBe(1);
  });

  it("compares continuous distributions with Welch t-test & Mann-Whitney", () => {
    const comp = compareContinuousDistributions(
      [3200, 3450, 3600, 3510, 3390],
      [1200, 1350, 1420, 1280, 1500],
    );
    expect(comp.is_significant).toBe(true);
    expect(comp.mean_a).toBeGreaterThan(comp.mean_b);
    expect(comp.welch_p_value).toBeLessThan(0.001);
  });
});
