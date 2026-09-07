# PRD — RekapPiutang.id (Aplikasi Rekap Piutang Otomatis)

## Problem Statement Asli
"aplikasi rekap piutang otomatis — Tahap 1A: Project Foundation + Database + Login + Security"

## Pilihan Pengguna
- Autentikasi: **username + password** (JWT custom auth)
- Role: default **Admin + Staff** (RBAC)
- Bahasa UI: **Bahasa Indonesia**
- Admin pemilik: username `admin`, email `andi2017010033@gmail.com`, password `admin123`
- Staff demo: username `staff`, password `staff123`

## Arsitektur
- **Backend**: FastAPI (`/app/backend/server.py`), semua route ber-prefix `/api`, MongoDB via motor (MONGO_URL/DB_NAME dari env)
- **Frontend**: React 19 + Tailwind + shadcn/ui, React Router 7, TanStack Query, next-themes (dark default), framer-motion, sonner
- **Auth**: JWT HS256 — access token 15 mnt (httpOnly cookie + Bearer di localStorage `rp_access_token`), refresh token 7 hari, bcrypt hashing
- **Koleksi MongoDB**: `users` (unique username, partial unique email), `login_attempts` (brute-force counter), `activity_logs` (audit trail)
- **Desain**: Swiss & Precision Finance Hybrid — Deep Slate #0F172A + Emerald #10B981, Plus Jakarta Sans + JetBrains Mono (`/app/design_guidelines.json`)

## Persona
- **Admin (pemilik usaha)**: kelola pengguna, lihat audit log, akses penuh
- **Staff**: input/lihat data piutang (Tahap 2+), tidak bisa kelola pengguna

## Yang Sudah Diimplementasikan
### Tahap 1A (7 Sep 2026) — SELESAI & TERUJI
- Login page split-screen (hero gelap + form) dengan toggle password, error inline, loading state
- JWT login/logout/me/refresh/session; cookie httpOnly + Bearer fallback
- Brute-force protection: 5x gagal → kunci 15 menit (X-Forwarded-For aware, atomic $inc)
- RBAC: endpoint `/api/users` & `/api/security/activity` admin-only (403 untuk staff)
- Seed idempoten admin (env-driven) + staff demo
- Dashboard shell: sidebar nav (Ringkasan, Daftar Piutang [disabled Tahap 2], Pengguna & Peran [admin], Keamanan & Sesi, Pengaturan), topbar dengan session timer countdown + badge JWT Aktif + theme toggle
- Kartu Status Keamanan Sesi (algoritma, IP via XFF, expiry, level keamanan)
- Manajemen pengguna: tabel, tambah pengguna (dialog), ubah peran, aktif/nonaktifkan, guard anti self-demotion
- Halaman Keamanan: log audit (login sukses/gagal/diblokir, user dibuat/diubah) + konfigurasi keamanan
- Halaman Pengaturan: info fondasi sistem
- Semua elemen interaktif punya data-testid sesuai design guidelines
- Bug teruji & diperbaiki: duplicate-key email null (partial index), lockout terfragmentasi IP ingress, a11y DialogDescription
- Test report: /app/test_reports/iteration_1.json; backend tests: /app/backend/tests/backend_test.py

### Menu Buat Akun / Pendaftaran Mandiri (7 Sep 2026) — SELESAI & TERUJI
- Endpoint `POST /api/auth/register`: username unik (409 jika duplikat), email opsional unik, peran otomatis **staff**, auto-login (JWT + cookie), tercatat di audit log (`user_registered`)
- Halaman `/register` (link "Buat akun" dari halaman login): nama, username, email opsional, kata sandi + konfirmasi, toggle visibilitas, error inline; sukses → redirect dashboard
- Terverifikasi via curl (register 201, duplikat 409, login akun baru 200) dan Playwright (flow UI lengkap, badge STAFF muncul)

### Tahap 1B — Modul Pelanggan (7 Sep 2026) — SELESAI & TERUJI (backend 100%, frontend 100%, 19/19 pytest)
- **Multi-tenant**: koleksi `companies` (tenant A "PT RekapPiutang Utama" default, tenant B "PT Demo Tenant B"); semua user punya `company_id` (backfill legacy); SEMUA query customers di-scope `company_id` dari user login (backend, bukan frontend); ID tenant lain → **404** (bukan 403)
- **Role**: owner/admin/staff (full CRUD pelanggan), **viewer** (view-only, write → 403 backend); require_admin kini owner+admin; /users & /security/activity tenant-scoped
- **Entity customers**: id, company_id, customer_code (auto CUS-XXXXXX via koleksi `counters` atomik per-tenant), name, phone (regex validasi), email (EmailStr), address, notes, status (active/inactive), created_at, updated_at, created_by. Index: company_id, (company_id+customer_code) unique, (company_id+name), (company_id+phone)
- **API**: GET /api/customers (search server-side re.escape di name/code/phone/email, status filter, sort name_asc/name_desc/newest/oldest, pagination), GET /{id}, GET /{id}/summary (agregasi invoices/payments tenant-scoped — siap untuk Tahap 2, saat ini Rp 0), POST, PATCH (customer_code immutable), POST /{id}/deactivate (soft, idempoten)
- **Audit log**: customer_created/customer_updated/customer_deactivated dengan company_id, user_id, entity_type, entity_id, old_data, new_data (tanpa password/secret)
- **UI /pelanggan**: tabel desktop + card mobile, skeleton loading, empty/error state + retry, dialog tambah/edit (noValidate, error inline B. Indonesia), AlertDialog konfirmasi nonaktifkan, detail dialog + ringkasan transaksi, search debounce 400ms
- Seed demo: viewer/viewer123 (tenant A), ownerb/owner123→ownerb123 (tenant B + 2 pelanggan demo B)
- Test report: /app/test_reports/iteration_2.json; tests: /app/backend/tests/test_customers.py
- Sisa issue (non-blocking): regex search belum pakai text index (skala MVP aman); rekomendasi split server.py ke routers sebelum Tahap 2

## Backlog Prioritas
- **P0 (Tahap 2)**: CRUD data piutang/invoice pelanggan, rekap otomatis, umur piutang (aging), status lunas/belum
- **P1**: Pengingat jatuh tempo, export Excel/PDF rekap, dashboard grafik arus kas, filter/pencarian piutang
- **P2**: Pecah server.py ke routers (auth/users/security/db), forgot/reset password via email, refresh-on-401 axios interceptor, log perangkat/UA lengkap, multi-cabang

## Next Tasks
1. Konfirmasi scope Tahap 2 dengan pengguna (field piutang: pelanggan, faktur, nominal, jatuh tempo, dsb.)
2. Implementasi modul Daftar Piutang + rekap otomatis
