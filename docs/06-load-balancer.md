# Load Balancer

**File:** `backend/app/models/load_balancer.py`

The load balancer analyzes the current electricity distribution across all meters and suggests **redistribution actions** when the grid is imbalanced — some zones overloaded while others have spare capacity.

---

## The Problem

Imagine 10 industrial zones, each with a rated capacity of **900 kW**:

```
Zone 1:  ████████████████████████░░  870 kW (97%)  ⚠ OVERLOADED
Zone 2:  ████████████████░░░░░░░░░░  620 kW (69%)  ● Normal
Zone 3:  ██████████████████████░░░░  780 kW (87%)  ⚠ OVERLOADED
Zone 4:  ████████░░░░░░░░░░░░░░░░░░  320 kW (36%)  ○ Underloaded
Zone 5:  █████████████████░░░░░░░░░  660 kW (73%)  ● Normal
Zone 6:  ██████░░░░░░░░░░░░░░░░░░░░  250 kW (28%)  ○ Underloaded
```

Zones 1 and 3 are near capacity (risk of tripping), while zones 4 and 6 have plenty of headroom. The load balancer identifies this imbalance and suggests shifting load.

---

## Classification Thresholds

```python
OVERLOAD_THRESHOLD = 0.85    # >85% of 900 kW = >765 kW
UNDERLOAD_THRESHOLD = 0.40   # <40% of 900 kW = <360 kW
RATED_CAPACITY_KW = 900.0    # Maximum rated load per zone
```

Each meter is classified into one of three categories:

| Utilization | Status | Meaning |
|------------|--------|---------|
| > 85% | Overloaded | Risk of equipment tripping, needs load reduction |
| 40% – 85% | Normal | Healthy operating range |
| < 40% | Underloaded | Has spare capacity to absorb shifted load |

---

## The Algorithm

```python
def analyze_load_distribution(meter_loads: dict[str, float]) -> dict:
    # Step 1: Classify each meter
    overloaded = []
    underloaded = []
    normal = []

    for meter_id, load in meter_loads.items():
        utilization = load / RATED_CAPACITY_KW
        if utilization > OVERLOAD_THRESHOLD:
            overloaded.append(entry)
        elif utilization < UNDERLOAD_THRESHOLD:
            underloaded.append(entry)
        else:
            normal.append(entry)

    # Step 2: Sort for optimal matching
    overloaded.sort(key=lambda x: x["utilization"], reverse=True)
    # Most overloaded first — these need help most urgently
    underloaded.sort(key=lambda x: x["utilization"])
    # Least utilized first — these have most headroom
```

### Step 3: Generate Recommendations

The algorithm pairs each overloaded zone with an underloaded zone:

```python
while over_idx < len(overloaded) and under_idx < len(underloaded):
    source = overloaded[over_idx]
    target = underloaded[under_idx]

    # How much excess does the source have?
    source_excess = source["load_kw"] - (OVERLOAD_THRESHOLD * RATED_CAPACITY_KW)
    # Example: 870 - 765 = 105 kW excess

    # How much can the target absorb?
    target_headroom = (OVERLOAD_THRESHOLD * RATED_CAPACITY_KW) - target["load_kw"]
    # Example: 765 - 320 = 445 kW headroom

    # Shift 50% of the possible amount (conservative approach)
    shift = min(source_excess, target_headroom) * 0.5
    # Example: min(105, 445) * 0.5 = 52.5 kW

    if shift > 10:  # Only recommend if meaningful (>10 kW)
        recommendations.append(BalanceRecommendation(
            source_meter=source["meter_id"],
            target_meter=target["meter_id"],
            shift_kw=round(shift, 2),
            reason=f"{source['meter_id']} at 97% — shift {shift:.0f} kW to {target['meter_id']} (36%)",
            priority="high" if source["utilization"] > 0.95 else "medium",
        ))
```

**Why shift only 50%?** Conservative load balancing prevents over-correction. Shifting 100% might overload the target zone or cause oscillating corrections.

---

## Example Output

```json
{
  "status": "imbalanced",
  "total_load_kw": 5420.0,
  "avg_load_kw": 542.0,
  "overloaded": [
    { "meter_id": "meter_001", "load_kw": 870.0, "utilization": 0.967 }
  ],
  "underloaded": [
    { "meter_id": "meter_006", "load_kw": 250.0, "utilization": 0.278 }
  ],
  "recommendations": [
    {
      "source_meter": "meter_001",
      "target_meter": "meter_006",
      "shift_kw": 52.5,
      "reason": "meter_001 at 97% utilization, shift 53 kW to meter_006 (28% utilization)",
      "priority": "high"
    }
  ]
}
```

---

## API Integration

The load balancer is called from `GET /api/predictions/balance`:

```python
@router.get("/balance")
async def get_load_balance():
    # 1. Read current loads from Redis (fast)
    r = await get_redis()
    meter_ids = await r.smembers("meters:all")
    meter_loads = {}
    for meter_id in meter_ids:
        data = await r.hgetall(f"meter:{meter_id}:latest")
        if data:
            meter_loads[meter_id] = float(data["load_kw"])

    # 2. Run the analysis
    analysis = analyze_load_distribution(meter_loads)

    return LoadBalanceResponse(**analysis)
```

The function is stateless — it takes the current snapshot and returns recommendations. No database query needed since we read from Redis cache.
