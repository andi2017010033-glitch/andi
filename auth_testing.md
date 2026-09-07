# Auth Testing Playbook — Rekap Piutang Otomatis (Tahap 1A)

## Credentials
See `/app/memory/test_credentials.md`.
- Admin: username `admin`, password `admin123`, role `admin`
- Staff demo: username `staff`, password `staff123`, role `staff`

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
db.users.findOne({role: "admin"}, {password_hash: 1})
```
Verify: bcrypt hash starts with `$2b$`, unique index on users.username, index on login_attempts.identifier, activity_logs.timestamp.

## Step 2: API Testing (use REACT_APP_BACKEND_URL from frontend/.env)
```
API=<REACT_APP_BACKEND_URL>
curl -c cookies.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
cat cookies.txt
curl -b cookies.txt $API/api/auth/me
curl -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"salah"}'  # expect 401
```
Login returns `{user, access_token, token_type, expires_in}` and sets `access_token` + `refresh_token` httpOnly cookies. `/auth/me` works via cookies or `Authorization: Bearer <access_token>`.

## Step 3: Security Checks
- 5x failed login → 429 lockout with remaining minutes message.
- `GET /api/users` as staff → 403; as admin → list.
- `GET /api/security/activity` as admin → audit log entries (login_success, login_failed, logout).
- `GET /api/auth/session` → JWT algorithm HS256, expiry, IP.
- `GET /api/auth/me` without token → 401.
