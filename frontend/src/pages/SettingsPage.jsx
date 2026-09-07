import { motion } from "framer-motion";
import { Settings, Database, ShieldCheck, GitBranch } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl" data-testid="settings-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Pengaturan Sistem</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Informasi fondasi sistem Tahap 1A.</p>
      </motion.div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
        {[
          { icon: GitBranch, label: "Versi Fondasi", value: "Tahap 1A — Foundation, Database, Login & Security" },
          { icon: Database, label: "Basis Data", value: "MongoDB (koleksi: users, login_attempts, activity_logs)" },
          { icon: ShieldCheck, label: "Autentikasi", value: "JWT HS256 · bcrypt hashing · httpOnly cookie + Bearer token" },
          { icon: Settings, label: "Akun Aktif Anda", value: `${user.name} (@${user.username}) — ${user.role === "admin" ? "Admin" : "Staff"}` },
        ].map((row) => (
          <div key={row.label} className="flex items-start gap-4 p-5">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
              <row.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{row.label}</p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200 break-words">{row.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Pengaturan lanjutan (profil perusahaan, format nomor faktur, preferensi pengingat jatuh tempo) akan tersedia bersama modul piutang pada Tahap 2.
      </div>
    </div>
  );
}
