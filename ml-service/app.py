from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

print('[app] Loading model artifacts ...')
model        = joblib.load(os.path.join(MODEL_DIR, 'isolation_forest.joblib'))
scaler       = joblib.load(os.path.join(MODEL_DIR, 'scaler.joblib'))
FEATURE_COLS = joblib.load(os.path.join(MODEL_DIR, 'feature_columns.joblib'))
metadata     = joblib.load(os.path.join(MODEL_DIR, 'metadata.joblib'))
print(f'[app] Ready | Model: IsolationForest | '
      f'Trained on: {metadata["n_training_rows"]} rows | '
      f'Features: {len(FEATURE_COLS)} | '
      f'Threshold: {metadata["anomaly_threshold"]:.4f}')

HIGH_RISK_CATS = {'unknown', 'crypto', 'wire_transfer', 'gambling', 'pawn_shop'}


def build_features(data: dict) -> list:
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

    return [amount, hour, dow, is_weekend, is_night, is_foreign,
            vel_1h, vel_24h, amt_ratio, is_new_merch, is_high_risk]


def raw_to_risk(raw_score: float) -> float:
    """
    Map IsolationForest decision_function → 0–100 risk score.
    Calibrated using 5th/95th percentiles of training score distribution
    so mapping is data-driven, not hardcoded.
    Lower decision_function = more anomalous = higher risk score.
    """
    score_min  = metadata['score_min']   # 5th percentile (most anomalous)
    score_max  = metadata['score_max']   # 95th percentile (most normal)
    normalized = (raw_score - score_max) / (score_min - score_max)
    return round(float(np.clip(normalized, 0, 1) * 100), 1)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status':             'ok',
        'model':              'IsolationForest',
        'contamination':      metadata['contamination'],
        'anomaly_threshold':  round(metadata['anomaly_threshold'], 4),
        'score_range':        [round(metadata['score_min'], 4), round(metadata['score_max'], 4)],
        'n_features':         len(FEATURE_COLS),
        'feature_names':      FEATURE_COLS,
        'n_training_rows':    metadata['n_training_rows'],
    })


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON body provided'}), 400

        X        = np.array(build_features(data), dtype=float).reshape(1, -1)
        X_scaled = scaler.transform(X)

        raw_score  = float(model.decision_function(X_scaled)[0])
        prediction = int(model.predict(X_scaled)[0])   # -1=anomaly, 1=normal
        risk_score = raw_to_risk(raw_score)
        is_anomaly = prediction == -1

        reasons = []
        amount  = float(data.get('amount', 0))
        hour    = int(data.get('hour_of_day', data.get('hour', 12)))
        vel_1h  = int(data.get('transaction_count_1h', 1))
        ratio   = float(data.get('amount_vs_avg_ratio', 1.0))
        cat     = str(data.get('merchant_category', '')).lower()

        if amount > 8000:
            reasons.append('Very high transaction amount')
        elif amount > 3000:
            reasons.append('High transaction amount')
        if hour < 5 or hour >= 23:
            reasons.append('Unusual transaction time (night hours)')
        if data.get('is_foreign_country'):
            reasons.append('Foreign country transaction')
        if vel_1h > 5:
            reasons.append(f'High velocity: {vel_1h} transactions in 1 hour')
        if cat in HIGH_RISK_CATS:
            reasons.append(f'High-risk merchant category: {cat}')
        if data.get('is_new_merchant'):
            reasons.append('New or unknown merchant')
        if ratio > 5:
            reasons.append(f'Amount {ratio:.1f}x above user average')

        return jsonify({
            'ml_score':   risk_score,
            'risk_score': risk_score,
            'is_anomaly': is_anomaly,
            'prediction': 'fraud' if is_anomaly else 'normal',
            'confidence': round(abs(raw_score), 4),
            'reasons':    reasons,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    try:
        body         = request.get_json()
        transactions = body.get('transactions', [])
        if not transactions:
            return jsonify({'error': 'No transactions provided'}), 400

        results = []
        for txn in transactions:
            X        = np.array(build_features(txn), dtype=float).reshape(1, -1)
            X_scaled = scaler.transform(X)
            raw      = float(model.decision_function(X_scaled)[0])
            pred     = int(model.predict(X_scaled)[0])
            results.append({
                'id':         txn.get('id'),
                'ml_score':   raw_to_risk(raw),
                'risk_score': raw_to_risk(raw),
                'is_anomaly': pred == -1,
            })

        return jsonify({'results': results, 'count': len(results)})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f'[app] Starting on http://0.0.0.0:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)