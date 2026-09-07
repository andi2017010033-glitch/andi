from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import bcrypt
import jwt
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from pymongo import ReturnDocument
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

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
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
        "last_login_at": doc.get("last_login_at"),
    }


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def log_activity(username: str, action: str, request: Request, detail: Optional[str] = None):
    await db.activity_logs.insert_one({
        "username": username,
        "action": action,
        "detail": detail,
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
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Akses ditolak. Hanya admin yang diizinkan.")
    return user


# ---------- Schemas ----------

class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    email: Optional[str] = None
    password: str = Field(min_length=6)
    role: str = Field(default="staff", pattern="^(admin|staff)$")


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern="^(admin|staff)$")
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6)


# ---------- Auth endpoints ----------

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

    await log_activity(username, "login_success", request)
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
    users = await db.users.find({}).sort("created_at", 1).to_list(500)
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
    if str(target["_id"]) == admin["id"] and updates.get("role") == "staff":
        raise HTTPException(status_code=400, detail="Tidak dapat menurunkan peran akun sendiri.")

    if updates:
        await db.users.update_one({"_id": target["_id"]}, {"$set": updates})
        await log_activity(admin["username"], "user_updated", request, f"Memperbarui pengguna '{target['username']}': {list(updates.keys())}")
    updated = await db.users.find_one({"_id": target["_id"]})
    return serialize_user(updated)


# ---------- Security / audit (admin) ----------

@api_router.get("/security/activity")
async def get_activity_logs(admin: dict = Depends(require_admin)):
    logs = await db.activity_logs.find({}).sort("timestamp", -1).limit(100).to_list(100)
    return [
        {
            "id": str(log["_id"]),
            "username": log.get("username"),
            "action": log.get("action"),
            "detail": log.get("detail"),
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
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": None,
        })
        logger.info("Admin account seeded: %s", admin_username)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"username": admin_username}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin", "is_active": True}})
        logger.info("Admin password re-synced from env")

    staff = await db.users.find_one({"username": "staff"})
    if staff is None:
        await db.users.insert_one({
            "username": "staff",
            "name": "Staf Demo",
            "password_hash": hash_password(os.environ.get("STAFF_PASSWORD", "staff123")),
            "role": "staff",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": None,
        })
        logger.info("Demo staff account seeded")


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
