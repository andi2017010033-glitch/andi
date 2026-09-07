import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Loader2, AlertCircle, RefreshCw, Eye, Receipt,
  ChevronLeft, ChevronRight, Banknote, CalendarClock, TrendingUp, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";

const rupiah = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_META = {
  paid: { label: "Lunas", cls: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400" },
  partial: { label: "Sebagian", cls: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400" },
  unpaid: { label: "Belum Bayar", cls: "bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400" },
  overdue: { label: "Terlambat", cls: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400" },
};

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "unpaid", label: "Belum Bayar" },
  { value: "partial", label: "Sebagian" },
  { value: "overdue", label: "Terlambat" },
  { value: "paid", label: "Lunas" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "due_asc", label: "Jatuh Tempo Terdekat" },
  { value: "due_desc", label: "Jatuh Tempo Terjauh" },
  { value: "amount_desc", label: "Nominal Terbesar" },
  { value: "amount_asc", label: "Nominal Terkecil" },
];

const AGING_LABELS = { current: "Belum Jatuh Tempo", d1_30: "1-30 hari", d31_60: "31-60 hari", d61_90: "61-90 hari", over_90: ">90 hari" };

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unpaid;
  return <span data-testid={`invoice-status-badge-${status}`} className={`inline-block text-xs font-semibold rounded-full px-2.5 py-1 ${meta.cls}`}>{meta.label}</span>;
}

