import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Lock, Eye, EyeOff, Loader2, ShieldCheck, KeyRound, FileCheck2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";

const HERO_BG = "https://images.unsplash.com/photo-1460925895917-afdab827c52f?crop=entropy&cs=srgb&fm=jpg&q=85";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      toast.success(`Selamat datang, ${user.name}!`);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <img src={HERO_BG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-emerald-950/60" />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <FileCheck2 className="h-5 w-5 text-slate-950" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">RekapPiutang.id</span>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400 mb-4">Tahap 1A — Fondasi &amp; Keamanan</p>
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight text-white">
              Rekap Piutang Otomatis untuk UMKM &amp; Enterprise
            </h1>
            <p className="mt-5 text-base xl:text-lg text-slate-300 leading-relaxed">
              Kelola penagihan, pantau umur piutang, dan percepat arus kas usaha Anda dengan keamanan enkripsi JWT standar perbankan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {["JWT Auth Verified", "Role-Based Security", "Audited Activity Log"].map((badge) => (
                <span key={badge} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> {badge}
                </span>
              ))}
            </div>
          </motion.div>
          <p className="text-xs text-slate-500 font-mono">Enkripsi HS256 · Brute-force Protection · Audit Trail Aktif</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-slate-950">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center">
              <FileCheck2 className="h-4 w-4 text-slate-950" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">RekapPiutang.id</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Masuk ke Akun Anda</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Gunakan username dan kata sandi yang terdaftar.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-testid="login-form">
            {error && (
              <div data-testid="login-error-message" className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="username"
                  data-testid="login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  autoComplete="username"
                  required
                  className="pl-10 h-11 rounded-lg"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Kata Sandi</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  autoComplete="current-password"
                  required
                  className="pl-10 pr-11 h-11 rounded-lg"
                />
                <button
                  type="button"
                  data-testid="login-toggle-password-button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label="Tampilkan kata sandi"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-all active:scale-[0.98] hover:text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {loading ? "Memverifikasi..." : "Masuk"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            Belum punya akun?{" "}
            <a href="/register" data-testid="goto-register-link" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
              Buat akun
            </a>
          </p>

          <div className="mt-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Sesi dilindungi token JWT berumur 15 menit dengan pembaruan otomatis. Percobaan masuk gagal berulang akan mengunci akses sementara.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
