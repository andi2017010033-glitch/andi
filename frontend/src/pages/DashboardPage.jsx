import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, KeyRound, Globe, Users, Receipt, TrendingUp, Loader2 } from "lucide-react";
import { api } from "@/context/AuthContext";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [receivables, setReceivables] = useState(null);

  useEffect(() => {
    api.get("/auth/session").then(({ data }) => setSession(data)).catch(() => setSession(null));
    api.get("/receivables/summary").then(({ data }) => setReceivables(data)).catch(() => setReceivables(null));
  }, []);

  const rupiah = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Selamat datang, {user.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sistem aktif. Pantau piutang, pelanggan, dan keamanan dari sini.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
          data-testid="security-status-card"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Status Keamanan Sesi
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Aktif
            </span>
          </div>
          {!session ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Memuat info sesi...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Metode Enkripsi</p>
                <p className="mt-1 font-mono font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emerald-500" /> JWT · {session.algorithm}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Alamat IP Sesi</p>
                <p className="mt-1 font-mono font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-sky-500" /> {session.ip}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Token Kedaluwarsa</p>
                <p className="mt-1 font-mono text-sm text-slate-700 dark:text-slate-300">
                  {new Date(session.expires_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Tingkat Keamanan</p>
                <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{session.security_level} — Brute-force Protection Aktif</p>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-6 flex flex-col justify-between"
          data-testid="piutang-preview-card"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Total Piutang Berjalan</p>
            <p className="mt-2 text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100" data-testid="dashboard-total-piutang">
              {receivables ? rupiah(receivables.total_outstanding) : "..."}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {receivables ? (
                <>Terlambat: <span className="font-semibold text-red-500">{rupiah(receivables.total_overdue)}</span> ({receivables.count_overdue} invoice) · Terbayar: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{rupiah(receivables.total_collected)}</span></>
              ) : "Memuat ringkasan piutang..."}
            </p>
          </div>
          <a href="/piutang" data-testid="dashboard-goto-piutang" className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
            <Receipt className="h-4 w-4" /> Buka Daftar Piutang
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-6"
      >
        {[
          { icon: Users, title: "Manajemen Peran", desc: "Admin & Staff dengan kontrol akses berbasis peran (RBAC).", active: true },
          { icon: ShieldCheck, title: "Audit Trail", desc: "Semua aktivitas login & perubahan data tercatat otomatis.", active: true },
          { icon: TrendingUp, title: "Rekap Otomatis", desc: "Agenda umur piutang & pengingat jatuh tempo — Tahap 2.", active: false },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:-translate-y-0.5 transition-transform">
            <f.icon className={`h-5 w-5 ${f.active ? "text-emerald-500" : "text-slate-400"}`} />
            <h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{f.title}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
