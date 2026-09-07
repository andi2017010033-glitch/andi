import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Receipt, Users, ShieldCheck, Settings, LogOut, Moon, Sun, FileCheck2, Timer } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";

function decodeTokenExp() {
  try {
    const token = localStorage.getItem("rp_access_token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1])).exp * 1000;
  } catch {
    return null;
  }
}

function SessionTimer() {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    const tick = () => {
      const exp = decodeTokenExp();
      setRemaining(exp ? Math.max(0, exp - Date.now()) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (remaining === null) return null;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const low = remaining < 120000;
  return (
    <span
      data-testid="session-expiry-timer"
      className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono font-medium ${
        low
          ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
          : "border-sky-400/30 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400"
      }`}
    >
      <Timer className="h-3.5 w-3.5" />
      Sesi {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

const NAV_ITEMS = [
  { label: "Ringkasan", icon: LayoutDashboard, path: "/dashboard", testId: "nav-dashboard" },
  { label: "Daftar Piutang", icon: Receipt, path: "/piutang", testId: "nav-piutang", disabled: true },
  { label: "Pengguna & Peran", icon: Users, path: "/users", testId: "nav-users", adminOnly: true },
  { label: "Keamanan & Sesi", icon: ShieldCheck, path: "/security", testId: "nav-security" },
  { label: "Pengaturan", icon: Settings, path: "/settings", testId: "nav-settings" },
];

const PAGE_TITLES = {
  "/dashboard": "Ringkasan",
  "/users": "Pengguna & Peran",
  "/security": "Keamanan & Sesi",
  "/settings": "Pengaturan",
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <aside data-testid="dashboard-sidebar" className="w-64 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl sticky top-0 h-screen">
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
              <FileCheck2 className="h-4 w-4 text-slate-950" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">RekapPiutang.id</p>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Tahap 1A Foundation</span>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin").map((item) =>
            item.disabled ? (
              <div
                key={item.path}
                data-testid={item.testId}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 dark:text-slate-600 cursor-not-allowed"
                title="Modul Tahap 2"
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">Tahap 2</span>
              </div>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                data-testid={item.testId}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-200 shrink-0">
              {user.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
              <span
                data-testid="user-role-badge"
                className={`inline-block text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${
                  user.role === "admin"
                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                    : "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300"
                }`}
              >
                {user.role === "admin" ? "Admin" : "Staff"}
              </span>
            </div>
          </div>
          <button
            data-testid="logout-button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between gap-4 px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 dark:text-slate-500">RekapPiutang</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{PAGE_TITLES[location.pathname] || "Dashboard"}</span>
          </div>
          <div className="flex items-center gap-3">
            <SessionTimer />
            <span data-testid="security-status-badge" className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              JWT Aktif
            </span>
            <button
              data-testid="theme-toggle-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Ganti tema"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 sm:p-8 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
