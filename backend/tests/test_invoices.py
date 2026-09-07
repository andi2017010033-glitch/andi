"""Backend API tests for Tahap 2 - Piutang/Invoice (tenant-scoped)."""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
STAFF = {"username": "staff", "password": "staff123"}
VIEWER = {"username": "viewer", "password": "viewer123"}
OWNERB = {"username": "ownerb", "password": "ownerb123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def viewer_h():
    return {"Authorization": f"Bearer {_login(VIEWER)}"}


@pytest.fixture(scope="module")
def ownerb_h():
    return {"Authorization": f"Bearer {_login(OWNERB)}"}


@pytest.fixture(scope="module")
def active_customer(admin_h):
    # Get or create an active tenant-A customer for invoice tests
    r = requests.get(f"{API}/customers", headers=admin_h, params={"status": "active", "limit": 5}, timeout=15)
    items = r.json()["items"]
    if items:
        return items[0]
    r = requests.post(f"{API}/customers", json={"name": f"TEST Cust Inv {uuid.uuid4().hex[:6]}"}, headers=admin_h, timeout=15)
    return r.json()


# ---------- List / filter / sort / search / pagination ----------

def test_list_invoices_default(admin_h):
    r = requests.get(f"{API}/invoices", headers=admin_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert set(["items", "total", "page", "pages", "limit"]).issubset(body.keys())
    assert body["total"] >= 1
    for inv in body["items"]:
        assert "_id" not in inv
        assert inv["invoice_code"].startswith("INV-") and len(inv["invoice_code"]) == 10
        assert inv["status"] in ("paid", "partial", "unpaid", "overdue")
        assert inv["remaining"] == inv["total"] - inv["paid_amount"]


def test_list_filter_overdue(admin_h):
    r = requests.get(f"{API}/invoices", headers=admin_h, params={"status": "overdue", "limit": 100}, timeout=15)
    assert r.status_code == 200
    for inv in r.json()["items"]:
        assert inv["status"] == "overdue"


def test_list_filter_paid(admin_h):
    r = requests.get(f"{API}/invoices", headers=admin_h, params={"status": "paid", "limit": 100}, timeout=15)
    assert r.status_code == 200
    for inv in r.json()["items"]:
        assert inv["status"] == "paid"
        assert inv["remaining"] == 0


def test_list_search_no_match(admin_h):
    r = requests.get(f"{API}/invoices", headers=admin_h, params={"search": f"zzz_{uuid.uuid4().hex}"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_list_sort_amount_desc(admin_h):
    r = requests.get(f"{API}/invoices", headers=admin_h, params={"sort": "amount_desc", "limit": 100}, timeout=15)
    assert r.status_code == 200
    totals = [i["total"] for i in r.json()["items"]]
    assert totals == sorted(totals, reverse=True)


# ---------- Create + validation ----------

def test_create_invoice_valid(admin_h, active_customer):
    today = date.today()
    payload = {
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": (today + timedelta(days=30)).isoformat(),
        "total": 1500000,
        "notes": "TEST inv",
    }
    r = requests.post(f"{API}/invoices", json=payload, headers=admin_h, timeout=15)
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["invoice_code"].startswith("INV-")
    assert inv["total"] == 1500000
    assert inv["paid_amount"] == 0
    assert inv["status"] in ("unpaid",)
    assert inv["remaining"] == 1500000
    # GET verify
    r2 = requests.get(f"{API}/invoices/{inv['id']}", headers=admin_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["invoice"]["id"] == inv["id"]
    assert r2.json()["payments"] == []


def test_create_invoice_due_before_invoice(admin_h, active_customer):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": (today - timedelta(days=1)).isoformat(),
        "total": 100000,
    }, headers=admin_h, timeout=15)
    assert r.status_code == 400


def test_create_invoice_zero_total(admin_h, active_customer):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": today.isoformat(),
        "total": 0,
    }, headers=admin_h, timeout=15)
    assert r.status_code == 422


def test_create_invoice_bad_customer(admin_h):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": "000000000000000000000000",
        "invoice_date": today.isoformat(),
        "due_date": today.isoformat(),
        "total": 100000,
    }, headers=admin_h, timeout=15)
    assert r.status_code == 404


# ---------- Payment flow ----------

