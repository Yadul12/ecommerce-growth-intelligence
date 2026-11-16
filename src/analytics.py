"""Statistical hypothesis testing, A/B power calculation, and opportunity sizing."""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Sequence
import numpy as np
from scipy import stats


@dataclass(frozen=True)
class ProportionTestResult:
    group_a_name: str
    group_b_name: str
    conv_a: int
    total_a: int
    rate_a: float
    conv_b: int
    total_b: int
    rate_b: float
    abs_diff_pp: float
    rel_lift_pct: float
    z_stat: float
    p_value: float
    ci_95_low_pp: float
    ci_95_high_pp: float
    is_significant: bool


def two_proportion_z_test(
    conv_a: int,
    total_a: int,
    conv_b: int,
    total_b: int,
    group_a_name: str = "Segment A",
    group_b_name: str = "Segment B",
    alpha: float = 0.05,
) -> ProportionTestResult:
    """Two-sided two-proportion Z-test with 95% Wald confidence interval."""
    if total_a <= 0 or total_b <= 0:
        raise ValueError("Sample sizes total_a and total_b must be positive.")

    p_a = conv_a / total_a
    p_b = conv_b / total_b
    p_pool = (conv_a + conv_b) / (total_a + total_b)

    se_pooled = math.sqrt(p_pool * (1.0 - p_pool) * (1.0 / total_a + 1.0 / total_b))
    z_stat = (p_a - p_b) / se_pooled if se_pooled > 0 else 0.0
    p_value = float(2.0 * (1.0 - stats.norm.cdf(abs(z_stat))))

    se_unpooled = math.sqrt(
        (p_a * (1.0 - p_a) / total_a) + (p_b * (1.0 - p_b) / total_b)
    )
    z_crit = stats.norm.ppf(1.0 - alpha / 2.0)
    diff = p_a - p_b
    ci_low = (diff - z_crit * se_unpooled) * 100.0
    ci_high = (diff + z_crit * se_unpooled) * 100.0

    return ProportionTestResult(
        group_a_name=group_a_name,
        group_b_name=group_b_name,
        conv_a=conv_a,
        total_a=total_a,
        rate_a=round(p_a * 100.0, 3),
        conv_b=conv_b,
        total_b=total_b,
        rate_b=round(p_b * 100.0, 3),
        abs_diff_pp=round(diff * 100.0, 3),
        rel_lift_pct=round((diff / p_b) * 100.0, 2) if p_b > 0 else 0.0,
        z_stat=round(z_stat, 4),
        p_value=p_value,
        ci_95_low_pp=round(ci_low, 3),
        ci_95_high_pp=round(ci_high, 3),
        is_significant=(p_value < alpha),
    )


def chi_square_independence_test(
    contingency_table: Sequence[Sequence[int]],
    alpha: float = 0.05,
) -> dict[str, float | int | bool]:
    """Runs Pearson's Chi-Square test of independence with Cramer's V effect size."""
    arr = np.asarray(contingency_table, dtype=float)
    if arr.ndim != 2 or arr.shape[0] < 2 or arr.shape[1] < 2:
        raise ValueError("Contingency table must be 2D with at least 2x2 dimensions.")
    chi2, p_val, dof, _ = stats.chi2_contingency(arr)
    n_total = float(arr.sum())
    min_dim = min(arr.shape[0] - 1, arr.shape[1] - 1)
    cramers_v = math.sqrt(chi2 / (n_total * min_dim)) if n_total > 0 and min_dim > 0 else 0.0
    return {
        "chi2_stat": round(float(chi2), 4),
        "p_value": float(p_val),
        "dof": int(dof),
        "cramers_v": round(cramers_v, 4),
        "is_significant": bool(p_val < alpha),
    }


def compare_continuous_distributions(
    sample_a: Sequence[float],
    sample_b: Sequence[float],
    alpha: float = 0.05,
) -> dict[str, float | bool]:
    """Compares two continuous distributions using both Welch's t-test and Mann-Whitney U test."""
    a = np.asarray(sample_a, dtype=float)
    b = np.asarray(sample_b, dtype=float)
    if len(a) < 2 or len(b) < 2:
        raise ValueError("Both samples must contain at least 2 observations.")

    t_stat, t_pval = stats.ttest_ind(a, b, equal_var=False)
    u_stat, u_pval = stats.mannwhitneyu(a, b, alternative="two-sided")

    return {
        "mean_a": round(float(np.mean(a)), 2),
        "mean_b": round(float(np.mean(b)), 2),
        "median_a": round(float(np.median(a)), 2),
        "median_b": round(float(np.median(b)), 2),
        "welch_t_stat": round(float(t_stat), 4),
        "welch_p_value": float(t_pval),
        "mannwhitney_u_stat": round(float(u_stat), 4),
        "mannwhitney_p_value": float(u_pval),
        "is_significant": bool(u_pval < alpha),
    }


def calculate_ab_sample_size(
    baseline_rate: float,
    relative_mde: float,
    alpha: float = 0.05,
    power: float = 0.80,
) -> dict[str, float | int]:
    """Calculates required per-variant sample size for a two-sided proportion A/B test."""
    if not (0.0 < baseline_rate < 1.0):
        raise ValueError("baseline_rate must be between 0 and 1.")
    if relative_mde <= 0.0:
        raise ValueError("relative_mde must be positive.")

    p1 = baseline_rate
    p2 = min(baseline_rate * (1.0 + relative_mde), 0.9999)
    delta = abs(p2 - p1)
    p_bar = 0.5 * (p1 + p2)

    z_alpha = stats.norm.ppf(1.0 - alpha / 2.0)
    z_beta = stats.norm.ppf(power)

    numerator = (
        z_alpha * math.sqrt(2.0 * p_bar * (1.0 - p_bar))
        + z_beta * math.sqrt(p1 * (1.0 - p1) + p2 * (1.0 - p2))
    ) ** 2
    n_per_arm = math.ceil(numerator / (delta**2))

    return {
        "baseline_rate_pct": round(p1 * 100.0, 2),
        "target_rate_pct": round(p2 * 100.0, 2),
        "absolute_mde_pp": round(delta * 100.0, 2),
        "relative_mde_pct": round(relative_mde * 100.0, 2),
        "sample_size_per_variant": int(n_per_arm),
        "total_sample_size_50_50": int(n_per_arm * 2),
        "alpha": alpha,
        "power": power,
    }
