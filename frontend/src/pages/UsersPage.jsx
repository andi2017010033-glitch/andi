import { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UserPlus, Loader2, ShieldCheck, UserCog, Power, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";

const EMPTY_FORM = { username: "", name: "", email: "", password: "", role: "staff" };

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") loadUsers();
  }, [user, loadUsers]);

  if (user && !["owner", "admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      await api.post("/users", { ...form, email: form.email || null });
      toast.success(`Pengguna "${form.username}" berhasil dibuat.`);
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      loadUsers();
    } catch (e2) {
      setFormError(formatApiErrorDetail(e2.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
      toast.success(`Akun "${u.username}" ${u.is_active ? "dinonaktifkan" : "diaktifkan"}.`);
      loadUsers();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const changeRole = async (u, role) => {
    try {
      await api.patch(`/users/${u.id}`, { role });
      toast.success(`Peran "${u.username}" diubah menjadi ${role}.`);
      loadUsers();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="users-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Pengguna &amp; Peran</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kelola akun dan hak akses sistem.</p>
        </div>
        <Button data-testid="add-user-button" onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
          <UserPlus className="h-4 w-4" /> Tambah Pengguna
        </Button>
      </motion.div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          data-testid="user-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari username atau nama..."
          className="pl-10 bg-white dark:bg-slate-900"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <Table data-testid="user-management-table">
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
              <TableHead className="pl-5">Pengguna</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Login Terakhir</TableHead>
              <TableHead className="pr-5 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" /> Memuat data...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-400" data-testid="users-empty-state">Tidak ada pengguna ditemukan.</TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.username}`}>
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-200">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{u.name}</p>
                        <p className="text-xs text-slate-500 font-mono">@{u.username}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${["owner", "admin"].includes(u.role) ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300"}`}>
                      {["owner", "admin"].includes(u.role) ? <ShieldCheck className="h-3 w-3" /> : <UserCog className="h-3 w-3" />}
                      {{ owner: "Owner", admin: "Admin", staff: "Staff", viewer: "Viewer" }[u.role] || u.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${u.is_active ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400"}`}>
                      {u.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "Belum pernah"}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex items-center justify-end gap-2">
                      <Select value={u.role} onValueChange={(role) => changeRole(u, role)} disabled={u.id === user.id}>
                        <SelectTrigger data-testid={`user-role-select-${u.username}`} className="h-8 w-28 text-xs bg-white dark:bg-slate-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`user-toggle-active-${u.username}`}
                        disabled={u.id === user.id}
                        onClick={() => toggleActive(u)}
                        className="h-8 text-xs"
                      >
                        <Power className="h-3.5 w-3.5" />
                        {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-md" data-testid="add-user-dialog">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-slate-100">Tambah Pengguna Baru</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">Isi data akun pengguna baru beserta perannya.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div data-testid="add-user-error" className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">{formError}</div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" data-testid="add-user-username-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} placeholder="mis. budi.finance" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Nama Lengkap</Label>
              <Input id="new-name" data-testid="add-user-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="mis. Budi Santoso" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email (opsional)</Label>
              <Input id="new-email" data-testid="add-user-email-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@perusahaan.id" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Kata Sandi</Label>
                <Input id="new-password" data-testid="add-user-password-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} placeholder="Min. 6 karakter" />
              </div>
              <div className="space-y-1.5">
                <Label>Peran</Label>
                <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                  <SelectTrigger data-testid="add-user-role-select" className="bg-white dark:bg-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="add-user-cancel-button">Batal</Button>
              <Button type="submit" disabled={submitting} data-testid="add-user-submit-button" className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
