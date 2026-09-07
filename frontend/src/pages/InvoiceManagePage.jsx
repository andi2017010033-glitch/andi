import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Loader2, AlertCircle, RefreshCw, Eye, Pencil, XCircle,
  ChevronLeft, ChevronRight, FileText, Trash2, ChevronsUpDown, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { api, useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";

const rupiah = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" },
  unpaid: { label: "Belum Bayar", cls: "bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400" },
  partial: { label: "Sebagian", cls: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400" },
  paid: { label: "Lunas", cls: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400" },
  overdue: { label: "Terlambat", cls: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400" },
  cancelled: { label: "Dibatalkan", cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 line-through" },
};

const STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "draft", label: "Draft" },
  { value: "unpaid", label: "Belum Bayar" },
  { value: "partial", label: "Sebagian" },
  { value: "paid", label: "Lunas" },
  { value: "overdue", label: "Terlambat" },
  { value: "cancelled", label: "Dibatalkan" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "amount_desc", label: "Nominal Terbesar" },
  { value: "amount_asc", label: "Nominal Terkecil" },
  { value: "due_asc", label: "Jatuh Tempo Terdekat" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "Semua Waktu" },
  { value: "today", label: "Hari Ini" },
  { value: "week", label: "Minggu Ini" },
  { value: "month", label: "Bulan Ini" },
  { value: "custom", label: "Rentang Kustom" },
];

const EMPTY_ITEM = { product_code: "", product_name: "", quantity: 1, unit: "pcs", price: "", discount: 0 };

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unpaid;
  return <span data-testid={`inv-status-badge-${status}`} className={`inline-block text-xs font-semibold rounded-full px-2.5 py-1 ${meta.cls}`}>{meta.label}</span>;
}

function CustomerPicker({ customer, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [q, setQ] = useState("");
  const [loadingC, setLoadingC] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingC(true);
    const t = setTimeout(() => {
      api.get("/customers", { params: { status: "active", limit: 50, sort: "name_asc", search: q } })
        .then(({ data }) => setOptions(data.items))
        .catch(() => setOptions([]))
        .finally(() => setLoadingC(false));
    }, 300);
    return () => clearTimeout(t);
  }, [open, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid="invoice-customer-picker"
          className="w-full flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 h-11 text-sm text-left disabled:opacity-50"
        >
          {customer ? (
            <span className="truncate">
              <span className="font-medium text-slate-900 dark:text-slate-100">{customer.name}</span>
              <span className="ml-2 font-mono text-xs text-slate-400">{customer.customer_code}</span>
              {customer.phone && <span className="ml-2 text-xs text-slate-400">{customer.phone}</span>}
            </span>
          ) : (
            <span className="text-slate-400">Pilih pelanggan aktif...</span>
          )}
          <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800" align="start">
        <Input
          data-testid="invoice-customer-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode / nama / telepon..."
          className="h-9 mb-2 bg-white dark:bg-slate-900"
        />
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {loadingC ? (
            <div className="py-6 text-center text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin inline-block mr-1" /> Memuat...</div>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Tidak ada pelanggan aktif ditemukan.</p>
          ) : (
            options.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid={`invoice-customer-option-${c.customer_code}`}
                onClick={() => { onSelect(c); setOpen(false); }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${customer?.id === c.id ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                <span className="ml-2 font-mono text-xs text-slate-400">{c.customer_code}</span>
                {c.phone && <span className="block text-[11px] text-slate-400 font-mono">{c.phone}</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InvoiceFormDialog({ open, onOpenChange, initial, onSaved, canEditFinancial }) {
  const isEdit = Boolean(initial?.id);
  const [customer, setCustomer] = useState(null);
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [invDiscount, setInvDiscount] = useState("0");
  const [invTax, setInvTax] = useState("0");
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [submitting, setSubmitting] = useState(null);
  const [formError, setFormError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);

  const financialLocked = isEdit && (initial.paid_amount > 0 || initial.status === "paid");
  const isPaid = isEdit && initial.status === "paid";

  useEffect(() => {
    if (!open) return;
    setFormError("");
    setSubmitting(null);
    if (isEdit) {
      setLoadingDetail(true);
      setCustomer({ id: initial.customer_id, name: initial.customer_name, customer_code: initial.customer_code });
      setInvoiceDate(initial.invoice_date?.slice(0, 10) || todayStr());
      setDueDate(initial.due_date?.slice(0, 10) || todayStr());
      setNotes(initial.notes || "");
      setInvDiscount(String(initial.discount ?? 0));
      setInvTax(String(initial.tax ?? 0));
      api.get(`/invoices/${initial.id}`)
        .then(({ data }) => {
          const loaded = (data.items || []).map((it) => ({
            product_code: it.product_code || "",
            product_name: it.product_name || "",
            quantity: it.quantity,
            unit: it.unit || "pcs",
            price: String(it.price),
            discount: it.discount || 0,
          }));
          setItems(loaded.length ? loaded : [{ ...EMPTY_ITEM }]);
        })
        .catch(() => setItems([{ ...EMPTY_ITEM }]))
        .finally(() => setLoadingDetail(false));
    } else {
      setCustomer(null);
      setInvoiceDate(todayStr());
      setDueDate(todayStr());
      setNotes("");
      setInvDiscount("0");
      setInvTax("0");
      setItems([{ ...EMPTY_ITEM }]);
    }
  }, [open, initial, isEdit]);

  const setItem = (idx, key, val) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const preview = items.reduce(
    (acc, it) => {
      const qty = parseFloat(it.quantity) || 0;
      const price = parseFloat(it.price) || 0;
      const disc = parseFloat(it.discount) || 0;
      acc.subtotal += Math.max(0, qty * price - disc);
      return acc;
    },
    { subtotal: 0 }
  );
  const discountNum = parseFloat(invDiscount) || 0;
  const taxNum = parseFloat(invTax) || 0;
  const previewTotal = Math.max(0, preview.subtotal - discountNum + taxNum);

  const handleSubmit = async (saveAs) => {
    if (submitting) return;
    setFormError("");
    if (!isEdit && !customer) { setFormError("Pelanggan wajib dipilih."); return; }
    if (!invoiceDate || !dueDate) { setFormError("Tanggal invoice dan jatuh tempo wajib diisi."); return; }
    if (dueDate < invoiceDate) { setFormError("Tanggal jatuh tempo tidak boleh sebelum tanggal invoice."); return; }
    const cleanItems = items.filter((it) => it.product_name.trim());
    if (cleanItems.length === 0 && !financialLocked) { setFormError("Minimal satu item wajib diisi."); return; }
    for (const it of cleanItems) {
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.price);
      if (isNaN(qty) || qty <= 0) { setFormError(`Qty item "${it.product_name}" harus lebih dari 0.`); return; }
      if (isNaN(price) || price < 0) { setFormError(`Harga item "${it.product_name}" tidak valid.`); return; }
    }
    setSubmitting(saveAs);
    try {
      const payload = {
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes: notes.trim() || null,
      };
      if (!financialLocked) {
        payload.discount = discountNum;
        payload.tax = taxNum;
        payload.items = cleanItems.map((it) => ({
          product_code: it.product_code.trim() || null,
          product_name: it.product_name.trim(),
          quantity: parseFloat(it.quantity),
          unit: it.unit.trim() || null,
          price: parseFloat(it.price),
          discount: parseFloat(it.discount) || 0,
        }));
      }
      let data;
      if (isEdit) {
        if (saveAs) payload.save_as = saveAs;
        data = (await api.patch(`/invoices/${initial.id}`, payload)).data;
        toast.success(`Invoice ${data.invoice_code} diperbarui.`);
      } else {
        payload.customer_id = customer.id;
        payload.save_as = saveAs;
        data = (await api.post("/invoices", payload)).data;
        toast.success(`Invoice ${data.invoice_code} ${saveAs === "draft" ? "disimpan sebagai draft" : "diterbitkan"}. Total: ${rupiah(data.total)}`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setFormError(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="invoice-form-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">{isEdit ? `Edit Invoice ${initial.invoice_code}` : "Buat Invoice Baru"}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            {isEdit ? "Perhitungan ulang dilakukan di server." : "Nomor invoice dibuat otomatis (mis. INV-202609-000001). Perhitungan final dilakukan di server."}
          </DialogDescription>
        </DialogHeader>
        {loadingDetail ? (
          <div className="space-y-3 py-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-10 w-1/2" /></div>
        ) : (
          <div className="space-y-6">
            {formError && (
              <div data-testid="invoice-form-error" className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            {financialLocked && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300" data-testid="invoice-financial-locked-notice">
                {isPaid ? "Invoice sudah lunas — hanya catatan yang dapat diubah." : "Invoice memiliki pembayaran — item, diskon, dan pajak terkunci."}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Informasi Invoice</p>
              <div className="space-y-1.5">
                <Label>Pelanggan <span className="text-red-500">*</span></Label>
                {isEdit ? (
                  <Input value={`${initial.customer_name} (${initial.customer_code})`} disabled className="bg-slate-50 dark:bg-slate-800" data-testid="invoice-customer-readonly" />
                ) : (
                  <CustomerPicker customer={customer} onSelect={setCustomer} />
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invf-date">Tanggal Invoice <span className="text-red-500">*</span></Label>
                  <Input id="invf-date" data-testid="invoice-date-input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={isPaid} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invf-due">Jatuh Tempo <span className="text-red-500">*</span></Label>
                  <Input id="invf-due" data-testid="invoice-due-date-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={isPaid} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Item Invoice</p>
                {!financialLocked && (
                  <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="invoice-add-item-button">
                    <Plus className="h-3.5 w-3.5" /> Tambah Item
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm min-w-[720px]" data-testid="invoice-items-editor">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Kode</th>
                      <th className="px-3 py-2">Nama Item <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2 w-20">Qty</th>
                      <th className="px-3 py-2 w-20">Satuan</th>
                      <th className="px-3 py-2 w-32">Harga</th>
                      <th className="px-3 py-2 w-28">Diskon</th>
                      <th className="px-3 py-2 w-32 text-right">Subtotal</th>
                      {!financialLocked && <th className="px-3 py-2 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const sub = Math.max(0, (parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0) - (parseFloat(it.discount) || 0));
                      return (
                        <tr key={idx} className="border-t border-slate-200 dark:border-slate-800" data-testid={`invoice-item-row-${idx}`}>
                          <td className="px-2 py-1.5"><Input value={it.product_code} onChange={(e) => setItem(idx, "product_code", e.target.value)} placeholder="SKU" disabled={financialLocked} className="h-9 text-xs font-mono bg-white dark:bg-slate-900" data-testid={`item-code-${idx}`} /></td>
                          <td className="px-2 py-1.5"><Input value={it.product_name} onChange={(e) => setItem(idx, "product_name", e.target.value)} placeholder="Nama produk/jasa" disabled={financialLocked} className="h-9 bg-white dark:bg-slate-900" data-testid={`item-name-${idx}`} /></td>
                          <td className="px-2 py-1.5"><Input type="number" min="0.01" step="any" value={it.quantity} onChange={(e) => setItem(idx, "quantity", e.target.value)} disabled={financialLocked} className="h-9 font-mono bg-white dark:bg-slate-900" data-testid={`item-qty-${idx}`} /></td>
                          <td className="px-2 py-1.5"><Input value={it.unit} onChange={(e) => setItem(idx, "unit", e.target.value)} disabled={financialLocked} className="h-9 bg-white dark:bg-slate-900" data-testid={`item-unit-${idx}`} /></td>
                          <td className="px-2 py-1.5"><Input type="number" min="0" step="any" value={it.price} onChange={(e) => setItem(idx, "price", e.target.value)} disabled={financialLocked} className="h-9 font-mono bg-white dark:bg-slate-900" data-testid={`item-price-${idx}`} /></td>
                          <td className="px-2 py-1.5"><Input type="number" min="0" step="any" value={it.discount} onChange={(e) => setItem(idx, "discount", e.target.value)} disabled={financialLocked} className="h-9 font-mono bg-white dark:bg-slate-900" data-testid={`item-discount-${idx}`} /></td>
                          <td className="px-3 py-1.5 text-right font-mono text-sm text-slate-800 dark:text-slate-200" data-testid={`item-subtotal-${idx}`}>{rupiah(sub)}</td>
                          {!financialLocked && (
                            <td className="px-2 py-1.5">
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} disabled={items.length <= 1} className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" data-testid={`item-remove-${idx}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="invf-notes">Catatan</Label>
                <Textarea id="invf-notes" data-testid="invoice-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={4} placeholder="Catatan invoice (opsional)" className="bg-white dark:bg-slate-900" />
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-sm" data-testid="invoice-summary-preview">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono font-medium" data-testid="preview-subtotal">{rupiah(preview.subtotal)}</span></div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-500">Diskon Invoice</span>
                  <Input type="number" min="0" step="any" value={invDiscount} onChange={(e) => setInvDiscount(e.target.value)} disabled={financialLocked} className="h-8 w-32 font-mono text-right bg-white dark:bg-slate-900" data-testid="invoice-discount-input" />
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-500">Pajak</span>
                  <Input type="number" min="0" step="any" value={invTax} onChange={(e) => setInvTax(e.target.value)} disabled={financialLocked} className="h-8 w-32 font-mono text-right bg-white dark:bg-slate-900" data-testid="invoice-tax-input" />
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2.5">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Total</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400" data-testid="preview-total">{rupiah(previewTotal)}</span>
                </div>
                <p className="text-[10px] text-slate-400">Pratinjau — nilai final dihitung ulang oleh server.</p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="invoice-form-cancel-button">Batal</Button>
              {(!isEdit || initial.status === "draft") && (
                <Button type="button" variant="outline" disabled={Boolean(submitting)} onClick={() => handleSubmit("draft")} data-testid="invoice-save-draft-button">
                  {submitting === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Simpan Draft
                </Button>
              )}
              <Button type="button" disabled={Boolean(submitting)} onClick={() => handleSubmit(isEdit ? null : "invoice")} data-testid="invoice-save-button" className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
                {submitting === "invoice" || (isEdit && submitting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isEdit ? "Simpan Perubahan" : "Simpan Invoice"}
              </Button>
            </DialogFooter>
          </div>
        )}
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
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="invoice-detail-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">Detail Invoice</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">Informasi, item, dan ringkasan pembayaran.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300" data-testid="invoice-detail-error">{error}</div>
        ) : !inv ? (
          <div className="space-y-3 py-2"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-32 w-full" /></div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100" data-testid="invoice-detail-code">{inv.invoice_code}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{inv.customer_name} <span className="font-mono text-xs">({inv.customer_code})</span></p>
                <p className="text-xs text-slate-400 mt-0.5">Dibuat oleh {inv.created_by || "—"} · {fmtDate(inv.created_at)}</p>
              </div>
              <StatusBadge status={inv.status} />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
              <span>Tanggal: <span className="font-mono">{fmtDate(inv.invoice_date)}</span></span>
              <span>Jatuh tempo: <span className="font-mono">{fmtDate(inv.due_date)}</span></span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-2">Item</p>
              {data.items.length === 0 ? (
                <p className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3" data-testid="invoice-items-empty">Tidak ada rincian item (invoice lama tanpa item).</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800" data-testid="invoice-detail-items">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-2">Produk</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Harga</th>
                        <th className="px-3 py-2 text-right">Diskon</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((it) => (
                        <tr key={it.id} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2">
                            <span className="text-slate-800 dark:text-slate-200">{it.product_name}</span>
                            {it.product_code && <span className="ml-2 font-mono text-[11px] text-slate-400">{it.product_code}</span>}
                            <span className="block text-[11px] text-slate-400">{it.unit || "pcs"}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{it.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono">{rupiah(it.price)}</td>
                          <td className="px-3 py-2 text-right font-mono">{rupiah(it.discount)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{rupiah(it.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-sm" data-testid="invoice-detail-summary">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{rupiah(inv.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span className="font-mono">-{rupiah(inv.discount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Pajak</span><span className="font-mono">+{rupiah(inv.tax)}</span></div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 font-semibold"><span>Total</span><span className="font-mono">{rupiah(inv.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Dibayar</span><span className="font-mono text-emerald-600 dark:text-emerald-400">{rupiah(inv.paid_amount)}</span></div>
              <div className="flex justify-between font-semibold"><span>Sisa</span><span className="font-mono text-slate-900 dark:text-slate-100">{rupiah(inv.remaining)}</span></div>
            </div>

            {inv.notes && <p className="text-sm text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-4 py-3">{inv.notes}</p>}

            {data.payments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-2">Riwayat Pembayaran</p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800" data-testid="invoice-detail-payments">
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
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function InvoiceManagePage() {
  const { user } = useAuth();
  const canWrite = ["owner", "admin", "staff"].includes(user.role);
  const canCancel = ["owner", "admin"].includes(user.role);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formDialog, setFormDialog] = useState({ open: false, initial: null });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { search, status, sort, page, limit: pageSize, period };
      if (period === "custom") {
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
      }
      const { data: res } = await api.get("/invoices", { params });
      setData(res);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [search, status, period, dateFrom, dateTo, sort, page, pageSize]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const handleCancel = async () => {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    try {
      await api.post(`/invoices/${cancelTarget.id}/cancel`);
      toast.success(`Invoice ${cancelTarget.invoice_code} dibatalkan.`);
      setCancelTarget(null);
      loadInvoices();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setCancelling(false);
    }
  };

  const renderActions = (inv, suffix = "") => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="sm" data-testid={`invoice-detail${suffix}-${inv.invoice_code}`} onClick={() => setDetailId(inv.id)} className="h-8 w-8 p-0" title="Detail"><Eye className="h-4 w-4" /></Button>
      {canWrite && !["cancelled", "paid"].includes(inv.status) && (
        <Button variant="ghost" size="sm" data-testid={`invoice-edit${suffix}-${inv.invoice_code}`} onClick={() => setFormDialog({ open: true, initial: inv })} className="h-8 w-8 p-0" title="Edit"><Pencil className="h-4 w-4" /></Button>
      )}
      {canCancel && inv.status !== "cancelled" && inv.paid_amount === 0 && (
        <Button variant="ghost" size="sm" data-testid={`invoice-cancel${suffix}-${inv.invoice_code}`} onClick={() => setCancelTarget(inv)} className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" title="Batalkan"><XCircle className="h-4 w-4" /></Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="invoice-page">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Invoice</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Buat dan kelola invoice beserta rincian item. Nomor invoice unik per perusahaan.</p>
        </div>
        {canWrite && (
          <Button data-testid="create-invoice-button" onClick={() => setFormDialog({ open: true, initial: null })} className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white">
            <Plus className="h-4 w-4" /> Buat Invoice
          </Button>
        )}
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input data-testid="invoice-search-input" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Cari nomor invoice / pelanggan..." className="pl-10 bg-white dark:bg-slate-900" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger data-testid="invoice-status-filter" className="w-36 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => { setPeriod(v); setPage(1); }}>
            <SelectTrigger data-testid="invoice-period-filter" className="w-36 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-36 bg-white dark:bg-slate-900" data-testid="invoice-date-from" />
              <span className="text-xs text-slate-400">s/d</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-36 bg-white dark:bg-slate-900" data-testid="invoice-date-to" />
            </div>
          )}
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
            <SelectTrigger data-testid="invoice-sort-select" className="w-44 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger data-testid="invoice-page-size" className="w-24 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}/hal</SelectItem>)}
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
          <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <Table data-testid="invoice-table" className="min-w-[1000px]">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="pl-5">Nomor Invoice</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Tgl Invoice</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dibayar</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="pr-5 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} data-testid="invoice-skeleton-row">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <TableCell key={j} className={j === 0 ? "pl-5" : j === 9 ? "pr-5" : ""}><Skeleton className="h-4 w-full max-w-[100px]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center" data-testid="invoice-empty-state">
                      <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {search || status !== "all" || period !== "all" ? "Tidak ada invoice yang cocok dengan pencarian/filter." : "Belum ada invoice."}
                      </p>
                      {canWrite && !search && status === "all" && period === "all" && (
                        <Button size="sm" className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white" onClick={() => setFormDialog({ open: true, initial: null })} data-testid="empty-create-invoice-button">
                          <Plus className="h-4 w-4" /> Buat Invoice
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((inv) => (
                    <TableRow key={inv.id} data-testid={`invoice-row-${inv.invoice_code}`} className="cursor-pointer" onClick={() => setDetailId(inv.id)}>
                      <TableCell className="pl-5 font-mono text-xs text-slate-600 dark:text-slate-300">{inv.invoice_code}</TableCell>
                      <TableCell className="text-sm font-semibold text-slate-900 dark:text-slate-100">{inv.customer_name}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-500 dark:text-slate-400">{fmtDate(inv.invoice_date)}</TableCell>
                      <TableCell className={`text-xs font-mono ${inv.status === "overdue" ? "text-red-500 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>{fmtDate(inv.due_date)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-800 dark:text-slate-200">{rupiah(inv.total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{rupiah(inv.paid_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{rupiah(inv.remaining)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell className="text-xs text-slate-500 dark:text-slate-400">{inv.created_by || "—"}</TableCell>
                      <TableCell className="pr-5">{renderActions(inv)}</TableCell>
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
                <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada invoice.</p>
              </div>
            ) : (
              data.items.map((inv) => (
                <div key={inv.id} data-testid={`invoice-card-${inv.invoice_code}`} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4" onClick={() => setDetailId(inv.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{inv.customer_name}</p>
                      <p className="text-xs font-mono text-slate-500">{inv.invoice_code}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Tempo {fmtDate(inv.due_date)}</p>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Sisa</p>
                      <p className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">{rupiah(inv.remaining)}</p>
                      <p className="text-[11px] font-mono text-slate-400">dari {rupiah(inv.total)}</p>
                    </div>
                    {renderActions(inv, "-m")}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between" data-testid="invoice-pagination">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total <span className="font-semibold font-mono">{data.total}</span> invoice · Halaman <span className="font-mono">{page}</span> dari <span className="font-mono">{data.pages}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" data-testid="pagination-prev-button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button>
              <Button variant="outline" size="sm" data-testid="pagination-next-button" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Berikutnya <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}

      <InvoiceFormDialog open={formDialog.open} onOpenChange={(v) => setFormDialog({ open: v, initial: null })} initial={formDialog.initial} onSaved={loadInvoices} />

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <AlertDialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800" data-testid="cancel-invoice-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-slate-100">Batalkan Invoice?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              Apakah Anda yakin ingin membatalkan invoice <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{cancelTarget?.invoice_code}</span> ({cancelTarget?.customer_name})?
              Invoice tetap tersimpan di database, namun tidak dihitung sebagai piutang aktif.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-invoice-cancel-button">Kembali</AlertDialogCancel>
            <AlertDialogAction data-testid="cancel-invoice-confirm-button" onClick={handleCancel} disabled={cancelling} className="bg-red-600 hover:bg-red-700 text-white hover:text-white">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Ya, Batalkan Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoiceDetailDialog invoiceId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
