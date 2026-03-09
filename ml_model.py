"""
ML model script to fetch transactions from Supabase, build features, and predict next 7-day spending.

Usage:
- Install dependencies: pip install supabase pandas scikit-learn sqlalchemy
- Configure environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or anon key for read),
  optionally MODEL_OUTPUT_PATH

This script exposes:
- build_features_for_student(student_id)
- train_model_and_save(model_path)
- predict_next_7_days_for_student(student_id)

Note: This is a simple example using RandomForestRegressor and daily aggregation.
"""

import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from supabase import create_client
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import joblib

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
MODEL_PATH = os.environ.get("MODEL_OUTPUT_PATH", "ml_model.pkl")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variables")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_transactions(student_id, days=180):
    """Fetch transactions for the student for the last `days` days."""
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    resp = supabase.table("transactions").select("amount, type, category, created_at").eq("user_id", student_id).gte("created_at", since).order("created_at", desc=False).execute()
    if resp.error:
        raise RuntimeError(resp.error.message)
    data = resp.data or []
    df = pd.DataFrame(data)
    if df.empty:
        return df
    df["created_at"] = pd.to_datetime(df["created_at"])
    # consider only debit amounts as spending
    df["signed_amount"] = df.apply(lambda r: -float(r["amount"]) if str(r.get("type")).lower() in ("debit","expense") else float(r["amount"]), axis=1)
    return df


def build_daily_aggregate(df):
    if df.empty:
        return pd.DataFrame(columns=["date","spent"])
    df_spend = df[df["signed_amount"] < 0].copy()
    df_spend["spent"] = df_spend["signed_amount"].abs()
    daily = df_spend.groupby(df_spend["created_at"].dt.date)["spent"].sum().reset_index()
    daily.columns = ["date","spent"]
    daily["date"] = pd.to_datetime(daily["date"])
    return daily


def build_features_for_student(student_id, lookback_days=90):
    """Returns a feature vector summarizing spending behavior for student_id."""
    df = fetch_transactions(student_id, days=lookback_days)
    daily = build_daily_aggregate(df)

    today = datetime.utcnow().date()
    # compute daily/weekly/monthly totals over last 1 day, 7 days, 30 days
    def sum_last(n):
        start = today - timedelta(days=n-1)
        mask = (daily["date"] >= pd.to_datetime(start)) & (daily["date"] <= pd.to_datetime(today))
        return float(daily.loc[mask, "spent"].sum()) if not daily.empty else 0.0

    daily_spent = sum_last(1)
    weekly_spent = sum_last(7)
    monthly_spent = sum_last(30)
    tx_count = len(df)

    # basic trend: slope of last 14 days
    if len(daily) >= 2:
        recent = daily[daily["date"] >= pd.to_datetime(today - timedelta(days=13))]
        if len(recent) >= 2:
            x = np.arange(len(recent))
            y = recent["spent"].values
            coef = np.polyfit(x, y, 1)[0]
        else:
            coef = 0.0
    else:
        coef = 0.0

    features = {
        "student_id": student_id,
        "daily_spent": daily_spent,
        "weekly_spent": weekly_spent,
        "monthly_spent": monthly_spent,
        "transaction_count": tx_count,
        "trend": float(coef)
    }
    return features


def prepare_training_data(days=365):
    """Fetch transactions for all students and construct training dataset.
    This function will aggregate each student's sliding windows into training rows.
    For simplicity, we compute features per student using the last 30/60/90 day windows and target = next 7 day spend.
    """
    # Fetch all students with profiles
    resp = supabase.table("profiles").select("id").execute()
    if resp.error:
        raise RuntimeError(resp.error.message)
    students = [r["id"] for r in resp.data or []]

    rows = []
    for sid in students:
        df = fetch_transactions(sid, days=days)
        if df.empty:
            continue
        daily = build_daily_aggregate(df)
        if daily.empty:
            continue
        # sliding windows: for each day where we have at least 30 days of history, build features and target next 7 days sum
        daily = daily.set_index("date").sort_index()
        for i in range(30, len(daily)-7):
            window = daily.iloc[i-30:i]
            target_window = daily.iloc[i:i+7]
            features = {
                "daily_spent": float(window.tail(1)["spent"].sum()),
                "weekly_spent": float(window.tail(7)["spent"].sum()),
                "monthly_spent": float(window.sum()),
                "transaction_count": int(df.shape[0])
            }
            target = float(target_window["spent"].sum())
            rows.append((features, target))

    if not rows:
        return None, None
    X = pd.DataFrame([r[0] for r in rows])
    y = pd.Series([r[1] for r in rows])
    return X, y


def train_model_and_save(model_path=MODEL_PATH):
    X, y = prepare_training_data()
    if X is None:
        print("Not enough data to train model")
        return None
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    score = model.score(X_test, y_test)
    joblib.dump(model, model_path)
    print(f"Model trained and saved to {model_path}. Test R^2: {score:.3f}")
    return model


def load_model(model_path=MODEL_PATH):
    if not os.path.exists(model_path):
        return None
    return joblib.load(model_path)


def predict_next_7_days_for_student(student_id, model=None):
    if model is None:
        model = load_model()
    features = build_features_for_student(student_id)
    if model is None:
        # fallback heuristic: use weekly_spent as estimate
        return float(features.get("weekly_spent", 0.0))
    X = pd.DataFrame([{
        "daily_spent": features["daily_spent"],
        "weekly_spent": features["weekly_spent"],
        "monthly_spent": features["monthly_spent"],
        "transaction_count": features["transaction_count"]
    }])
    pred = model.predict(X)[0]
    return float(max(0.0, pred))


if __name__ == "__main__":
    # simple CLI: python ml_model.py train OR python ml_model.py predict <student_id>
    if len(sys.argv) < 2:
        print("Usage: ml_model.py train | predict <student_id>")
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "train":
        train_model_and_save()
    elif cmd == "predict":
        if len(sys.argv) < 3:
            print("Please provide student_id")
            sys.exit(1)
        sid = sys.argv[2]
        model = load_model()
        pred = predict_next_7_days_for_student(sid, model)
        print(pred)
    else:
        print("Unknown command")
*** End Patch