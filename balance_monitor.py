"""
Balance monitoring utility.
Provides check_low_balance(student_id) which:
 - loads features via ml_model.build_features_for_student
 - gets wallet balance and profile.min_balance
 - predicts next 7 days spending using ml_model.predict_next_7_days_for_student
 - inserts a row into ml_spending_features
 - sends SMS to student and parent if low-balance condition met

Run as CLI: python balance_monitor.py <student_id>

Environment variables required for Supabase and Twilio similar to ml_model.py and sms_service.py
"""

import os
import sys
from ml_model import build_features_for_student, predict_next_7_days_for_student, load_model
from sms_service import send_sms
from supabase import create_client
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variables")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def insert_ml_feature(student_id, features, predicted, risk):
    payload = {
        "student_id": student_id,
        "daily_spent": features.get("daily_spent"),
        "weekly_spent": features.get("weekly_spent"),
        "monthly_spent": features.get("monthly_spent"),
        "transaction_count": features.get("transaction_count"),
        "predicted_next_7_days": predicted,
        "low_balance_risk": risk,
        "created_at": datetime.utcnow().isoformat()
    }
    resp = supabase.table("ml_spending_features").insert(payload).execute()
    if resp.error:
        print("Failed to insert ml features:", resp.error.message)
    else:
        print("Inserted ml features for", student_id)


def check_low_balance(student_id):
    # fetch profile
    pf = supabase.table("profiles").select("id, phone_number, min_balance, parent_id").eq("id", student_id).single().execute()
    if pf.error:
        raise RuntimeError(pf.error.message)
    profile = pf.data
    if not profile:
        raise RuntimeError("Profile not found")

    # fetch wallet
    w = supabase.table("wallets").select("balance").eq("user_id", student_id).single().execute()
    if w.error:
        raise RuntimeError(w.error.message)
    wallet = w.data or {"balance": 0}
    balance = float(wallet.get("balance") or 0.0)

    # build features
    features = build_features_for_student(student_id)

    # predict
    model = load_model()
    predicted = predict_next_7_days_for_student(student_id, model)

    # risk: if balance below min_balance OR balance < predicted next 7 days
    min_balance = float(profile.get("min_balance") or 0)
    risk = (balance < min_balance) or (balance < predicted)

    # insert features record
    insert_ml_feature(student_id, features, predicted, risk)

    # send SMS if risk
    if risk:
        student_phone = profile.get("phone_number")
        # fetch parent phone
        parent_phone = None
        if profile.get("parent_id"):
            p = supabase.table("profiles").select("phone_number").eq("id", profile.get("parent_id")).single().execute()
            if not p.error and p.data:
                parent_phone = p.data.get("phone_number")

        msg = f"Alert: Your wallet balance is \u20B9{balance:.0f}. This is below minimum balance or predicted spending. Please add funds."
        if student_phone:
            send_sms(student_phone, msg)
        if parent_phone:
            send_sms(parent_phone, f"Child alert: {msg}")

    return {"balance": balance, "predicted_next_7_days": predicted, "risk": risk}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python balance_monitor.py <student_id>")
        sys.exit(1)
    sid = sys.argv[1]
    out = check_low_balance(sid)
    print(out)
