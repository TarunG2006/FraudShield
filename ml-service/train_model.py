"""
train.py — Train Isolation Forest on synthetic fraud-pattern data.

Synthetic data is intentional: features are engineered to match
the app's inference pipeline exactly. Real public datasets (PaySim,
Credit Card Fraud) use incompatible feature spaces.

Run once before starting the Flask server:
    python train.py
"""

import os
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

SEED = 42
np.random.seed(SEED)

FEATURE_COLS = [
    'amount',
    'hour_of_day',
    'day_of_week',
    'is_weekend',
    'is_night',
    'is_foreign_country',
    'transaction_count_1h',
    'transaction_count_24h',
    'amount_vs_avg_ratio',
    'is_new_merchant',
    'is_high_risk_category',
]

N_NORMAL  = 2700
N_ANOMALY = 300   # 10% contamination matches isolation forest contamination param

# ── Generate normal transactions ──────────────────────────────────────────────
def make_normal(n):
    hours = np.random.choice(range(7, 23), n)     # business hours
    dow   = np.random.randint(0, 7, n)
    return np.column_stack([
        np.random.exponential(150, n).clip(5, 3000),   # amount
        hours,                                          # hour_of_day
        dow,                                            # day_of_week
        (dow >= 5).astype(int),                        # is_weekend
        ((hours < 5) | (hours >= 23)).astype(int),     # is_night
        np.random.binomial(1, 0.05, n),                # is_foreign_country
        np.random.randint(1, 4, n),                    # transaction_count_1h
        np.random.randint(1, 8, n),                    # transaction_count_24h
        np.random.normal(1.0, 0.4, n).clip(0.1, 4.0), # amount_vs_avg_ratio
        np.random.binomial(1, 0.08, n),                # is_new_merchant
        np.random.binomial(1, 0.04, n),                # is_high_risk_category
    ])

# ── Generate anomalous transactions (fraud patterns) ─────────────────────────
def make_anomalous(n):
    # Fraud pattern: night + foreign + high velocity + high amount
    hours = np.random.choice(list(range(0, 5)) + list(range(22, 24)), n)
    dow   = np.random.randint(0, 7, n)
    return np.column_stack([
        np.random.exponential(900, n).clip(500, 15000),  # high amounts
        hours,                                            # night hours
        dow,
        (dow >= 5).astype(int),
        ((hours < 5) | (hours >= 23)).astype(int),
        np.random.binomial(1, 0.65, n),                  # mostly foreign
        np.random.randint(5, 20, n),                     # high velocity 1h
        np.random.randint(10, 40, n),                    # high velocity 24h
        np.random.exponential(4.5, n).clip(2.0, 25.0),  # high ratio
        np.random.binomial(1, 0.75, n),                  # new merchant
        np.random.binomial(1, 0.55, n),                  # high risk category
    ])

print('[train] Generating synthetic training data ...')
X_normal   = make_normal(N_NORMAL)
X_anomaly  = make_anomalous(N_ANOMALY)
X_all      = np.vstack([X_normal, X_anomaly])

# Shuffle
idx   = np.random.permutation(len(X_all))
X_all = X_all[idx]

print(f'[train] Dataset: {len(X_all)} rows | '
      f'Normal: {N_NORMAL} | Anomalous: {N_ANOMALY} (10%)')

# ── Scale ──────────────────────────────────────────────────────────────────────
scaler   = StandardScaler()
X_scaled = scaler.fit_transform(X_all)

# ── Train Isolation Forest ────────────────────────────────────────────────────
print('[train] Training Isolation Forest ...')
model = IsolationForest(
    n_estimators=100,
    contamination=0.1,     # matches our 300/3000 anomaly ratio
    max_samples='auto',
    random_state=SEED,
    n_jobs=-1,
)
model.fit(X_scaled)

# ── Calibrate score mapping using training set percentiles ────────────────────
# score_min (5th pct)  = most anomalous end of the training distribution
# score_max (95th pct) = most normal end of the training distribution
# This makes raw_to_risk() data-driven, not hardcoded to magic numbers.
train_scores = model.decision_function(X_scaled)
score_min    = float(np.percentile(train_scores, 5))
score_max    = float(np.percentile(train_scores, 95))
threshold    = float(np.percentile(train_scores, 10))  # anomaly decision boundary

print(f'[train] Score range: [{score_min:.4f}, {score_max:.4f}]')
print(f'[train] Anomaly threshold: {threshold:.4f}')

# Quick self-evaluation on training set
preds     = model.predict(X_scaled)     # -1=anomaly, 1=normal
n_flagged = (preds == -1).sum()
print(f'[train] Self-check: {n_flagged} flagged as anomalies '
      f'({n_flagged/len(X_scaled)*100:.1f}%) — expected ~10%')

# ── Save Artifacts ────────────────────────────────────────────────────────────
os.makedirs('models', exist_ok=True)
joblib.dump(model,        'models/isolation_forest.joblib')
joblib.dump(scaler,       'models/scaler.joblib')
joblib.dump(FEATURE_COLS, 'models/feature_columns.joblib')
joblib.dump({
    'model':             'IsolationForest',
    'n_estimators':      100,
    'contamination':     0.1,
    'n_training_rows':   len(X_all),
    'n_features':        len(FEATURE_COLS),
    'anomaly_threshold': threshold,
    'score_min':         score_min,
    'score_max':         score_max,
    'feature_names':     FEATURE_COLS,
}, 'models/metadata.joblib')

print('[train] ✅ Artifacts saved to models/')
print('[train] Done — run: python app.py')