def test_payment_partial_then_full(admin_h, active_customer):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": (today + timedelta(days=30)).isoformat(),
        "total": 1000000,
    }, headers=admin_h, timeout=15)
    inv_id = r.json()["id"]
    inv_code = r.json()["invoice_code"]

    # Partial payment
    r1 = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 400000, "method": "Transfer Bank"}, headers=admin_h, timeout=15)
    assert r1.status_code == 201
    g = requests.get(f"{API}/invoices/{inv_id}", headers=admin_h, timeout=15).json()
    assert g["invoice"]["status"] == "partial"
    assert g["invoice"]["paid_amount"] == 400000
    assert g["invoice"]["remaining"] == 600000
    assert len(g["payments"]) == 1

    # Overpayment blocked
    r2 = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 999999999}, headers=admin_h, timeout=15)
    assert r2.status_code == 400

    # Remaining payment → paid
    r3 = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 600000}, headers=admin_h, timeout=15)
    assert r3.status_code == 201
    g2 = requests.get(f"{API}/invoices/{inv_id}", headers=admin_h, timeout=15).json()
    assert g2["invoice"]["status"] == "paid"
    assert g2["invoice"]["remaining"] == 0

    # Cannot pay when paid
    r4 = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 1}, headers=admin_h, timeout=15)
    assert r4.status_code == 400
    print(f"Paid invoice {inv_code}")


# ---------- Update ----------

def test_update_invoice_total_below_paid_blocked(admin_h, active_customer):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": (today + timedelta(days=10)).isoformat(),
        "total": 500000,
    }, headers=admin_h, timeout=15)
    inv_id = r.json()["id"]
    requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 300000}, headers=admin_h, timeout=15)
    r2 = requests.patch(f"{API}/invoices/{inv_id}", json={"total": 200000}, headers=admin_h, timeout=15)
    assert r2.status_code == 400


def test_update_invoice_ok(admin_h, active_customer):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": (today + timedelta(days=10)).isoformat(),
        "total": 500000,
    }, headers=admin_h, timeout=15)
    inv_id = r.json()["id"]
    r2 = requests.patch(f"{API}/invoices/{inv_id}", json={"total": 750000, "notes": "updated"}, headers=admin_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["total"] == 750000


# ---------- Summary ----------

def test_receivables_summary_shape(admin_h):
    r = requests.get(f"{API}/receivables/summary", headers=admin_h, timeout=15)
    assert r.status_code == 200
    s = r.json()
    for k in ("total_outstanding", "total_overdue", "count_overdue", "total_collected", "invoice_count", "aging", "top_debtors"):
        assert k in s
    buckets = {b["bucket"] for b in s["aging"]}
    assert buckets == {"current", "d1_30", "d31_60", "d61_90", "over_90"}


# ---------- RBAC ----------

def test_viewer_can_list_invoices(viewer_h):
    r = requests.get(f"{API}/invoices", headers=viewer_h, timeout=15)
    assert r.status_code == 200


def test_viewer_cannot_create_invoice(viewer_h, active_customer):
    today = date.today()
    r = requests.post(f"{API}/invoices", json={
        "customer_id": active_customer["id"],
        "invoice_date": today.isoformat(),
        "due_date": today.isoformat(),
        "total": 100000,
    }, headers=viewer_h, timeout=15)
    assert r.status_code == 403


def test_viewer_cannot_pay(viewer_h, admin_h):
    # get any tenant-A invoice
    items = requests.get(f"{API}/invoices", headers=admin_h, timeout=15).json()["items"]
    inv_id = items[0]["id"]
    r = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 1}, headers=viewer_h, timeout=15)
    assert r.status_code == 403


# ---------- Multi-tenant ----------

def test_tenant_b_isolated_invoices(ownerb_h, admin_h):
    b_items = requests.get(f"{API}/invoices", headers=ownerb_h, params={"limit": 100}, timeout=15).json()["items"]
    a_items = requests.get(f"{API}/invoices", headers=admin_h, params={"limit": 100}, timeout=15).json()["items"]
    a_ids = {i["id"] for i in a_items}
    b_ids = {i["id"] for i in b_items}
    assert a_ids.isdisjoint(b_ids)
    assert len(b_items) >= 1


def test_cross_tenant_invoice_404(ownerb_h, admin_h):
    a_items = requests.get(f"{API}/invoices", headers=admin_h, timeout=15).json()["items"]
    a_id = a_items[0]["id"]
    r = requests.get(f"{API}/invoices/{a_id}", headers=ownerb_h, timeout=15)
    assert r.status_code == 404
    r2 = requests.patch(f"{API}/invoices/{a_id}", json={"total": 1}, headers=ownerb_h, timeout=15)
    assert r2.status_code == 404
    r3 = requests.post(f"{API}/invoices/{a_id}/payments", json={"amount": 1}, headers=ownerb_h, timeout=15)
    assert r3.status_code == 404


# ---------- Audit ----------

def test_audit_invoice_events(admin_h):
    r = requests.get(f"{API}/security/activity", headers=admin_h, timeout=15)
    assert r.status_code == 200
    actions = {l["action"] for l in r.json()}
    assert "invoice_created" in actions
    assert "payment_recorded" in actions
    # verify old/new data present for payment
    for l in r.json():
        if l["action"] == "payment_recorded":
            assert l["old_data"] is not None
            assert l["new_data"] is not None
            assert "paid_amount" in l["new_data"]
            break
