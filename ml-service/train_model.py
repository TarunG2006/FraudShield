"""
train_model.py — Train IsolationForest on data/transactions.csv
Usage: python train_model.py
"""

import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score

RANDOM_SEED = 42
MODEL_DIR   = os.path.join(os.path.dirname(__file__), 'models')
DATA_PATH   = os.path.join(os.path.dirname(__file__), 'data', 'transactions.csv')

FEATURE_COLS = [
    'amount', 'hour_of_day', 'day_of_week', 'is_weekend',
    'is_night', 'is_foreign_country', 'transaction_count_1h',
    'transaction_count_24h', 'amount_vs_avg_ratio',
    'is_new_merchant', 'is_high_risk_category'
]


def train():
    os.makedirs(MODEL_DIR, exist_ok=True)

    print('[train] Loading data/transactions.csv ...')
    df = pd.read_csv(DATA_PATH)
    print(f'[train] {len(df)} rows | Normal: {(df.label==0).sum()} | Fraud: {(df.label==1).sum()}')

    X = df[FEATURE_COLS].values.astype(float)
    y = df['label'].values

    contamination = round(float(y.sum() / len(y)), 4)
    print(f'[train] Contamination: {contamination}')

    print('[train] Fitting StandardScaler ...')
    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    print('[train] Training IsolationForest (300 estimators) ...')
    model = IsolationForest(
        n_estimators=300,
        contamination=contamination,
        max_samples='auto',
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    # ROC-AUC: lower decision_function = more anomalous = fraud → invert
    scores  = model.decision_function(X_scaled)
    roc_auc = roc_auc_score(y, -scores)
    print(f'[train] ROC-AUC: {roc_auc:.4f}')

    metadata = {
        'roc_auc':       roc_auc,
        'contamination': contamination,
        'n_estimators':  300,
        'n_samples':     len(df),
        'feature_cols':  FEATURE_COLS,
    }

    joblib.dump(scaler,       os.path.join(MODEL_DIR, 'scaler.joblib'))
    joblib.dump(model,        os.path.join(MODEL_DIR, 'isolation_forest.joblib'))
    joblib.dump(FEATURE_COLS, os.path.join(MODEL_DIR, 'feature_columns.joblib'))
    joblib.dump(metadata,     os.path.join(MODEL_DIR, 'metadata.joblib'))
    print(f'[train] 4 artifacts saved to {MODEL_DIR}')

    # Smoke test
    norm_scores  = model.decision_function(X_scaled[y == 0][:5])
    fraud_scores = model.decision_function(X_scaled[y == 1][:5])
    print(f'[train] Normal scores (higher=safer) : {norm_scores.round(4)}')
    print(f'[train] Fraud  scores (lower=riskier): {fraud_scores.round(4)}')

    if roc_auc >= 0.80:
        print(f'[train] TARGET MET — ROC-AUC {roc_auc:.4f} >= 0.80')
    else:
        print(f'[train] WARNING  — ROC-AUC {roc_auc:.4f} < 0.80')

    print('[train] Done.')


if __name__ == '__main__':
    train()