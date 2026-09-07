import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Lock, Eye, EyeOff, Loader2, UserPlus, FileCheck2, AlertCircle, ArrowLeft, AtSign, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (form.password !== form.confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setLoading(true);
    try {
      const user = await register({
        name: form.name,
        username: form.username,
        password: form.password,
        email: form.email || null,
      });
      toast.success(`Akun berhasil dibuat. Selamat datang, ${user.name}!`);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <FileCheck2 className="h-4 w-4 text-slate-950" />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">RekapPiutang.id</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Buat Akun Baru</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Akun baru otomatis mendapat peran <span className="font-semibold text-sky-600 dark:text-sky-400">Staff</span>. Hubungi admin untuk peningkatan peran.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-testid="register-form">
          {error && (
            <div data-testid="register-error-message" className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="reg-name" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Nama Lengkap</Label>
            <div className="relative">
              <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input id="reg-name" data-testid="register-name-input" value={form.name} onChange={set("name")} placeholder="mis. Budi Santoso" required className="pl-10 h-11 rounded-lg" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-username" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input id="reg-username" data-testid="register-username-input" value={form.username} onChange={set("username")} placeholder="Min. 3 karakter, tanpa spasi" autoComplete="username" required minLength={3} className="pl-10 h-11 rounded-lg" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Email (opsional)</Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input id="reg-email" data-testid="register-email-input" type="email" value={form.email} onChange={set("email")} placeholder="nama@perusahaan.id" className="pl-10 h-11 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reg-password" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Kata Sandi</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="reg-password" data-testid="register-password-input" type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="Min. 6 karakter" autoComplete="new-password" required minLength={6} className="pl-10 h-11 rounded-lg" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Konfirmasi</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="reg-confirm" data-testid="register-confirm-password-input" type={showPassword ? "text" : "password"} value={form.confirm} onChange={set("confirm")} placeholder="Ulangi kata sandi" autoComplete="new-password" required minLength={6} className="pl-10 h-11 rounded-lg" />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
            <button type="button" data-testid="register-toggle-password-button" onClick={() => setShowPassword((v) => !v)} className="inline-flex items-center gap-1.5 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            </button>
          </label>
          <Button type="submit" data-testid="register-submit-button" disabled={loading} className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white font-semibold text-sm transition-all active:scale-[0.98]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {loading ? "Membuat akun..." : "Buat Akun"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Sudah punya akun?{" "}
          <Link to="/login" data-testid="back-to-login-link" className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Masuk di sini
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
