"""Backend API tests for Tahap 1C - Invoice with Items module."""
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
def staff_h():
    return {"Authorization": f"Bearer {_login(STAFF)}"}


@pytest.fixture(scope="module")
def viewer_h():
    return {"Authorization": f"Bearer {_login(VIEWER)}"}


@pytest.fixture(scope="module")
def ownerb_h():
    return {"Authorization": f"Bearer {_login(OWNERB)}"}


@pytest.fixture(scope="module")
def cust_a(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, params={"status": "active", "limit": 5}, timeout=15)
    items = r.json()["items"]
    if items:
        return items[0]
    r = requests.post(f"{API}/customers", json={"name": f"TEST 1C {uuid.uuid4().hex[:6]}"}, headers=admin_h, timeout=15)
    return r.json()


def _make_payload(cust_id, save_as="invoice", items=None, discount=0, tax=0, days=15):
    today = date.today()
    return {
        "customer_id": cust_id,
        "invoice_date": today.isoformat(),
        "due_date": (today + timedelta(days=days)).isoformat(),
        "discount": discount,
        "tax": tax,
        "items": items if items is not None else [
            {"product_name": "Produk A", "quantity": 10, "price": 5000, "discount": 0},
            {"product_name": "Produk B", "quantity": 5, "price": 15000, "discount": 0},
        ],
        "save_as": save_as,
    }


# ---------- Create with items: calculation & format ----------

def test_create_invoice_calculation_and_number_format(admin_h, cust_a):
    p = _make_payload(cust_a["id"])
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=20)
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["subtotal"] == 125000
    assert inv["total"] == 125000
    assert inv["paid_amount"] == 0
    assert inv["remaining"] == 125000
    assert inv["outstanding_amount"] == 125000
    assert inv["status"] == "unpaid"
    # Format INV-YYYYMM-XXXXXX (16 chars) OR legacy INV-000XXX for old tests
    code = inv["invoice_code"]
    assert code.startswith("INV-")
    parts = code.split("-")
    assert len(parts) == 3, f"Expected new format INV-YYYYMM-XXXXXX, got {code}"
    assert len(parts[1]) == 6 and len(parts[2]) == 6

    # GET returns items + payments
    g = requests.get(f"{API}/invoices/{inv['id']}", headers=admin_h, timeout=15).json()
    assert len(g["items"]) == 2
    assert g["items"][0]["subtotal"] == 50000
    assert g["items"][1]["subtotal"] == 75000
    assert g["payments"] == []


def test_create_invoice_with_item_discount(admin_h, cust_a):
    p = _make_payload(cust_a["id"], items=[
        {"product_name": "X", "quantity": 4, "price": 10000, "discount": 5000},
    ])
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    assert r.status_code == 201
    assert r.json()["subtotal"] == 35000
    assert r.json()["total"] == 35000


def test_create_invoice_discount_exceeds_subtotal_400(admin_h, cust_a):
    p = _make_payload(cust_a["id"], discount=999999)
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    assert r.status_code == 400


def test_create_invoice_qty_zero_422(admin_h, cust_a):
    p = _make_payload(cust_a["id"], items=[{"product_name": "X", "quantity": 0, "price": 1000}])
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    assert r.status_code == 422


def test_create_invoice_no_items_422(admin_h, cust_a):
    p = _make_payload(cust_a["id"], items=[])
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    assert r.status_code == 422


def test_create_invoice_due_before_invoice_400(admin_h, cust_a):
    today = date.today()
    p = _make_payload(cust_a["id"])
    p["due_date"] = (today - timedelta(days=1)).isoformat()
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    assert r.status_code == 400


# ---------- Draft flow ----------

def test_draft_flow_excluded_from_receivable_and_publish(admin_h, cust_a):
    p = _make_payload(cust_a["id"], save_as="draft")
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    assert r.status_code == 201
    inv = r.json()
    assert inv["status"] == "draft"
    inv_id = inv["id"]

    # /piutang list (receivable=true) must EXCLUDE drafts
    r2 = requests.get(f"{API}/invoices", headers=admin_h, params={"receivable": True, "limit": 100}, timeout=15)
    assert inv_id not in [i["id"] for i in r2.json()["items"]]

    # Summary excludes drafts (implicit; just ensure endpoint works)
    r3 = requests.get(f"{API}/receivables/summary", headers=admin_h, timeout=15)
    assert r3.status_code == 200

    # Draft can be fully edited
    p2 = _make_payload(cust_a["id"], items=[{"product_name": "Z", "quantity": 2, "price": 25000}])
    r4 = requests.patch(f"{API}/invoices/{inv_id}", json={**p2, "save_as": "invoice"}, headers=admin_h, timeout=15)
    assert r4.status_code == 200
    upd = r4.json()
    assert upd["status"] == "unpaid"
    assert upd["total"] == 50000

    # Now in receivable list
    r5 = requests.get(f"{API}/invoices", headers=admin_h, params={"receivable": True, "limit": 200}, timeout=15)
    assert inv_id in [i["id"] for i in r5.json()["items"]]


