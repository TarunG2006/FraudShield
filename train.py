import pandas as pd
import numpy as np
import joblib
import os
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score

os.makedirs("models", exist_ok=True)

print("Loading dataset...")
df = pd.read_csv("data/transactions.csv")

HIGH_RISK_CATS = {"unknown","crypto","wire_transfer","gambling","pawn_shop"}
df["is_high_risk_category"] = df["merchant_category"].apply(lambda x: 1 if x in HIGH_RISK_CATS else 0)
df["hour_sin"] = np.sin(2 * np.pi * df["hour_of_day"] / 24)
df["hour_cos"] = np.cos(2 * np.pi * df["hour_of_day"] / 24)
df["dow_sin"]  = np.sin(2 * np.pi * df["day_of_week"] / 7)
df["dow_cos"]  = np.cos(2 * np.pi * df["day_of_week"] / 7)
df["log_amount"]         = np.log1p(df["amount"])
df["night_x_foreign"]    = df["is_night"] * df["is_foreign_country"]
df["velocity_x_foreign"] = df["transaction_count_1h"] * df["is_foreign_country"]
df["amount_x_night"]     = df["log_amount"] * df["is_night"]
df["high_vel_high_amt"]  = (df["transaction_count_1h"] > 5).astype(int) * (df["amount"] > 500).astype(int)

FEATURES = [
    "log_amount","amount_vs_avg_ratio","hour_sin","hour_cos","dow_sin","dow_cos",
    "is_weekend","is_night","is_foreign_country","transaction_count_1h",
    "transaction_count_24h","is_new_merchant","is_high_risk_category",
    "night_x_foreign","velocity_x_foreign","amount_x_night","high_vel_high_amt"
]

X = df[FEATURES].values
y = df["label"].values

print("Fitting scaler on normal transactions only...")
X_normal = df[df.label == 0][FEATURES].values
scaler = StandardScaler()
scaler.fit(X_normal)
X_scaled = scaler.transform(X)

print("Training Isolation Forest (200 trees)...")
model = IsolationForest(n_estimators=200, contamination=0.06, max_features=0.8, random_state=42, n_jobs=-1)
model.fit(scaler.transform(X_normal))

raw_scores  = model.decision_function(X_scaled)
predictions = model.predict(X_scaled)
pred_labels = (predictions == -1).astype(int)

min_s = raw_scores.min()
max_s = raw_scores.max()
risk_scores = np.array([round((1 - (s - min_s)/(max_s - min_s)) * 100, 1) for s in raw_scores])

print("\nClassification Report:")
print(classification_report(y, pred_labels, target_names=["Normal","Fraud"]))
cm = confusion_matrix(y, pred_labels)
tn, fp, fn, tp = cm.ravel()
print(f"True Negatives : {tn}")
print(f"False Positives: {fp}")
print(f"False Negatives: {fn}")
print(f"True Positives : {tp}")
print(f"ROC-AUC        : {roc_auc_score(y, risk_scores/100):.4f}")
print(f"\nNormal avg risk : {risk_scores[y==0].mean():.1f}")
print(f"Fraud  avg risk : {risk_scores[y==1].mean():.1f}")

joblib.dump(model,   "models/isolation_forest.joblib")
joblib.dump(scaler,  "models/scaler.joblib")
joblib.dump(FEATURES,"models/feature_columns.joblib")
joblib.dump({"min_score": float(min_s), "max_score": float(max_s)}, "models/metadata.joblib")

print("\nSaved: isolation_forest.joblib, scaler.joblib, feature_columns.joblib, metadata.joblib")
print("Training complete. Run: python app.py")