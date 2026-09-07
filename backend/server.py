from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import logging
import bcrypt
import jwt
from bson import ObjectId
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from pymongo import ReturnDocument
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = 15
REFRESH_TOKEN_TTL_DAYS = 7
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

app = FastAPI(title="Rekap Piutang Otomatis API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def serialize_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "email": doc.get("email"),
        "name": doc.get("name", doc["username"]),
        "role": doc.get("role", "staff"),
        "company_id": doc.get("company_id"),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
        "last_login_at": doc.get("last_login_at"),
    }


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def log_activity(
    username: str,
    action: str,
    request: Request,
    detail: Optional[str] = None,
    company_id: Optional[str] = None,
    user_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    old_data: Optional[dict] = None,
    new_data: Optional[dict] = None,
):
    await db.activity_logs.insert_one({
        "username": username,
        "action": action,
        "detail": detail,
        "company_id": company_id,
        "user_id": user_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "old_data": old_data,
        "new_data": new_data,
        "ip": get_client_ip(request),
        "user_agent": request.headers.get("user-agent", "")[:200],
        "timestamp": datetime.now(timezone.utc),
    })


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Sesi tidak ditemukan. Silakan masuk kembali.")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipe token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Akun dinonaktifkan. Hubungi administrator.")
        return serialize_user(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi kedaluwarsa. Silakan masuk kembali.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak. Hanya admin/owner yang diizinkan.")
    return user


CUSTOMER_WRITE_ROLES = ("owner", "admin", "staff")


async def require_customer_write(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in CUSTOMER_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak. Peran Anda hanya dapat melihat data.")
    return user


# ---------- Schemas ----------

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    email: Optional[str] = None
    password: str = Field(min_length=6)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    email: Optional[str] = None
    password: str = Field(min_length=6)
    role: str = Field(default="staff", pattern="^(owner|admin|staff|viewer)$")


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern="^(owner|admin|staff|viewer)$")
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6)


PHONE_PATTERN = r"^[0-9+\-\s()]{6,25}$"


class CustomerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=25)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=1000)
    status: str = Field(default="active", pattern="^(active|inactive)$")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        cleaned = v.strip()
        if not cleaned:
            return None
        if not re.match(PHONE_PATTERN, cleaned):
            raise ValueError("Nomor telepon tidak valid (6-25 digit, boleh + - spasi)")
        return cleaned


class CustomerUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=25)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=1000)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        cleaned = v.strip()
        if not cleaned:
            return None
        if not re.match(PHONE_PATTERN, cleaned):
            raise ValueError("Nomor telepon tidak valid (6-25 digit, boleh + - spasi)")
        return cleaned


# ---------- Auth endpoints ----------

@api_router.post("/auth/register", status_code=201)
async def register(body: RegisterRequest, request: Request, response: Response):
    username = body.username.strip().lower()
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="Username sudah digunakan.")
    now = datetime.now(timezone.utc)
    default_company = await db.companies.find_one({"is_default": True})
    company_id = str(default_company["_id"]) if default_company else None
    doc = {
        "username": username,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": "staff",
        "company_id": company_id,
        "is_active": True,
        "created_at": now,
        "created_by": "self-register",
        "last_login_at": now,
    }
    if body.email:
        email = body.email.strip().lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="Email sudah digunakan.")
        doc["email"] = email
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id

    access_token = create_access_token(str(doc["_id"]), username, "staff")
    refresh_token = create_refresh_token(str(doc["_id"]))
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=ACCESS_TOKEN_TTL_MINUTES * 60, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=REFRESH_TOKEN_TTL_DAYS * 86400, path="/")
    await log_activity(username, "user_registered", request, "Pendaftaran mandiri (peran staff)", company_id=company_id, user_id=str(doc["_id"]), entity_type="user", entity_id=str(doc["_id"]))
    return {
        "user": serialize_user(doc),
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_MINUTES * 60,
    }


