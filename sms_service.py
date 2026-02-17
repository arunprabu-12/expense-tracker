"""
Simple SMS service wrapper using Twilio.
Usage:
  export TWILIO_ACCOUNT_SID=...
  export TWILIO_AUTH_TOKEN=...
  export TWILIO_FROM_NUMBER=+1234567890

  from sms_service import send_sms
  send_sms('+91xxxxxxxxxx', 'Hello')
"""

import os
from twilio.rest import Client

TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_FROM_NUMBER = os.environ.get('TWILIO_FROM_NUMBER')

if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER):
    # warn at import time but do not crash
    print('Warning: Twilio environment variables not fully set. SMS functionality will be disabled until configured.')


def send_sms(to_number, message):
    """Send SMS using Twilio. `to_number` should be in E.164 format (e.g. +919999999999)."""
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER):
        print(f"SMS disabled (missing credentials). Would send to {to_number}: {message}")
        return False
    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        msg = client.messages.create(body=message, from_=TWILIO_FROM_NUMBER, to=to_number)
        print(f"Sent SMS to {to_number}, sid={msg.sid}")
        return True
    except Exception as e:
        print(f"Failed to send SMS to {to_number}: {e}")
        return False
