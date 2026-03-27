# Local Development

The app running locally with a local email server for OTP.

## Connection
- url: http://localhost:3000
- email: test-${RUN_ID}@test.local

## Auth
OTP is delivered to a local email server. Retrieve automatically:
- Email API: http://127.0.0.1:8025
- Search: GET /api/v1/search?query=to:{email}
- Read: GET /api/v1/message/{ID}
- Extract OTP: regex /(\d{6})/ from message Text body
- Poll interval: 500ms, timeout: 15s

## Behavior
- headed: true
- slow_mo: 100ms
- action_timeout: 30s
- page_load_timeout: 15s

## Notes
- Use a unique email per run (RUN_ID suffix) to avoid rate-limit carryover
- Workspace creation rate limit: 5/hour per user
