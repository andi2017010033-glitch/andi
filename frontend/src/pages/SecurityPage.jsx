import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, LogIn, LogOut, AlertTriangle, UserPlus, UserCog, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, useAuth } from "@/context/AuthContext";

const ACTION_META = {
  login_success: { label: "Login Berhasil", icon: LogIn, cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50" },
  login_failed: { label: "Login Gagal", icon: AlertTriangle, cls: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50" },
  login_blocked: { label: "Login Diblokir", icon: ShieldCheck, cls: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50" },
  logout: { label: "Keluar", icon: LogOut, cls: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800" },
  user_created: { label: "Pengguna Dibuat", icon: UserPlus, cls: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50" },
  user_updated: { label: "Pengguna Diperbarui", icon: UserCog, cls: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50" },
};

export default function SecurityPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.role === "admin";

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/security/activity");
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadLogs();
    else setLoading(false);
  }, [isAdmin, loadLogs]);

  return (
    <div className="space-y-6" data-testid="security-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Keamanan &amp; Sesi</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Log audit aktivitas dan konfigurasi keamanan sistem.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={loadLogs} data-testid="refresh-activity-button">
            <RefreshCw className="h-4 w-4" /> Muat Ulang
          </Button>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Algoritma Token", value: "HS256 (HMAC-SHA256)" },
          { label: "Masa Berlaku Akses", value: "15 menit + refresh 7 hari" },
          { label: "Proteksi Brute-force", value: "Kunci 15 mnt / 5x gagal" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-2 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      {!isAdmin ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-700 dark:text-amber-300" data-testid="security-admin-only-notice">
          Log audit lengkap hanya dapat diakses oleh Admin. Sesi Anda tetap terlindungi token JWT.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <Table data-testid="activity-log-table">
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="pl-5">Aktivitas</TableHead>
                <TableHead>Pengguna</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="pr-5">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" /> Memuat log...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-400" data-testid="activity-empty-state">Belum ada aktivitas tercatat.</TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const meta = ACTION_META[log.action] || { label: log.action, icon: ShieldCheck, cls: "text-slate-500 bg-slate-100 dark:bg-slate-800" };
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="pl-5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${meta.cls}`}>
                          <meta.icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800 dark:text-slate-200 font-mono">@{log.username}</TableCell>
                      <TableCell className="text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">{log.detail || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-500 dark:text-slate-400">{log.ip}</TableCell>
                      <TableCell className="pr-5 text-xs font-mono text-slate-500 dark:text-slate-400">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
