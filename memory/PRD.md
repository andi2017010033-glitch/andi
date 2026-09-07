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

### Tahap 2 — Modul Piutang/Invoice + Rekap Otomatis + Pembayaran (7 Sep 2026) — SELESAI & TERUJI (backend 100%, frontend 100%, 19/19 pytest)
- **Entity invoices**: id, company_id, invoice_code (auto INV-XXXXXX per-tenant via counters), customer_id + snapshot customer_name/customer_code, invoice_date, due_date, total, paid_amount, status (unpaid/partial/paid tersimpan; overdue dihitung saat read), notes, timestamps. **Entity payments**: company_id, invoice_id, customer_id, amount, payment_date, method, notes. Index: (company_id+invoice_code) unique, (company_id+customer_id), (company_id+due_date), payments (company_id+invoice_id/customer_id)
- **API**: GET /api/invoices (search kode/pelanggan, filter status incl. overdue via $expr+due_date, 6 opsi sort, pagination), GET /{id} (+riwayat pembayaran), POST (validasi customer aktif & tenant, due>=invoice_date, total>0), PATCH (total tidak boleh < paid_amount, tanggal konsisten, auto recompute status), POST /{id}/payments (tolak overpayment & sudah lunas → 400, auto transition unpaid→partial→paid), GET /api/receivables/summary (outstanding, overdue+count, collected, aging 5 bucket, top 5 debtors)
- **Integrasi**: ringkasan transaksi di Detail Pelanggan (Tahap 1B) kini menampilkan angka real; dashboard menampilkan Total Piutang Berjalan live + link ke /piutang
- **UI /piutang**: kartu ringkasan (Total Piutang, Terlambat, Terbayar), panel aging, tabel desktop + card mobile, dialog tambah/edit (pelanggan readonly saat edit), dialog pembayaran (default = sisa), detail + riwayat pembayaran, search debounce, skeleton/empty/error state
- **Security**: semua endpoint tenant-scoped (lintas tenant 404), viewer read-only (403 write), audit log invoice_created/invoice_updated/payment_recorded dengan old/new data
- Seed demo: 4 invoice tenant A (overdue/partial/unpaid/paid + 2 pembayaran) + 1 invoice tenant B
- Test report: /app/test_reports/iteration_3.json; tests: /app/backend/tests/test_invoices.py
- Sisa issue (non-blocking): rekomendasi split server.py ke routers & ekstrak dialog InvoicesPage ke components sebelum Tahap 3; status overdue dihitung per-read (aman <1k invoice/tenant)

### Tahap 1C — Modul Invoice + Invoice Items (7 Sep 2026) — SELESAI & TERUJI (backend 15/15 pytest, frontend 100%)
- **Koleksi**: `invoices` diperluas (invoice_code format baru INV-YYYYMM-XXXXXX per tenant+periode via counters, subtotal, discount, tax, total, paid_amount, outstanding_amount, status: draft/unpaid/partial/paid/cancelled + overdue computed) + koleksi baru `invoice_items` (company_id, invoice_id wajib, product_code/name, quantity, unit, price, discount, subtotal). Invoice lama Tahap 2 di-backfill (subtotal=total, outstanding=total-paid)
- **Perhitungan otoritatif backend**: Decimal (ROUND_HALF_UP 2dp) — subtotal item = qty×price−diskon; total = subtotal − diskon + pajak; frontend hanya preview. Validasi: qty>0, harga/diskon/pajak ≥0, diskon ≤ subtotal, total ≥ paid_amount, due_date ≥ invoice_date
- **API**: POST /api/invoices (items ≥1, save_as draft|invoice, paid=0, outstanding=total), PATCH (draft full edit + terbitkan via save_as=invoice; paid_amount>0 → item/diskon/pajak terkunci; lunas → hanya catatan), POST /{id}/cancel (owner/admin only, tolak jika ada pembayaran, soft), GET /api/invoices (search, 7 status, period today/week/month/custom range, sort, page size 10/25/50/100, receivable=true utk rekap), GET /{id} (+items +payments). Payment diblokir untuk draft/cancelled. Summary rekap mengecualikan draft & cancelled
- **Transaction safety**: deteksi replica set (TXN_SUPPORTED via hello) → transaksi MongoDB; standalone → fallback kompensasi (hapus invoice jika items gagal; restore items lama saat update gagal)
- **UI /invoice**: tabel 10 kolom + card mobile, customer picker searchable (kode+nama+telepon, hanya pelanggan aktif tenant), editor item (tabel horizontal-scroll, subtotal live), ringkasan preview, Simpan Draft vs Simpan Invoice, dialog cancel konfirmasi, detail dengan items + ringkasan Rp + riwayat pembayaran
- **Rekap /piutang**: tetap berfungsi, mengecualikan draft/cancelled, tombol mengarah ke /invoice
- **Security**: tenant isolation 404 (GET/cancel lintas tenant), viewer 403, staff tanpa cancel (403), audit invoice_created/invoice_updated/invoice_cancelled dengan old/new data
- Test report: /app/test_reports/iteration_4.json; tests: /app/backend/tests/test_invoice_items.py
- Sisa issue (non-blocking): server.py ~1481 baris & InvoiceManagePage.jsx ~777 baris — disarankan split ke routers/ & components/ sebelum tahap berikutnya; test_invoices.py lama perlu didepresiasi (skema lama)

## Backlog Prioritas
- **P0 (Tahap 3)**: Modul Pembayaran penuh / laporan & export rekap piutang / pengingat jatuh tempo — sesuai instruksi pengguna
- **P1**: Pengingat jatuh tempo, export Excel/PDF rekap, dashboard grafik arus kas, filter/pencarian piutang
- **P2**: Pecah server.py ke routers (auth/users/security/db), forgot/reset password via email, refresh-on-401 axios interceptor, log perangkat/UA lengkap, multi-cabang

## Next Tasks
1. Konfirmasi scope Tahap 2 dengan pengguna (field piutang: pelanggan, faktur, nominal, jatuh tempo, dsb.)
2. Implementasi modul Daftar Piutang + rekap otomatis