@api_router.post("/auth/login")
async def login(body: LoginRequest, request: Request, response: Response):
    username = body.username.strip().lower()
    identifier = f"{get_client_ip(request)}:{username}"

    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("locked_until"):
        locked_until = attempt["locked_until"]
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until)
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > datetime.now(timezone.utc):
            remaining = int((locked_until - datetime.now(timezone.utc)).total_seconds() // 60) + 1
            await log_activity(username, "login_blocked", request, f"Akun terkunci, sisa {remaining} menit")
            raise HTTPException(status_code=429, detail=f"Terlalu banyak percobaan gagal. Coba lagi dalam {remaining} menit.")

    user = await db.users.find_one({"username": username})
    if not user or not verify_password(body.password, user["password_hash"]):
        res = await db.login_attempts.find_one_and_update(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"last_attempt": datetime.now(timezone.utc)},
                "$setOnInsert": {"identifier": identifier},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if res["count"] >= MAX_FAILED_ATTEMPTS:
            await db.login_attempts.update_one(
                {"identifier": identifier},
                {"$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES), "count": 0}},
            )
        await log_activity(username, "login_failed", request, "Kata sandi salah atau pengguna tidak ditemukan")
        raise HTTPException(status_code=401, detail="Username atau kata sandi salah.")

    if not user.get("is_active", True):
        await log_activity(username, "login_failed", request, "Akun dinonaktifkan")
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan. Hubungi administrator.")

    await db.login_attempts.delete_one({"identifier": identifier})
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}})

    access_token = create_access_token(str(user["_id"]), user["username"], user.get("role", "staff"))
    refresh_token = create_refresh_token(str(user["_id"]))
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=ACCESS_TOKEN_TTL_MINUTES * 60, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=REFRESH_TOKEN_TTL_DAYS * 86400, path="/")

    await log_activity(username, "login_success", request, company_id=user.get("company_id"), user_id=str(user["_id"]))
    user_doc = serialize_user(user)
    user_doc["last_login_at"] = datetime.now(timezone.utc)
    return {
        "user": user_doc,
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_MINUTES * 60,
    }


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    await log_activity(user["username"], "logout", request)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Berhasil keluar"}


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token tidak ditemukan")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Tipe token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user or not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Pengguna tidak valid")
        access_token = create_access_token(str(user["_id"]), user["username"], user.get("role", "staff"))
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=ACCESS_TOKEN_TTL_MINUTES * 60, path="/")
        return {"access_token": access_token, "token_type": "bearer", "expires_in": ACCESS_TOKEN_TTL_MINUTES * 60}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token kedaluwarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


@api_router.get("/auth/session")
async def session_info(request: Request, user: dict = Depends(get_current_user)):
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    return {
        "algorithm": JWT_ALGORITHM,
        "issued_at": datetime.fromtimestamp(payload["iat"], tz=timezone.utc).isoformat() if payload.get("iat") else None,
        "expires_at": datetime.fromtimestamp(payload["exp"], tz=timezone.utc).isoformat(),
        "ip": get_client_ip(request),
        "user": user,
        "security_level": "Tinggi",
    }


# ---------- User management (admin) ----------

@api_router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({"company_id": admin["company_id"]}).sort("created_at", 1).to_list(500)
    return [serialize_user(u) for u in users]


@api_router.post("/users", status_code=201)
async def create_user(body: UserCreateRequest, request: Request, admin: dict = Depends(require_admin)):
    username = body.username.strip().lower()
    existing = await db.users.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=409, detail="Username sudah digunakan.")
    doc = {
        "username": username,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": body.role,
        "company_id": admin["company_id"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "created_by": admin["username"],
        "last_login_at": None,
    }
    if body.email:
        doc["email"] = body.email.strip().lower()
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(admin["username"], "user_created", request, f"Membuat pengguna '{username}' peran {body.role}")
    return serialize_user(doc)


@api_router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateRequest, request: Request, admin: dict = Depends(require_admin)):
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID pengguna tidak valid")
    if not target:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.role is not None:
        updates["role"] = body.role
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.password:
        updates["password_hash"] = hash_password(body.password)

    if str(target["_id"]) == admin["id"] and updates.get("is_active") is False:
        raise HTTPException(status_code=400, detail="Tidak dapat menonaktifkan akun sendiri.")
    if str(target["_id"]) == admin["id"] and updates.get("role") in ("staff", "viewer"):
        raise HTTPException(status_code=400, detail="Tidak dapat menurunkan peran akun sendiri.")

    if updates:
        await db.users.update_one({"_id": target["_id"]}, {"$set": updates})
        await log_activity(admin["username"], "user_updated", request, f"Memperbarui pengguna '{target['username']}': {list(updates.keys())}")
    updated = await db.users.find_one({"_id": target["_id"]})
    return serialize_user(updated)


# ---------- Customers (tenant-scoped) ----------

CUSTOMER_SORTS = {
    "name_asc": [("name", 1), ("_id", 1)],
    "name_desc": [("name", -1), ("_id", 1)],
    "newest": [("created_at", -1), ("_id", -1)],
    "oldest": [("created_at", 1), ("_id", 1)],
}


