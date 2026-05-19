import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta

np.random.seed(42)
os.makedirs("data", exist_ok=True)

N_NORMAL = 4700
N_FRAUD  = 300

MERCHANT_CATS = ["grocery","restaurant","gas_station","retail","pharmacy","online_shopping","entertainment","travel","electronics","utilities"]
FRAUD_MERCHANT_CATS = ["unknown","crypto","wire_transfer","gambling","pawn_shop"]

def make_normal(n):
    records = []
    base_time = datetime(2026, 1, 1)
    for i in range(n):
        txn_time = base_time + timedelta(
            days=np.random.randint(0, 120),
            hours=np.random.choice(range(24), p=[0.01,0.01,0.01,0.01,0.01,0.02,0.04,0.06,0.07,0.07,0.07,0.07,0.07,0.07,0.07,0.06,0.06,0.06,0.05,0.05,0.04,0.03,0.02,0.01]),
            minutes=np.random.randint(0, 60)
        )
        amount = np.random.choice([
            np.random.uniform(5, 150),
            np.random.uniform(150, 500),
            np.random.uniform(500, 1500),
        ], p=[0.60, 0.30, 0.10])
        records.append({
            "amount": round(amount, 2),
            "hour_of_day": txn_time.hour,
            "day_of_week": txn_time.weekday(),
            "is_weekend": int(txn_time.weekday() >= 5),
            "is_night": int(txn_time.hour < 5 or txn_time.hour >= 23),
            "merchant_category": np.random.choice(MERCHANT_CATS),
            "is_foreign_country": int(np.random.random() < 0.05),
            "transaction_count_1h": np.random.choice([1,2,3,4], p=[0.50,0.30,0.15,0.05]),
            "transaction_count_24h": np.random.randint(1, 10),
            "amount_vs_avg_ratio": round(np.random.uniform(0.5, 2.0), 2),
            "is_new_merchant": int(np.random.random() < 0.15),
            "is_high_risk_category": 0,
            "label": 0
        })
    return records

def make_fraud(n):
    records = []
    base_time = datetime(2026, 1, 1)
    patterns = {
        "card_testing": int(n*0.20),
        "account_takeover": int(n*0.20),
        "identity_theft": int(n*0.15),
        "velocity_attack": int(n*0.15),
        "geo_anomaly": int(n*0.10),
        "large_single": int(n*0.10),
        "after_hours": int(n*0.10),
    }
    for pattern, count in patterns.items():
        for _ in range(count):
            txn_time = base_time + timedelta(days=np.random.randint(0,120), hours=np.random.randint(0,24), minutes=np.random.randint(0,60))
            if pattern == "card_testing":
                amount=round(np.random.uniform(0.50,5.00),2); hour=np.random.randint(0,24); vel=np.random.randint(15,40); foreign=int(np.random.random()<0.3); cat=np.random.choice(FRAUD_MERCHANT_CATS); ratio=round(np.random.uniform(0.01,0.1),2); night=int(hour<5); hrisk=1
            elif pattern == "account_takeover":
                amount=round(np.random.uniform(2000,8000),2); hour=np.random.choice([1,2,3,4,22,23]); vel=np.random.randint(1,4); foreign=1; cat=np.random.choice(["electronics","wire_transfer","crypto"]); ratio=round(np.random.uniform(8,25),2); night=1; hrisk=1
            elif pattern == "identity_theft":
                amount=round(np.random.uniform(500,3000),2); hour=np.random.choice([0,1,2,3,4,23]); vel=np.random.randint(2,8); foreign=int(np.random.random()<0.5); cat=np.random.choice(FRAUD_MERCHANT_CATS); ratio=round(np.random.uniform(4,12),2); night=1; hrisk=1
            elif pattern == "velocity_attack":
                amount=round(np.random.uniform(50,500),2); hour=np.random.randint(0,24); vel=np.random.randint(20,60); foreign=int(np.random.random()<0.4); cat=np.random.choice(MERCHANT_CATS+FRAUD_MERCHANT_CATS); ratio=round(np.random.uniform(1,5),2); night=int(hour<5); hrisk=0
            elif pattern == "geo_anomaly":
                amount=round(np.random.uniform(300,2000),2); hour=np.random.choice([1,2,3,4]); vel=np.random.randint(1,3); foreign=1; cat=np.random.choice(["travel","electronics","unknown"]); ratio=round(np.random.uniform(2,8),2); night=1; hrisk=0
            elif pattern == "large_single":
                amount=round(np.random.uniform(5000,15000),2); hour=np.random.randint(0,24); vel=1; foreign=int(np.random.random()<0.6); cat=np.random.choice(["electronics","wire_transfer","crypto","gambling"]); ratio=round(np.random.uniform(15,50),2); night=int(hour<5); hrisk=1
            else:
                amount=round(np.random.uniform(800,4000),2); hour=np.random.choice([2,3,4]); vel=np.random.randint(1,5); foreign=int(np.random.random()<0.3); cat=np.random.choice(["gambling","crypto","online_shopping","unknown"]); ratio=round(np.random.uniform(3,10),2); night=1; hrisk=1
            records.append({
                "amount": amount, "hour_of_day": hour, "day_of_week": txn_time.weekday(),
                "is_weekend": int(txn_time.weekday()>=5), "is_night": night,
                "merchant_category": cat, "is_foreign_country": foreign,
                "transaction_count_1h": vel, "transaction_count_24h": vel+np.random.randint(0,10),
                "amount_vs_avg_ratio": ratio, "is_new_merchant": int(np.random.random()<0.7),
                "is_high_risk_category": hrisk, "label": 1
            })
    return records

df = pd.DataFrame(make_normal(N_NORMAL) + make_fraud(N_FRAUD))
df = df.sample(frac=1, random_state=42).reset_index(drop=True)
df.to_csv("data/transactions.csv", index=False)
print(f"Done. {len(df)} rows | Normal: {(df.label==0).sum()} | Fraud: {(df.label==1).sum()}")