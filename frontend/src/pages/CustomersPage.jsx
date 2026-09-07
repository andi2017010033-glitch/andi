import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  UserPlus, Search, Loader2, AlertCircle, RefreshCw, Eye, Pencil, Ban,
  ChevronLeft, ChevronRight, Contact, Phone, Mail, MapPin, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";

const SORT_OPTIONS = [
  { value: "name_asc", label: "Nama A-Z" },
  { value: "name_desc", label: "Nama Z-A" },
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Tidak Aktif" },
];

const EMPTY_FORM = { name: "", phone: "", email: "", address: "", notes: "", status: "active" };
const rupiah = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—");

function StatusBadge({ status }) {
  return (
    <span
      data-testid={`customer-status-badge-${status}`}
      className={`inline-block text-xs font-semibold rounded-full px-2.5 py-1 ${
        status === "active"
          ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
      }`}
    >
      {status === "active" ? "Aktif" : "Tidak Aktif"}
    </span>
  );
}

function CustomerFormDialog({ open, onOpenChange, initial, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (open) {
      setFormError("");
      setForm(
        isEdit
          ? {
              name: initial.name || "",
              phone: initial.phone || "",
              email: initial.email || "",
              address: initial.address || "",
              notes: initial.notes || "",
              status: initial.status || "active",
            }
          : EMPTY_FORM
      );
    }
  }, [open, initial, isEdit]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Nama pelanggan wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };
      const { data } = isEdit
        ? await api.patch(`/customers/${initial.id}`, payload)
        : await api.post("/customers", payload);
      toast.success(isEdit ? `Pelanggan "${data.name}" berhasil diperbarui.` : `Pelanggan "${data.name}" (${data.customer_code}) berhasil ditambahkan.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setFormError(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="customer-form-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">{isEdit ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            {isEdit ? `Kode pelanggan ${initial.customer_code} tidak dapat diubah.` : "Kode pelanggan dibuat otomatis (mis. CUS-000001)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <div data-testid="customer-form-error" className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Kode Pelanggan</Label>
              <Input value={initial.customer_code} disabled className="font-mono bg-slate-50 dark:bg-slate-800" data-testid="customer-code-readonly" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Nama Pelanggan <span className="text-red-500">*</span></Label>
            <Input id="cust-name" data-testid="customer-name-input" value={form.name} onChange={set("name")} required maxLength={120} placeholder="mis. PT Sumber Makmur" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">Nomor Telepon</Label>
              <Input id="cust-phone" data-testid="customer-phone-input" value={form.phone} onChange={set("phone")} maxLength={25} placeholder="mis. 081234567890" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input id="cust-email" data-testid="customer-email-input" type="email" value={form.email} onChange={set("email")} placeholder="nama@perusahaan.id" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-address">Alamat</Label>
            <Textarea id="cust-address" data-testid="customer-address-input" value={form.address} onChange={set("address")} maxLength={500} rows={2} placeholder="Alamat lengkap pelanggan" className="bg-white dark:bg-slate-900" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">Catatan</Label>
            <Textarea id="cust-notes" data-testid="customer-notes-input" value={form.notes} onChange={set("notes")} maxLength={1000} rows={2} placeholder="Catatan internal (opsional)" className="bg-white dark:bg-slate-900" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="customer-status-select" className="bg-white dark:bg-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Tidak Aktif</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="customer-form-cancel-button">Batal</Button>
            <Button type="submit" disabled={submitting} data-testid="customer-form-submit-button" className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailDialog({ customerId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerId) return;
    setDetail(null);
    setSummary(null);
    setError("");
    Promise.all([api.get(`/customers/${customerId}`), api.get(`/customers/${customerId}/summary`)])
      .then(([d, s]) => {
        setDetail(d.data);
        setSummary(s.data);
      })
      .catch((e) => setError(formatApiErrorDetail(e.response?.data?.detail)));
  }, [customerId]);

  return (
    <Dialog open={Boolean(customerId)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="customer-detail-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">Detail Pelanggan</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">Informasi lengkap dan ringkasan transaksi.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300" data-testid="customer-detail-error">{error}</div>
        ) : !detail ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100" data-testid="customer-detail-name">{detail.name}</p>
                <p className="text-sm font-mono text-slate-500 dark:text-slate-400" data-testid="customer-detail-code">{detail.customer_code}</p>
              </div>
              <StatusBadge status={detail.status} />
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {[
                { icon: Phone, label: "Telepon", value: detail.phone || "—" },
                { icon: Mail, label: "Email", value: detail.email || "—" },
                { icon: MapPin, label: "Alamat", value: detail.address || "—" },
                { icon: StickyNote, label: "Catatan", value: detail.notes || "—" },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-3 px-4 py-3">
                  <row.icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{row.label}</p>
                    <p className="text-slate-800 dark:text-slate-200 break-words">{row.value}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <span>Dibuat: <span className="font-mono">{fmtDate(detail.created_at)}</span></span>
                <span>Diperbarui: <span className="font-mono">{fmtDate(detail.updated_at)}</span></span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-3">Ringkasan Transaksi</p>
              <div className="grid grid-cols-3 gap-3" data-testid="customer-detail-summary">
                {[
                  { label: "Total Invoice", value: summary ? rupiah(summary.total_invoice) : "...", count: summary ? `${summary.invoice_count} invoice` : "" },
                  { label: "Total Piutang", value: summary ? rupiah(summary.total_piutang) : "...", accent: true },
                  { label: "Pembayaran", value: summary ? rupiah(summary.total_payment) : "..." },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                    <p className={`mt-1 font-mono text-sm font-semibold ${c.accent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200"}`}>{c.value}</p>
                    {c.count && <p className="text-[10px] text-slate-400 mt-0.5">{c.count}</p>}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Nilai dihitung dari modul Invoice & Pembayaran (tersedia pada tahap berikutnya).</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CustomersPage() {
  const { user } = useAuth();
  const canWrite = ["owner", "admin", "staff"].includes(user.role);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [formDialog, setFormDialog] = useState({ open: false, initial: null });
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: res } = await api.get("/customers", { params: { search, status, sort, page, limit: 10 } });
      setData(res);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [search, status, sort, page]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleDeactivate = async () => {
    if (!deactivateTarget || deactivating) return;
    setDeactivating(true);
    try {
      await api.post(`/customers/${deactivateTarget.id}/deactivate`);
      toast.success(`Pelanggan "${deactivateTarget.name}" dinonaktifkan.`);
      setDeactivateTarget(null);
      loadCustomers();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="pelanggan-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Pelanggan</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kelola data pelanggan perusahaan Anda. Kode pelanggan dibuat otomatis.</p>
        </div>
        {canWrite && (
          <Button data-testid="add-customer-button" onClick={() => setFormDialog({ open: true, initial: null })} className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
            <UserPlus className="h-4 w-4" /> Tambah Pelanggan
          </Button>
        )}
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            data-testid="customer-search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama, kode, telepon, atau email..."
            className="pl-10 bg-white dark:bg-slate-900"
          />
        </div>
        <div className="flex gap-3">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger data-testid="customer-status-filter" className="w-40 bg-white dark:bg-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
            <SelectTrigger data-testid="customer-sort-select" className="w-36 bg-white dark:bg-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && !loading ? (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-8 text-center" data-testid="customer-error-state">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadCustomers} data-testid="customer-retry-button">
            <RefreshCw className="h-4 w-4" /> Coba Lagi
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <Table data-testid="customer-table">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="pl-5">Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} data-testid="customer-skeleton-row">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j} className={j === 0 ? "pl-5" : j === 5 ? "pr-5" : ""}><Skeleton className="h-4 w-full max-w-[120px]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-16 text-center" data-testid="customer-empty-state">
                      <Contact className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {search || status !== "all" ? "Tidak ada pelanggan yang cocok dengan pencarian/filter." : "Belum ada pelanggan. Tambahkan pelanggan pertama Anda."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((c) => (
                    <TableRow key={c.id} data-testid={`customer-row-${c.customer_code}`} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                      <TableCell className="pl-5 font-mono text-xs text-slate-500 dark:text-slate-400">{c.customer_code}</TableCell>
                      <TableCell className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300 font-mono">{c.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{c.email || "—"}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" data-testid={`customer-detail-${c.customer_code}`} onClick={() => setDetailId(c.id)} className="h-8 w-8 p-0" title="Detail">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canWrite && (
                            <>
                              <Button variant="ghost" size="sm" data-testid={`customer-edit-${c.customer_code}`} onClick={() => setFormDialog({ open: true, initial: c })} className="h-8 w-8 p-0" title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {c.status === "active" && (
                                <Button variant="ghost" size="sm" data-testid={`customer-deactivate-${c.customer_code}`} onClick={() => setDeactivateTarget(c)} className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" title="Nonaktifkan">
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3" data-testid="customer-cards">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : data.items.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center" data-testid="customer-empty-state-mobile">
                <Contact className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada pelanggan.</p>
              </div>
            ) : (
              data.items.map((c) => (
                <div key={c.id} data-testid={`customer-card-${c.customer_code}`} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4" onClick={() => setDetailId(c.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                      <p className="text-xs font-mono text-slate-500">{c.customer_code}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{c.phone || "—"}</p>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" data-testid={`customer-detail-m-${c.customer_code}`} onClick={() => setDetailId(c.id)} className="h-8 w-8 p-0"><Eye className="h-4 w-4" /></Button>
                      {canWrite && (
                        <>
                          <Button variant="ghost" size="sm" data-testid={`customer-edit-m-${c.customer_code}`} onClick={() => setFormDialog({ open: true, initial: c })} className="h-8 w-8 p-0"><Pencil className="h-4 w-4" /></Button>
                          {c.status === "active" && (
                            <Button variant="ghost" size="sm" data-testid={`customer-deactivate-m-${c.customer_code}`} onClick={() => setDeactivateTarget(c)} className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"><Ban className="h-4 w-4" /></Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between" data-testid="customer-pagination">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total <span className="font-semibold font-mono">{data.total}</span> pelanggan · Halaman <span className="font-mono">{page}</span> dari <span className="font-mono">{data.pages}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" data-testid="pagination-prev-button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Sebelumnya
              </Button>
              <Button variant="outline" size="sm" data-testid="pagination-next-button" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>
                Berikutnya <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <CustomerFormDialog
        open={formDialog.open}
        onOpenChange={(v) => setFormDialog({ open: v, initial: null })}
        initial={formDialog.initial}
        onSaved={loadCustomers}
      />

      <AlertDialog open={Boolean(deactivateTarget)} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <AlertDialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800" data-testid="deactivate-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-slate-100">Nonaktifkan Pelanggan?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              Apakah Anda yakin ingin menonaktifkan pelanggan <span className="font-semibold text-slate-800 dark:text-slate-200">{deactivateTarget?.name}</span> ({deactivateTarget?.customer_code})?
              Data tetap tersimpan di database dan histori transaksi tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="deactivate-cancel-button">Batal</AlertDialogCancel>
            <AlertDialogAction
              data-testid="deactivate-confirm-button"
              onClick={handleDeactivate}
              disabled={deactivating}
              className="bg-red-600 hover:bg-red-700 text-white hover:text-white"
            >
              {deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Ya, Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerDetailDialog customerId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