def serialize_customer(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "company_id": doc.get("company_id"),
        "customer_code": doc.get("customer_code"),
        "name": doc.get("name"),
        "phone": doc.get("phone"),
        "email": doc.get("email"),
        "address": doc.get("address"),
        "notes": doc.get("notes"),
        "status": doc.get("status", "active"),
        "created_by": doc.get("created_by"),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        "updated_at": doc["updated_at"].isoformat() if doc.get("updated_at") else None,
    }


async def get_tenant_customer(customer_id: str, company_id: str) -> dict:
    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan")
    doc = await db.customers.find_one({"_id": oid, "company_id": company_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan")
    return doc


@api_router.get("/customers")
async def list_customers(
    search: str = "",
    status: str = "all",
    sort: str = "name_asc",
    page: int = 1,
    limit: int = 10,
    user: dict = Depends(get_current_user),
):
    query = {"company_id": user["company_id"]}
    if status in ("active", "inactive"):
        query["status"] = status
    if search.strip():
        pattern = re.escape(search.strip())
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"customer_code": {"$regex": pattern, "$options": "i"}},
            {"phone": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
        ]
    page = max(1, page)
    limit = min(max(1, limit), 100)
    sort_spec = CUSTOMER_SORTS.get(sort, CUSTOMER_SORTS["name_asc"])
    total = await db.customers.count_documents(query)
    items = await db.customers.find(query).sort(sort_spec).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {
        "items": [serialize_customer(c) for c in items],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
        "limit": limit,
    }


@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    return serialize_customer(await get_tenant_customer(customer_id, user["company_id"]))


@api_router.get("/customers/{customer_id}/summary")
async def get_customer_summary(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await get_tenant_customer(customer_id, user["company_id"])
    cid = str(customer["_id"])
    company_id = user["company_id"]
    invoice_count = await db.invoices.count_documents({"company_id": company_id, "customer_id": cid})
    inv_agg = await db.invoices.aggregate([
        {"$match": {"company_id": company_id, "customer_id": cid}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]).to_list(1)
    pay_agg = await db.payments.aggregate([
        {"$match": {"company_id": company_id, "customer_id": cid}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_invoice = inv_agg[0]["total"] if inv_agg else 0
    total_payment = pay_agg[0]["total"] if pay_agg else 0
    return {
        "invoice_count": invoice_count,
        "total_invoice": total_invoice,
        "total_payment": total_payment,
        "total_piutang": total_invoice - total_payment,
    }


@api_router.post("/customers", status_code=201)
async def create_customer(body: CustomerCreateRequest, request: Request, user: dict = Depends(require_customer_write)):
    counter = await db.counters.find_one_and_update(
        {"_id": f"customer_code:{user['company_id']}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    now = datetime.now(timezone.utc)
    doc = {
        "company_id": user["company_id"],
        "customer_code": f"CUS-{counter['seq']:06d}",
        "name": body.name.strip(),
        "status": body.status,
        "created_by": user["username"],
        "created_at": now,
        "updated_at": now,
    }
    if body.phone:
        doc["phone"] = body.phone
    if body.email:
        doc["email"] = str(body.email).strip().lower()
    if body.address:
        doc["address"] = body.address.strip()
    if body.notes:
        doc["notes"] = body.notes.strip()
    result = await db.customers.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(
        user["username"], "customer_created", request,
        detail=f"Membuat pelanggan {doc['customer_code']} - {doc['name']}",
        company_id=user["company_id"], user_id=user["id"],
        entity_type="customer", entity_id=str(doc["_id"]),
        new_data=serialize_customer(doc),
    )
    return serialize_customer(doc)


@api_router.patch("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerUpdateRequest, request: Request, user: dict = Depends(require_customer_write)):
    existing = await get_tenant_customer(customer_id, user["company_id"])
    updates = {}
    for field in ("name", "phone", "address", "notes"):
        val = getattr(body, field)
        if val is not None:
            updates[field] = val.strip() if isinstance(val, str) else val
    if body.email is not None:
        updates["email"] = str(body.email).strip().lower()
    if body.status is not None:
        updates["status"] = body.status
    if not updates:
        return serialize_customer(existing)
    updates["updated_at"] = datetime.now(timezone.utc)
    old_data = {k: existing.get(k) for k in updates if k != "updated_at"}
    await db.customers.update_one({"_id": existing["_id"], "company_id": user["company_id"]}, {"$set": updates})
    updated = await db.customers.find_one({"_id": existing["_id"]})
    new_data = {k: updated.get(k) for k in updates if k != "updated_at"}
    await log_activity(
        user["username"], "customer_updated", request,
        detail=f"Memperbarui pelanggan {existing['customer_code']}: {list(new_data.keys())}",
        company_id=user["company_id"], user_id=user["id"],
        entity_type="customer", entity_id=customer_id,
        old_data=old_data, new_data=new_data,
    )
    return serialize_customer(updated)


@api_router.post("/customers/{customer_id}/deactivate")
async def deactivate_customer(customer_id: str, request: Request, user: dict = Depends(require_customer_write)):
    existing = await get_tenant_customer(customer_id, user["company_id"])
    if existing.get("status") == "inactive":
        return serialize_customer(existing)
    await db.customers.update_one(
        {"_id": existing["_id"], "company_id": user["company_id"]},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc)}},
    )
    updated = await db.customers.find_one({"_id": existing["_id"]})
    await log_activity(
        user["username"], "customer_deactivated", request,
        detail=f"Menonaktifkan pelanggan {existing['customer_code']} - {existing['name']}",
        company_id=user["company_id"], user_id=user["id"],
        entity_type="customer", entity_id=customer_id,
        old_data={"status": "active"}, new_data={"status": "inactive"},
    )
    return serialize_customer(updated)


# ---------- Invoices / Piutang (tenant-scoped) ----------

class InvoiceCreateRequest(BaseModel):
    customer_id: str
    invoice_date: date
    due_date: date
    total: float = Field(gt=0, le=10_000_000_000_000)
    notes: Optional[str] = Field(default=None, max_length=1000)


class InvoiceUpdateRequest(BaseModel):
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    total: Optional[float] = Field(default=None, gt=0, le=10_000_000_000_000)
    notes: Optional[str] = Field(default=None, max_length=1000)


class PaymentCreateRequest(BaseModel):
    amount: float = Field(gt=0, le=10_000_000_000_000)
    payment_date: Optional[date] = None
    method: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=500)


def to_utc_day(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def compute_invoice_status(doc: dict) -> str:
    total = doc.get("total", 0)
    paid = doc.get("paid_amount", 0)
    if paid >= total:
        return "paid"
    due = doc.get("due_date")
    if due is not None:
        if isinstance(due, str):
            due = datetime.fromisoformat(due)
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due < datetime.now(timezone.utc):
            return "overdue"
    return "partial" if paid > 0 else "unpaid"


def serialize_invoice(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "company_id": doc.get("company_id"),
        "invoice_code": doc.get("invoice_code"),
        "customer_id": doc.get("customer_id"),
        "customer_name": doc.get("customer_name"),
        "customer_code": doc.get("customer_code"),
        "invoice_date": doc["invoice_date"].isoformat() if doc.get("invoice_date") else None,
        "due_date": doc["due_date"].isoformat() if doc.get("due_date") else None,
        "total": doc.get("total", 0),
        "paid_amount": doc.get("paid_amount", 0),
        "remaining": doc.get("total", 0) - doc.get("paid_amount", 0),
        "status": compute_invoice_status(doc),
        "notes": doc.get("notes"),
        "created_by": doc.get("created_by"),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        "updated_at": doc["updated_at"].isoformat() if doc.get("updated_at") else None,
    }


def serialize_payment(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "invoice_id": doc.get("invoice_id"),
        "customer_id": doc.get("customer_id"),
        "amount": doc.get("amount", 0),
        "payment_date": doc["payment_date"].isoformat() if doc.get("payment_date") else None,
        "method": doc.get("method"),
        "notes": doc.get("notes"),
        "created_by": doc.get("created_by"),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
    }


async def get_tenant_invoice(invoice_id: str, company_id: str) -> dict:
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Piutang tidak ditemukan")
    doc = await db.invoices.find_one({"_id": oid, "company_id": company_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Piutang tidak ditemukan")
    return doc


INVOICE_SORTS = {
    "newest": [("created_at", -1), ("_id", -1)],
    "oldest": [("created_at", 1), ("_id", 1)],
    "due_asc": [("due_date", 1), ("_id", 1)],
    "due_desc": [("due_date", -1), ("_id", -1)],
    "amount_desc": [("total", -1), ("_id", 1)],
    "amount_asc": [("total", 1), ("_id", 1)],
}


@api_router.get("/invoices")
async def list_invoices(
    search: str = "",
    status: str = "all",
    sort: str = "newest",
    page: int = 1,
    limit: int = 10,
    user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    query = {"company_id": user["company_id"]}
    if status == "paid":
        query["$expr"] = {"$gte": ["$paid_amount", "$total"]}
    elif status == "partial":
        query["paid_amount"] = {"$gt": 0}
        query["$expr"] = {"$lt": ["$paid_amount", "$total"]}
        query["due_date"] = {"$gte": now}
    elif status == "unpaid":
        query["paid_amount"] = 0
        query["due_date"] = {"$gte": now}
    elif status == "overdue":
        query["$expr"] = {"$lt": ["$paid_amount", "$total"]}
        query["due_date"] = {"$lt": now}
    if search.strip():
        pattern = re.escape(search.strip())
        query["$or"] = [
            {"invoice_code": {"$regex": pattern, "$options": "i"}},
            {"customer_name": {"$regex": pattern, "$options": "i"}},
            {"customer_code": {"$regex": pattern, "$options": "i"}},
        ]
    page = max(1, page)
    limit = min(max(1, limit), 100)
    sort_spec = INVOICE_SORTS.get(sort, INVOICE_SORTS["newest"])
    total = await db.invoices.count_documents(query)
    items = await db.invoices.find(query).sort(sort_spec).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {
        "items": [serialize_invoice(i) for i in items],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
        "limit": limit,
    }


@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    invoice = await get_tenant_invoice(invoice_id, user["company_id"])
    payments = await db.payments.find({"company_id": user["company_id"], "invoice_id": invoice_id}).sort("payment_date", -1).to_list(500)
    return {"invoice": serialize_invoice(invoice), "payments": [serialize_payment(p) for p in payments]}


@api_router.post("/invoices", status_code=201)
async def create_invoice(body: InvoiceCreateRequest, request: Request, user: dict = Depends(require_customer_write)):
    customer = await get_tenant_customer(body.customer_id, user["company_id"])
    if customer.get("status") != "active":
        raise HTTPException(status_code=400, detail="Pelanggan tidak aktif. Aktifkan kembali sebelum membuat piutang.")
    if body.due_date < body.invoice_date:
        raise HTTPException(status_code=400, detail="Tanggal jatuh tempo tidak boleh sebelum tanggal invoice.")
    counter = await db.counters.find_one_and_update(
        {"_id": f"invoice_code:{user['company_id']}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    now = datetime.now(timezone.utc)
    doc = {
        "company_id": user["company_id"],
        "invoice_code": f"INV-{counter['seq']:06d}",
        "customer_id": str(customer["_id"]),
        "customer_name": customer["name"],
        "customer_code": customer["customer_code"],
        "invoice_date": to_utc_day(body.invoice_date),
        "due_date": to_utc_day(body.due_date),
        "total": body.total,
        "paid_amount": 0,
        "status": "unpaid",
        "created_by": user["username"],
        "created_at": now,
        "updated_at": now,
    }
    if body.notes:
        doc["notes"] = body.notes.strip()
    result = await db.invoices.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(
        user["username"], "invoice_created", request,
        detail=f"Membuat piutang {doc['invoice_code']} untuk {doc['customer_name']} sebesar Rp {body.total:,.0f}",
        company_id=user["company_id"], user_id=user["id"],
        entity_type="invoice", entity_id=str(doc["_id"]),
        new_data=serialize_invoice(doc),
    )
    return serialize_invoice(doc)


@api_router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoiceUpdateRequest, request: Request, user: dict = Depends(require_customer_write)):
    existing = await get_tenant_invoice(invoice_id, user["company_id"])
    paid = existing.get("paid_amount", 0)
    updates = {}
    if body.total is not None:
        if body.total < paid:
            raise HTTPException(status_code=400, detail=f"Total tidak boleh kurang dari pembayaran yang sudah masuk (Rp {paid:,.0f}).")
        updates["total"] = body.total
    if body.invoice_date is not None:
        updates["invoice_date"] = to_utc_day(body.invoice_date)
    if body.due_date is not None:
        updates["due_date"] = to_utc_day(body.due_date)
    if body.notes is not None:
        updates["notes"] = body.notes.strip() or None
    if not updates:
        return serialize_invoice(existing)
    new_total = updates.get("total", existing.get("total", 0))
    new_inv_date = updates.get("invoice_date", existing.get("invoice_date"))
    new_due = updates.get("due_date", existing.get("due_date"))
    if new_due < new_inv_date:
        raise HTTPException(status_code=400, detail="Tanggal jatuh tempo tidak boleh sebelum tanggal invoice.")
    updates["status"] = "paid" if paid >= new_total else ("partial" if paid > 0 else "unpaid")
    updates["updated_at"] = datetime.now(timezone.utc)
    old_data = {k: (existing.get(k).isoformat() if isinstance(existing.get(k), datetime) else existing.get(k)) for k in updates if k not in ("updated_at", "status")}
    await db.invoices.update_one({"_id": existing["_id"], "company_id": user["company_id"]}, {"$set": updates})
    updated = await db.invoices.find_one({"_id": existing["_id"]})
    new_data = {k: (updated.get(k).isoformat() if isinstance(updated.get(k), datetime) else updated.get(k)) for k in updates if k not in ("updated_at", "status")}
    await log_activity(
        user["username"], "invoice_updated", request,
        detail=f"Memperbarui piutang {existing['invoice_code']}: {list(new_data.keys())}",
        company_id=user["company_id"], user_id=user["id"],
        entity_type="invoice", entity_id=invoice_id,
        old_data=old_data, new_data=new_data,
    )
    return serialize_invoice(updated)


@api_router.post("/invoices/{invoice_id}/payments", status_code=201)
async def record_payment(invoice_id: str, body: PaymentCreateRequest, request: Request, user: dict = Depends(require_customer_write)):
    invoice = await get_tenant_invoice(invoice_id, user["company_id"])
    paid = invoice.get("paid_amount", 0)
    remaining = invoice.get("total", 0) - paid
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Piutang ini sudah lunas.")
    if body.amount > remaining:
        raise HTTPException(status_code=400, detail=f"Pembayaran melebihi sisa piutang (Rp {remaining:,.0f}).")
    now = datetime.now(timezone.utc)
    payment = {
        "company_id": user["company_id"],
        "invoice_id": invoice_id,
        "customer_id": invoice["customer_id"],
        "amount": body.amount,
        "payment_date": to_utc_day(body.payment_date) if body.payment_date else now,
        "created_by": user["username"],
        "created_at": now,
    }
    if body.method:
        payment["method"] = body.method.strip()
    if body.notes:
        payment["notes"] = body.notes.strip()
    result = await db.payments.insert_one(payment)
    payment["_id"] = result.inserted_id

    new_paid = paid + body.amount
    new_status = "paid" if new_paid >= invoice.get("total", 0) else "partial"
    await db.invoices.update_one(
        {"_id": invoice["_id"], "company_id": user["company_id"]},
        {"$set": {"paid_amount": new_paid, "status": new_status, "updated_at": now}},
    )
    await log_activity(
        user["username"], "payment_recorded", request,
        detail=f"Pembayaran Rp {body.amount:,.0f} untuk {invoice['invoice_code']} ({invoice['customer_name']})",
        company_id=user["company_id"], user_id=user["id"],
        entity_type="payment", entity_id=str(payment["_id"]),
        old_data={"paid_amount": paid, "status": compute_invoice_status(invoice)},
        new_data={"paid_amount": new_paid, "status": new_status},
    )
    return serialize_payment(payment)


@api_router.get("/receivables/summary")
async def receivables_summary(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({"company_id": user["company_id"]}).to_list(50000)
    now = datetime.now(timezone.utc)
    buckets = {"current": 0, "d1_30": 0, "d31_60": 0, "d61_90": 0, "over_90": 0}
    bucket_counts = {"current": 0, "d1_30": 0, "d31_60": 0, "d61_90": 0, "over_90": 0}
    total_outstanding = 0
    total_overdue = 0
    count_overdue = 0
    total_collected = 0
    per_customer = {}
    for inv in invoices:
        paid = inv.get("paid_amount", 0)
        total_collected += paid
        remaining = inv.get("total", 0) - paid
        if remaining <= 0:
            continue
        total_outstanding += remaining
        due = inv.get("due_date")
        if due is not None and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        days = (now - due).days if due else 0
        if days <= 0:
            bucket = "current"
        elif days <= 30:
            bucket = "d1_30"
        elif days <= 60:
            bucket = "d31_60"
        elif days <= 90:
            bucket = "d61_90"
        else:
            bucket = "over_90"
        buckets[bucket] += remaining
        bucket_counts[bucket] += 1
        if days > 0:
            total_overdue += remaining
            count_overdue += 1
        key = inv.get("customer_name", "Tanpa Nama")
        per_customer[key] = per_customer.get(key, 0) + remaining
    top_debtors = [
        {"customer_name": name, "remaining": amount}
        for name, amount in sorted(per_customer.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    return {
        "total_outstanding": total_outstanding,
        "total_overdue": total_overdue,
        "count_overdue": count_overdue,
        "total_collected": total_collected,
        "invoice_count": len(invoices),
        "aging": [{"bucket": k, "amount": buckets[k], "count": bucket_counts[k]} for k in ("current", "d1_30", "d31_60", "d61_90", "over_90")],
        "top_debtors": top_debtors,
    }


# ---------- Security / audit (admin) ----------

@api_router.get("/security/activity")
async def get_activity_logs(admin: dict = Depends(require_admin)):
    logs = await db.activity_logs.find({
        "$or": [
            {"company_id": admin["company_id"]},
            {"company_id": None},
            {"company_id": {"$exists": False}},
        ]
    }).sort("timestamp", -1).limit(200).to_list(200)
    return [
        {
            "id": str(log["_id"]),
            "username": log.get("username"),
            "action": log.get("action"),
            "detail": log.get("detail"),
            "entity_type": log.get("entity_type"),
            "entity_id": log.get("entity_id"),
            "old_data": log.get("old_data"),
            "new_data": log.get("new_data"),
            "ip": log.get("ip"),
            "timestamp": log.get("timestamp").isoformat() if log.get("timestamp") else None,
        }
        for log in logs
    ]


@api_router.get("/")
async def root():
    return {"message": "Rekap Piutang Otomatis API - Tahap 1A", "status": "ok"}


# ---------- Startup: indexes + seed ----------

@app.on_event("startup")
async def startup():
    await db.users.create_index("username", unique=True)
    existing_indexes = await db.users.index_information()
    if "email_1" in existing_indexes and not existing_indexes["email_1"].get("partialFilterExpression"):
        await db.users.drop_index("email_1")
    await db.users.create_index("email", unique=True, partialFilterExpression={"email": {"$type": "string"}})
    await db.login_attempts.create_index("identifier")
    await db.activity_logs.create_index("timestamp")
    await db.activity_logs.create_index("company_id")
    await db.companies.create_index("code", unique=True)
    await db.customers.create_index("company_id")
    await db.customers.create_index([("company_id", 1), ("customer_code", 1)], unique=True)
    await db.customers.create_index([("company_id", 1), ("name", 1)])
    await db.customers.create_index([("company_id", 1), ("phone", 1)])
    await db.invoices.create_index("company_id")
    await db.invoices.create_index([("company_id", 1), ("invoice_code", 1)], unique=True)
    await db.invoices.create_index([("company_id", 1), ("customer_id", 1)])
    await db.invoices.create_index([("company_id", 1), ("due_date", 1)])
    await db.payments.create_index([("company_id", 1), ("invoice_id", 1)])
    await db.payments.create_index([("company_id", 1), ("customer_id", 1)])

    # Tenants (companies)
    company_a = await db.companies.find_one({"code": "DEFAULT"})
    if company_a is None:
        res = await db.companies.insert_one({"name": "PT RekapPiutang Utama", "code": "DEFAULT", "is_default": True, "created_at": datetime.now(timezone.utc)})
        company_a_id = str(res.inserted_id)
        logger.info("Default company (tenant A) seeded")
    else:
        company_a_id = str(company_a["_id"])
    company_b = await db.companies.find_one({"code": "DEMO-B"})
    if company_b is None:
        res = await db.companies.insert_one({"name": "PT Demo Tenant B", "code": "DEMO-B", "is_default": False, "created_at": datetime.now(timezone.utc)})
        company_b_id = str(res.inserted_id)
        logger.info("Demo tenant B seeded")
    else:
        company_b_id = str(company_b["_id"])

    admin_username = os.environ["ADMIN_USERNAME"].strip().lower()
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"username": admin_username})
    if existing is None:
        await db.users.insert_one({
            "username": admin_username,
            "email": admin_email,
            "name": "Administrator",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "company_id": company_a_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": None,
        })
        logger.info("Admin account seeded: %s", admin_username)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"username": admin_username}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin", "is_active": True}})
        logger.info("Admin password re-synced from env")

    if await db.users.find_one({"username": "staff"}) is None:
        await db.users.insert_one({
            "username": "staff",
            "name": "Staf Demo",
            "password_hash": hash_password(os.environ.get("STAFF_PASSWORD", "staff123")),
            "role": "staff",
            "company_id": company_a_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": None,
        })
        logger.info("Demo staff account seeded")

    if await db.users.find_one({"username": "viewer"}) is None:
        await db.users.insert_one({
            "username": "viewer",
            "name": "Viewer Demo",
            "password_hash": hash_password(os.environ.get("VIEWER_PASSWORD", "viewer123")),
            "role": "viewer",
            "company_id": company_a_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": None,
        })
        logger.info("Demo viewer account seeded")

    if await db.users.find_one({"username": "ownerb"}) is None:
        await db.users.insert_one({
            "username": "ownerb",
            "name": "Owner Tenant B",
            "password_hash": hash_password(os.environ.get("OWNERB_PASSWORD", "ownerb123")),
            "role": "owner",
            "company_id": company_b_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": None,
        })
        logger.info("Demo tenant B owner seeded")

    # Backfill legacy users that predate multi-tenant
    await db.users.update_many({"company_id": {"$exists": False}}, {"$set": {"company_id": company_a_id}})

    # Demo customers for Tenant B (tenant-isolation testing)
    if await db.customers.count_documents({"company_id": company_b_id}) == 0:
        now = datetime.now(timezone.utc)
        await db.customers.insert_many([
            {"company_id": company_b_id, "customer_code": "CUS-000001", "name": "CV Mitra Sejahtera B", "phone": "081234567890", "status": "active", "created_by": "seed", "created_at": now, "updated_at": now},
            {"company_id": company_b_id, "customer_code": "CUS-000002", "name": "Toko Berkah Tenant B", "phone": "081298765432", "status": "active", "created_by": "seed", "created_at": now, "updated_at": now},
        ])
        await db.counters.update_one({"_id": f"customer_code:{company_b_id}"}, {"$setOnInsert": {"seq": 2}}, upsert=True)
        logger.info("Demo customers for tenant B seeded")

    # Demo piutang/invoices for Tenant A & B
    if await db.invoices.count_documents({"company_id": company_a_id}) == 0:
        now = datetime.now(timezone.utc)
        cust_a = await db.customers.find({"company_id": company_a_id}).to_list(20)
        by_code = {c["customer_code"]: c for c in cust_a}
        c1 = by_code.get("CUS-000001")
        c2 = by_code.get("CUS-000002")
        if c1 and c2:
            def mk_inv(seq, cust, inv_days_ago, due_days_ago, total, paid):
                inv_date = now - timedelta(days=inv_days_ago)
                due = now - timedelta(days=due_days_ago)
                return {
                    "company_id": company_a_id,
                    "invoice_code": f"INV-{seq:06d}",
                    "customer_id": str(cust["_id"]),
                    "customer_name": cust["name"],
                    "customer_code": cust["customer_code"],
                    "invoice_date": inv_date,
                    "due_date": due,
                    "total": total,
                    "paid_amount": paid,
                    "status": "paid" if paid >= total else ("partial" if paid > 0 else "unpaid"),
                    "created_by": "seed",
                    "created_at": now,
                    "updated_at": now,
                }
            seeds = [
                (mk_inv(1, c2, 40, 10, 5_000_000, 2_000_000), {"amount": 2_000_000, "days_ago": 15, "method": "Transfer Bank"}),
                (mk_inv(2, c1, 70, 40, 3_500_000, 0), None),
                (mk_inv(3, c2, 5, -25, 7_250_000, 0), None),
                (mk_inv(4, c1, 60, 30, 2_000_000, 2_000_000), {"amount": 2_000_000, "days_ago": 32, "method": "Tunai"}),
            ]
            for inv_doc, pay in seeds:
                res = await db.invoices.insert_one(inv_doc)
                if pay:
                    await db.payments.insert_one({
                        "company_id": company_a_id,
                        "invoice_id": str(res.inserted_id),
                        "customer_id": inv_doc["customer_id"],
                        "amount": pay["amount"],
                        "payment_date": now - timedelta(days=pay["days_ago"]),
                        "method": pay["method"],
                        "created_by": "seed",
                        "created_at": now,
                    })
            await db.counters.update_one({"_id": f"invoice_code:{company_a_id}"}, {"$setOnInsert": {"seq": 4}}, upsert=True)
            logger.info("Demo invoices for tenant A seeded")
    if await db.invoices.count_documents({"company_id": company_b_id}) == 0:
        cust_b = await db.customers.find_one({"company_id": company_b_id, "customer_code": "CUS-000001"})
        if cust_b:
            now = datetime.now(timezone.utc)
            await db.invoices.insert_one({
                "company_id": company_b_id,
                "invoice_code": "INV-000001",
                "customer_id": str(cust_b["_id"]),
                "customer_name": cust_b["name"],
                "customer_code": cust_b["customer_code"],
                "invoice_date": now - timedelta(days=50),
                "due_date": now - timedelta(days=20),
                "total": 9_900_000,
                "paid_amount": 0,
                "status": "unpaid",
                "created_by": "seed",
                "created_at": now,
                "updated_at": now,
            })
            await db.counters.update_one({"_id": f"invoice_code:{company_b_id}"}, {"$setOnInsert": {"seq": 1}}, upsert=True)
            logger.info("Demo invoice for tenant B seeded")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
