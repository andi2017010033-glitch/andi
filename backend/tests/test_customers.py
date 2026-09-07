"""Backend API tests for Tahap 1B - Customer management (tenant-scoped)."""
import os
import uuid
import pytest
import requests

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


# ---------- List / filter / sort / pagination ----------

def test_list_default_tenant_a(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert set(["items", "total", "page", "pages", "limit"]).issubset(body.keys())
    assert body["total"] >= 2  # seeded CUS-000001, CUS-000002 for tenant A
    for c in body["items"]:
        assert "_id" not in c
        assert c["customer_code"].startswith("CUS-")


def test_list_filter_active(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, params={"status": "active"}, timeout=15)
    assert r.status_code == 200
    for c in r.json()["items"]:
        assert c["status"] == "active"


def test_list_filter_inactive(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, params={"status": "inactive"}, timeout=15)
    assert r.status_code == 200
    for c in r.json()["items"]:
        assert c["status"] == "inactive"


def test_list_sort_name_desc(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, params={"sort": "name_desc", "limit": 50}, timeout=15)
    assert r.status_code == 200
    names = [c["name"] for c in r.json()["items"]]
    assert names == sorted(names, reverse=True)


def test_list_search_empty(admin_h):
    r = requests.get(f"{API}/customers", headers=admin_h, params={"search": "zzz_no_match_xyz_" + uuid.uuid4().hex}, timeout=15)
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert r.json()["items"] == []


# ---------- Create + validation ----------

def test_create_customer_and_get(admin_h):
    payload = {
        "name": f"TEST Pelanggan {uuid.uuid4().hex[:6]}",
        "phone": "081234567890",
        "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
        "address": "Jl. Test 123",
        "notes": "catatan test",
        "status": "active",
    }
    r = requests.post(f"{API}/customers", json=payload, headers=admin_h, timeout=15)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["customer_code"].startswith("CUS-") and len(c["customer_code"]) == 10
    assert c["name"] == payload["name"]
    assert c["email"] == payload["email"].lower()

    # GET verify
    r2 = requests.get(f"{API}/customers/{c['id']}", headers=admin_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["id"] == c["id"]

    # Summary
    r3 = requests.get(f"{API}/customers/{c['id']}/summary", headers=admin_h, timeout=15)
    assert r3.status_code == 200
    s = r3.json()
    assert s == {"invoice_count": 0, "total_invoice": 0, "total_payment": 0, "total_piutang": 0}


def test_create_validation_empty_name(admin_h):
    r = requests.post(f"{API}/customers", json={"name": ""}, headers=admin_h, timeout=15)
    assert r.status_code == 422


def test_create_validation_bad_email(admin_h):
    r = requests.post(f"{API}/customers", json={"name": "TEST X", "email": "notanemail"}, headers=admin_h, timeout=15)
    assert r.status_code == 422


def test_create_validation_bad_phone(admin_h):
    r = requests.post(f"{API}/customers", json={"name": "TEST X", "phone": "abc!!!"}, headers=admin_h, timeout=15)
    assert r.status_code == 422


# ---------- Update ----------

def test_update_customer(admin_h):
    # create
    r = requests.post(f"{API}/customers", json={"name": f"TEST Upd {uuid.uuid4().hex[:6]}"}, headers=admin_h, timeout=15)
    assert r.status_code == 201
    cid = r.json()["id"]
    old_updated = r.json()["updated_at"]

    r2 = requests.patch(f"{API}/customers/{cid}", json={"name": "TEST Updated Name"}, headers=admin_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["name"] == "TEST Updated Name"
    assert r2.json()["updated_at"] != old_updated


# ---------- Deactivate ----------

def test_deactivate(admin_h):
    r = requests.post(f"{API}/customers", json={"name": f"TEST Deact {uuid.uuid4().hex[:6]}"}, headers=admin_h, timeout=15)
    cid = r.json()["id"]
    r2 = requests.post(f"{API}/customers/{cid}/deactivate", headers=admin_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["status"] == "inactive"
    # still exists (soft delete)
    r3 = requests.get(f"{API}/customers/{cid}", headers=admin_h, timeout=15)
    assert r3.status_code == 200 and r3.json()["status"] == "inactive"


# ---------- RBAC ----------

def test_viewer_can_list(viewer_h):
    r = requests.get(f"{API}/customers", headers=viewer_h, timeout=15)
    assert r.status_code == 200


def test_viewer_cannot_create(viewer_h):
    r = requests.post(f"{API}/customers", json={"name": "TEST viewer"}, headers=viewer_h, timeout=15)
    assert r.status_code == 403


def test_viewer_cannot_patch(viewer_h, admin_h):
    # get an ID from admin tenant list
    lst = requests.get(f"{API}/customers", headers=admin_h, timeout=15).json()["items"]
    cid = lst[0]["id"]
    r = requests.patch(f"{API}/customers/{cid}", json={"name": "X"}, headers=viewer_h, timeout=15)
    assert r.status_code == 403


def test_viewer_cannot_deactivate(viewer_h, admin_h):
    lst = requests.get(f"{API}/customers", headers=admin_h, timeout=15).json()["items"]
    cid = lst[0]["id"]
    r = requests.post(f"{API}/customers/{cid}/deactivate", headers=viewer_h, timeout=15)
    assert r.status_code == 403


# ---------- Multi-tenant isolation ----------

def test_tenant_b_isolated(ownerb_h, admin_h):
    b_items = requests.get(f"{API}/customers", headers=ownerb_h, params={"limit": 100}, timeout=15).json()["items"]
    a_items = requests.get(f"{API}/customers", headers=admin_h, params={"limit": 100}, timeout=15).json()["items"]
    a_ids = {c["id"] for c in a_items}
    b_ids = {c["id"] for c in b_items}
    assert a_ids.isdisjoint(b_ids)
    # B must see seeded 2 tenant-B customers
    b_names = {c["name"] for c in b_items}
    assert "CV Mitra Sejahtera B" in b_names or "Toko Berkah Tenant B" in b_names


def test_cross_tenant_returns_404(ownerb_h, admin_h):
    a_items = requests.get(f"{API}/customers", headers=admin_h, timeout=15).json()["items"]
    a_id = a_items[0]["id"]
    r = requests.get(f"{API}/customers/{a_id}", headers=ownerb_h, timeout=15)
    assert r.status_code == 404
    r2 = requests.patch(f"{API}/customers/{a_id}", json={"name": "hax"}, headers=ownerb_h, timeout=15)
    assert r2.status_code == 404
    r3 = requests.post(f"{API}/customers/{a_id}/deactivate", headers=ownerb_h, timeout=15)
    assert r3.status_code == 404


def test_tenant_b_independent_counter(ownerb_h):
    r = requests.post(f"{API}/customers", json={"name": f"TEST B {uuid.uuid4().hex[:6]}"}, headers=ownerb_h, timeout=15)
    assert r.status_code == 201
    code = r.json()["customer_code"]
    # tenant B seeded with 2, so next should be >= CUS-000003
    seq = int(code.split("-")[1])
    assert seq >= 3


# ---------- Audit log ----------

def test_audit_log_has_customer_events(admin_h):
    r = requests.get(f"{API}/security/activity", headers=admin_h, timeout=15)
    assert r.status_code == 200
    logs = r.json()
    actions = {l["action"] for l in logs}
    assert "customer_created" in actions
    # verify structure of at least one customer event
    for l in logs:
        if l["action"] == "customer_updated":
            assert l["entity_type"] == "customer"
            assert l["entity_id"]
            assert l["old_data"] is not None
            assert l["new_data"] is not None
            break
