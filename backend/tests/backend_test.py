"""Backend API tests for Tahap 1A auth + user mgmt + security."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://auto-piutang.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
STAFF = {"username": "staff", "password": "staff123"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and data["user"]["role"] == "admin"
    assert data.get("expires_in") == 900
    return data["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{API}/auth/login", json=STAFF, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------- Auth ----------

def test_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert "status" in r.json()


def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "WRONGxx"}, timeout=15)
    assert r.status_code == 401
    assert "salah" in r.json().get("detail", "").lower()


def test_me_without_token():
    r = requests.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 401


def test_me_with_token(admin_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
    assert r.json()["role"] == "admin"


def test_session_info(admin_token):
    r = requests.get(f"{API}/auth/session", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["algorithm"] == "HS256"
    assert "expires_at" in j


# ---------- RBAC ----------

def test_users_admin_only_from_staff(staff_token):
    r = requests.get(f"{API}/users", headers={"Authorization": f"Bearer {staff_token}"}, timeout=10)
    assert r.status_code == 403


def test_users_list_as_admin(admin_token):
    r = requests.get(f"{API}/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    users = r.json()
    usernames = [u["username"] for u in users]
    assert "admin" in usernames and "staff" in usernames
    # No mongo _id leakage
    for u in users:
        assert "_id" not in u
        assert "id" in u


def test_security_activity_admin(admin_token):
    r = requests.get(f"{API}/security/activity", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    logs = r.json()
    assert isinstance(logs, list)
    actions = [l["action"] for l in logs]
    assert any("login_success" == a for a in actions)


def test_security_activity_staff_forbidden(staff_token):
    r = requests.get(f"{API}/security/activity", headers={"Authorization": f"Bearer {staff_token}"}, timeout=10)
    assert r.status_code == 403


# ---------- User CRUD ----------

def test_create_update_user(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    uname = f"test_{uuid.uuid4().hex[:8]}"
    payload = {"username": uname, "name": "Tester", "password": "testing123", "role": "staff"}
    r = requests.post(f"{API}/users", json=payload, headers=h, timeout=10)
    assert r.status_code == 201, r.text
    user = r.json()
    assert user["username"] == uname and user["role"] == "staff"
    uid = user["id"]

    # Verify persistence via list
    r2 = requests.get(f"{API}/users", headers=h, timeout=10)
    assert any(u["id"] == uid for u in r2.json())

    # Update role admin, then deactivate
    r3 = requests.patch(f"{API}/users/{uid}", json={"role": "admin"}, headers=h, timeout=10)
    assert r3.status_code == 200 and r3.json()["role"] == "admin"

    r4 = requests.patch(f"{API}/users/{uid}", json={"is_active": False}, headers=h, timeout=10)
    assert r4.status_code == 200 and r4.json()["is_active"] is False

    # Duplicate username -> 409
    r5 = requests.post(f"{API}/users", json=payload, headers=h, timeout=10)
    assert r5.status_code == 409


def test_admin_cannot_demote_self(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    me = requests.get(f"{API}/auth/me", headers=h, timeout=10).json()
    r = requests.patch(f"{API}/users/{me['id']}", json={"role": "staff"}, headers=h, timeout=10)
    assert r.status_code == 400


# ---------- Brute force lockout (using fake username, not admin) ----------

def test_lockout_fake_username():
    fake = f"locktest_{uuid.uuid4().hex[:6]}"
    last_status = None
    for i in range(6):
        r = requests.post(f"{API}/auth/login", json={"username": fake, "password": "nope"}, timeout=10)
        last_status = r.status_code
        if r.status_code == 429:
            break
    # After 5 failures the 6th should be 429 (or the 5th if lockout is triggered on that call)
    assert last_status == 429, f"Expected 429 lockout, got {last_status}"


# ---------- Logout ----------

def test_logout(admin_token):
    r = requests.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
