"""
Load Balancer — Smart Grid Optimization

Simple optimization logic that analyzes current load distribution
across meters and suggests redistribution actions.
"""

from dataclasses import dataclass


# ── Configuration ──────────────────────────────────────────────
# Capacity thresholds (as fraction of rated capacity)
OVERLOAD_THRESHOLD = 0.85    # >85% → overloaded
UNDERLOAD_THRESHOLD = 0.40   # <40% → underloaded
RATED_CAPACITY_KW = 900.0    # Rated capacity per meter zone (kW)


@dataclass
class BalanceRecommendation:
    """A single load redistribution recommendation."""
    source_meter: str
    target_meter: str
    shift_kw: float
    reason: str
    priority: str  # "high", "medium", "low"


def analyze_load_distribution(meter_loads: dict[str, float]) -> dict:
    """
    Analyze the current load distribution and return status + recommendations.

    Args:
        meter_loads: dict mapping meter_id -> current load_kw

    Returns:
        {
            "status": "balanced" | "imbalanced",
            "total_load_kw": float,
            "avg_load_kw": float,
            "overloaded": [...],
            "underloaded": [...],
            "normal": [...],
            "recommendations": [...]
        }
    """
    if not meter_loads:
        return {
            "status": "no_data",
            "total_load_kw": 0,
            "avg_load_kw": 0,
            "overloaded": [],
            "underloaded": [],
            "normal": [],
            "recommendations": [],
        }

    total_load = sum(meter_loads.values())
    avg_load = total_load / len(meter_loads)

    overloaded = []
    underloaded = []
    normal = []

    for meter_id, load in meter_loads.items():
        utilization = load / RATED_CAPACITY_KW
        entry = {
            "meter_id": meter_id,
            "load_kw": round(load, 2),
            "utilization": round(utilization, 3),
        }
        if utilization > OVERLOAD_THRESHOLD:
            overloaded.append(entry)
        elif utilization < UNDERLOAD_THRESHOLD:
            underloaded.append(entry)
        else:
            normal.append(entry)

    # Sort by utilization for matching
    overloaded.sort(key=lambda x: x["utilization"], reverse=True)
    underloaded.sort(key=lambda x: x["utilization"])

    # Generate recommendations
    recommendations = []
    over_idx = 0
    under_idx = 0

    while over_idx < len(overloaded) and under_idx < len(underloaded):
        source = overloaded[over_idx]
        target = underloaded[under_idx]

        source_excess = source["load_kw"] - (OVERLOAD_THRESHOLD * RATED_CAPACITY_KW)
        target_headroom = (OVERLOAD_THRESHOLD * RATED_CAPACITY_KW) - target["load_kw"]
        shift = min(source_excess, target_headroom) * 0.5  # Shift 50% of the possible

        if shift > 10:  # Only recommend if shift is meaningful (>10 kW)
            priority = "high" if source["utilization"] > 0.95 else "medium"
            recommendations.append(
                BalanceRecommendation(
                    source_meter=source["meter_id"],
                    target_meter=target["meter_id"],
                    shift_kw=round(shift, 2),
                    reason=(
                        f"{source['meter_id']} at {source['utilization']:.0%} utilization, "
                        f"shift {shift:.0f} kW to {target['meter_id']} "
                        f"({target['utilization']:.0%} utilization)"
                    ),
                    priority=priority,
                )
            )

        over_idx += 1
        under_idx += 1

    return {
        "status": "imbalanced" if overloaded else "balanced",
        "total_load_kw": round(total_load, 2),
        "avg_load_kw": round(avg_load, 2),
        "overloaded": overloaded,
        "underloaded": underloaded,
        "normal": normal,
        "recommendations": [
            {
                "source_meter": r.source_meter,
                "target_meter": r.target_meter,
                "shift_kw": r.shift_kw,
                "reason": r.reason,
                "priority": r.priority,
            }
            for r in recommendations
        ],
    }
