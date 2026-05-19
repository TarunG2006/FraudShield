import numpy as np

FEATURE_COLS = [
    'amount', 'hour_of_day', 'day_of_week', 'is_weekend',
    'is_night', 'is_foreign_country', 'transaction_count_1h',
    'transaction_count_24h', 'amount_vs_avg_ratio',
    'is_new_merchant', 'is_high_risk_category'
]

HIGH_RISK_CATS = {'unknown', 'crypto', 'wire_transfer', 'gambling', 'pawn_shop'}


def extract_features(data: dict) -> np.ndarray:
    """
    Extract consistent 11-feature vector from a raw transaction dict.
    All keys are optional — safe defaults applied if missing.
    """
    amount       = float(data.get('amount', 0))
    hour         = int(data.get('hour_of_day', data.get('hour', 12)))
    dow          = int(data.get('day_of_week', 0))
    is_weekend   = int(data.get('is_weekend', int(dow >= 5)))
    is_night     = int(data.get('is_night', int(hour < 5 or hour >= 23)))
    is_foreign   = int(bool(data.get('is_foreign_country', 0)))
    vel_1h       = int(data.get('transaction_count_1h', 1))
    vel_24h      = int(data.get('transaction_count_24h', 1))
    amt_ratio    = float(data.get('amount_vs_avg_ratio', 1.0))
    is_new_merch = int(bool(data.get('is_new_merchant', 0)))
    cat          = str(data.get('merchant_category', '')).lower()
    is_high_risk = int(data.get('is_high_risk_category', int(cat in HIGH_RISK_CATS)))

    return np.array([
        amount, hour, dow, is_weekend, is_night, is_foreign,
        vel_1h, vel_24h, amt_ratio, is_new_merch, is_high_risk
    ], dtype=float).reshape(1, -1)


def validate_features(data: dict) -> tuple[bool, str]:
    if not isinstance(data, dict):
        return False, 'features must be a JSON object'
    amount = data.get('amount', 0)
    if not isinstance(amount, (int, float)) or amount < 0:
        return False, 'amount must be a non-negative number'
    hour = data.get('hour_of_day', data.get('hour', 0))
    if not isinstance(hour, (int, float)) or not (0 <= int(hour) <= 23):
        return False, 'hour must be between 0 and 23'
    return True, 'ok'