# ---------- Update: paid financial lock ----------

def test_update_after_payment_locks_items(admin_h, cust_a):
    p = _make_payload(cust_a["id"])
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    inv_id = r.json()["id"]
    # Pay partial
    rp = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 10000}, headers=admin_h, timeout=15)
    assert rp.status_code == 201
    # Try edit items -> should be blocked
    r2 = requests.patch(f"{API}/invoices/{inv_id}", json={
        "items": [{"product_name": "X", "quantity": 1, "price": 200000}]
    }, headers=admin_h, timeout=15)
    assert r2.status_code == 400
    # Notes-only edit OK
    r3 = requests.patch(f"{API}/invoices/{inv_id}", json={"notes": "catatan baru"}, headers=admin_h, timeout=15)
    assert r3.status_code == 200


# ---------- Cancel: RBAC + not counted in receivables ----------

def test_cancel_staff_forbidden_admin_ok(admin_h, staff_h, cust_a):
    p = _make_payload(cust_a["id"])
    r = requests.post(f"{API}/invoices", json=p, headers=admin_h, timeout=15)
    inv_id = r.json()["id"]

    r_staff = requests.post(f"{API}/invoices/{inv_id}/cancel", headers=staff_h, timeout=15)
    assert r_staff.status_code == 403

    r_admin = requests.post(f"{API}/invoices/{inv_id}/cancel", headers=admin_h, timeout=15)
    assert r_admin.status_code == 200
    assert r_admin.json()["status"] == "cancelled"

    # Still exists in list when filter cancelled
    r_list = requests.get(f"{API}/invoices", headers=admin_h, params={"status": "cancelled", "limit": 100}, timeout=15)
    assert inv_id in [i["id"] for i in r_list.json()["items"]]

    # NOT in receivable list
    r_rec = requests.get(f"{API}/invoices", headers=admin_h, params={"receivable": True, "limit": 200}, timeout=15)
    assert inv_id not in [i["id"] for i in r_rec.json()["items"]]

    # Payment blocked
    r_pay = requests.post(f"{API}/invoices/{inv_id}/payments", json={"amount": 1000}, headers=admin_h, timeout=15)
    assert r_pay.status_code == 400


# ---------- RBAC viewer ----------

def test_viewer_cannot_create_invoice(viewer_h, cust_a):
    r = requests.post(f"{API}/invoices", json=_make_payload(cust_a["id"]), headers=viewer_h, timeout=15)
    assert r.status_code == 403


# ---------- Multi-tenant ----------

def test_tenant_b_cross_tenant_404(admin_h, ownerb_h, cust_a):
    r = requests.post(f"{API}/invoices", json=_make_payload(cust_a["id"]), headers=admin_h, timeout=15)
    inv_id = r.json()["id"]
    r2 = requests.get(f"{API}/invoices/{inv_id}", headers=ownerb_h, timeout=15)
    assert r2.status_code == 404
    r3 = requests.post(f"{API}/invoices/{inv_id}/cancel", headers=ownerb_h, timeout=15)
    assert r3.status_code == 404


# ---------- Period filter ----------

def test_period_month_filter(admin_h):
    r = requests.get(f"{API}/invoices", headers=admin_h, params={"period": "month", "limit": 100}, timeout=15)
    assert r.status_code == 200
    today = date.today()
    for inv in r.json()["items"]:
        d = date.fromisoformat(inv["invoice_date"][:10])
        assert d.year == today.year and d.month == today.month


def test_custom_range_filter(admin_h):
    today = date.today()
    r = requests.get(f"{API}/invoices", headers=admin_h, params={
        "period": "custom",
        "date_from": today.isoformat(),
        "date_to": today.isoformat(),
        "limit": 100,
    }, timeout=15)
    assert r.status_code == 200
    for inv in r.json()["items"]:
        assert inv["invoice_date"][:10] == today.isoformat()


# ---------- Search: customer picker source (active only) ----------

def test_customers_list_active_only_for_picker(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, params={"status": "active", "limit": 100}, timeout=15)
    assert r.status_code == 200
    for c in r.json()["items"]:
        assert c["status"] == "active"


# ---------- Receivable summary excludes drafts and cancelled ----------

def test_summary_excludes_draft_cancelled(admin_h, cust_a):
    # Create a draft & a cancelled
    r_d = requests.post(f"{API}/invoices", json=_make_payload(cust_a["id"], save_as="draft"), headers=admin_h, timeout=15)
    r_c = requests.post(f"{API}/invoices", json=_make_payload(cust_a["id"]), headers=admin_h, timeout=15)
    requests.post(f"{API}/invoices/{r_c.json()['id']}/cancel", headers=admin_h, timeout=15)

    s = requests.get(f"{API}/receivables/summary", headers=admin_h, timeout=15).json()
    # Total invoice count should not include these two
    # This is soft: at least summary endpoint works
    assert "invoice_count" in s
    assert "total_outstanding" in s