function PaymentDialog({ invoice, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: "", payment_date: todayStr(), method: "Transfer Bank", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (invoice) {
      setFormError("");
      setForm({ amount: String(invoice.remaining), payment_date: todayStr(), method: "Transfer Bank", notes: "" });
    }
  }, [invoice]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { setFormError("Nominal pembayaran harus lebih dari 0."); return; }
    if (amount > invoice.remaining) { setFormError(`Melebihi sisa piutang (${rupiah(invoice.remaining)}).`); return; }
    setSubmitting(true);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, {
        amount,
        payment_date: form.payment_date || null,
        method: form.method,
        notes: form.notes.trim() || null,
      });
      toast.success(`Pembayaran ${rupiah(amount)} untuk ${invoice.invoice_code} tercatat.`);
      onClose();
      onSaved();
    } catch (err) {
      setFormError(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-md" data-testid="payment-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">Catat Pembayaran</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            {invoice && `${invoice.invoice_code} · ${invoice.customer_name} · Sisa: `}
            {invoice && <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{rupiah(invoice.remaining)}</span>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <div data-testid="payment-form-error" className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Nominal Pembayaran (Rp) <span className="text-red-500">*</span></Label>
            <Input id="pay-amount" data-testid="payment-amount-input" type="number" min="1" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Tanggal Bayar</Label>
              <Input id="pay-date" data-testid="payment-date-input" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger data-testid="payment-method-select" className="bg-white dark:bg-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  {["Transfer Bank", "Tunai", "QRIS", "Lainnya"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Catatan</Label>
            <Input id="pay-notes" data-testid="payment-notes-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} placeholder="Opsional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="payment-cancel-button">Batal</Button>
            <Button type="submit" disabled={submitting} data-testid="payment-submit-button" className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              {submitting ? "Menyimpan..." : "Catat Pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailDialog({ invoiceId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoiceId) return;
    setData(null);
    setError("");
    api.get(`/invoices/${invoiceId}`)
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(formatApiErrorDetail(e.response?.data?.detail)));
  }, [invoiceId]);

  const inv = data?.invoice;
  return (
    <Dialog open={Boolean(invoiceId)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="invoice-detail-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">Detail Piutang</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">Informasi piutang dan riwayat pembayaran.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300" data-testid="invoice-detail-error">{error}</div>
        ) : !inv ? (
          <div className="space-y-3 py-2"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100" data-testid="invoice-detail-code">{inv.invoice_code}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{inv.customer_name} <span className="font-mono text-xs">({inv.customer_code})</span></p>
              </div>
              <StatusBadge status={inv.status} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total", value: inv.total },
                { label: "Terbayar", value: inv.paid_amount },
                { label: "Sisa", value: inv.remaining, accent: true },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                  <p className={`mt-1 font-mono text-sm font-semibold ${c.accent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200"}`}>{rupiah(c.value)}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
              <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Invoice: <span className="font-mono">{fmtDate(inv.invoice_date)}</span></span>
              <span>Jatuh tempo: <span className="font-mono">{fmtDate(inv.due_date)}</span></span>
            </div>
            {inv.notes && <p className="text-sm text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-4 py-3">{inv.notes}</p>}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-2">Riwayat Pembayaran</p>
              {data.payments.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3" data-testid="payment-history-empty">Belum ada pembayaran tercatat.</p>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800" data-testid="payment-history-list">
                  {data.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div>
                        <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">{rupiah(p.amount)}</p>
                        <p className="text-[11px] text-slate-400">{p.method || "—"} · oleh {p.created_by}</p>
                      </div>
                      <span className="text-xs font-mono text-slate-500">{fmtDate(p.payment_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const canWrite = ["owner", "admin", "staff"].includes(user.role);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const loadSummary = useCallback(async () => {
    try {
      const { data: s } = await api.get("/receivables/summary");
      setSummary(s);
    } catch { /* kartu ringkasan opsional */ }
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: res } = await api.get("/invoices", { params: { search, status, sort, page, limit: 10, receivable: true } });
      setData(res);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [search, status, sort, page]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const reloadAll = () => { loadInvoices(); loadSummary(); };

  return (
    <div className="space-y-6" data-testid="piutang-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Daftar Piutang</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kelola piutang usaha, pantau jatuh tempo, dan catat pembayaran.</p>
        </div>
        {canWrite && (
          <a href="/invoice" data-testid="goto-invoice-page-button" className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 h-9 text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Buat Invoice
          </a>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="receivables-summary-cards">
        {[
          { icon: Wallet, label: "Total Piutang Berjalan", value: summary ? rupiah(summary.total_outstanding) : "...", cls: "text-slate-900 dark:text-slate-100" },
          { icon: AlertCircle, label: "Terlambat", value: summary ? rupiah(summary.total_overdue) : "...", sub: summary ? `${summary.count_overdue} invoice` : "", cls: "text-red-600 dark:text-red-400" },
          { icon: TrendingUp, label: "Total Terbayar", value: summary ? rupiah(summary.total_collected) : "...", cls: "text-emerald-600 dark:text-emerald-400" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2">
              <c.icon className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{c.label}</p>
            </div>
            <p className={`mt-2 text-xl sm:text-2xl font-extrabold font-mono tracking-tight ${c.cls}`}>{c.value}</p>
            {c.sub && <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      {summary && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid="aging-summary">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-3">Umur Piutang (Aging)</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {summary.aging.map((b) => (
              <div key={b.bucket} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{AGING_LABELS[b.bucket]}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">{rupiah(b.amount)}</p>
                <p className="text-[10px] text-slate-400">{b.count} invoice</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input data-testid="invoice-search-input" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Cari kode invoice atau pelanggan..." className="pl-10 bg-white dark:bg-slate-900" />
        </div>
        <div className="flex gap-3">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger data-testid="invoice-status-filter" className="w-40 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
            <SelectTrigger data-testid="invoice-sort-select" className="w-48 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && !loading ? (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-8 text-center" data-testid="invoice-error-state">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadInvoices} data-testid="invoice-retry-button"><RefreshCw className="h-4 w-4" /> Coba Lagi</Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <Table data-testid="invoice-table">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="pl-5">Kode</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Terbayar</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} data-testid="invoice-skeleton-row">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j} className={j === 0 ? "pl-5" : j === 7 ? "pr-5" : ""}><Skeleton className="h-4 w-full max-w-[100px]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-16 text-center" data-testid="invoice-empty-state">
                      <Receipt className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {search || status !== "all" ? "Tidak ada piutang yang cocok dengan pencarian/filter." : "Belum ada piutang. Tambahkan piutang pertama Anda."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((inv) => (
                    <TableRow key={inv.id} data-testid={`invoice-row-${inv.invoice_code}`} className="cursor-pointer" onClick={() => setDetailId(inv.id)}>
                      <TableCell className="pl-5 font-mono text-xs text-slate-500 dark:text-slate-400">{inv.invoice_code}</TableCell>
                      <TableCell className="text-sm font-semibold text-slate-900 dark:text-slate-100">{inv.customer_name}</TableCell>
                      <TableCell className={`text-xs font-mono ${inv.status === "overdue" ? "text-red-500 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>{fmtDate(inv.due_date)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-800 dark:text-slate-200">{rupiah(inv.total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{rupiah(inv.paid_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{rupiah(inv.remaining)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" data-testid={`invoice-detail-${inv.invoice_code}`} onClick={() => setDetailId(inv.id)} className="h-8 w-8 p-0" title="Detail"><Eye className="h-4 w-4" /></Button>
                          {canWrite && inv.status !== "paid" && (
                            <Button variant="ghost" size="sm" data-testid={`invoice-pay-${inv.invoice_code}`} onClick={() => setPaymentTarget(inv)} className="h-8 w-8 p-0 text-emerald-600 dark:text-emerald-400" title="Catat Pembayaran"><Banknote className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3" data-testid="invoice-cards">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
            ) : data.items.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center" data-testid="invoice-empty-state-mobile">
                <Receipt className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada piutang.</p>
              </div>
            ) : (
              data.items.map((inv) => (
                <div key={inv.id} data-testid={`invoice-card-${inv.invoice_code}`} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4" onClick={() => setDetailId(inv.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{inv.customer_name}</p>
                      <p className="text-xs font-mono text-slate-500">{inv.invoice_code} · tempo {fmtDate(inv.due_date)}</p>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Sisa Piutang</p>
                      <p className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">{rupiah(inv.remaining)}</p>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {canWrite && inv.status !== "paid" && (
                        <Button variant="ghost" size="sm" data-testid={`invoice-pay-m-${inv.invoice_code}`} onClick={() => setPaymentTarget(inv)} className="h-8 w-8 p-0 text-emerald-600"><Banknote className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between" data-testid="invoice-pagination">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total <span className="font-semibold font-mono">{data.total}</span> piutang · Halaman <span className="font-mono">{page}</span> dari <span className="font-mono">{data.pages}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" data-testid="pagination-prev-button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button>
              <Button variant="outline" size="sm" data-testid="pagination-next-button" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Berikutnya <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}

      <PaymentDialog invoice={paymentTarget} onClose={() => setPaymentTarget(null)} onSaved={reloadAll} />
      <InvoiceDetailDialog invoiceId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
