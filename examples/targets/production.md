# Production

The live app with real email delivery.

## Connection
- url: https://app.example.com
- email: demo@example.com

## Auth
OTP is delivered to a real email inbox. Prompt the user:
- strategy: prompt
- message: Enter the OTP code sent to {email}

## Behavior
- headed: true
- slow_mo: 100ms
- action_timeout: 60s
- page_load_timeout: 30s

## Notes
- Some operations are slower on production
- Third-party services may have their own rate limits
- Workspace creation rate limit: 5/hour — use sparingly
