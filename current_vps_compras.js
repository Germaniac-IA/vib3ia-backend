"use client";

import { useEffect, useState } from "react";
import { fetchJson, postJson, deleteJson } from "../../lib";
import { Card, Badge, PageTitle, Loading, Empty } from "../../components/shared/UI";

type PO = { id: number; order_number: string; provider_name: string; subtotal: number; discount_value: number; delivery_fee: number; total: number; status_name: string; status_color: string; payment_status_name: string; payment_status_color: string; notes: string; created_at: string; };
type PS = { id: number; name: string; color: string; };
type Pst = { id: number; name: string; color: string; };
type Product = { id: number; name: string; price: number; stock_quantity: number; };
type InputItem = { id: number; name: string; unit: string; default_cost: number; stock_quantity: number; last_cost: number; };
type Provider = { id: number; name: string; business_name: string; tax_id: string; phone: string; whatsapp: string; email: string; };
type Stat = { total_count: number; total_amount: number; };
type Period = "today" | "week" | "month";

function FieldInput({ label, value, onChange, placeholder, type = "text" }: any) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 700, color: "#666", display: "block", marginBottom: "2px" }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }} />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }: any) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 700, color: "#666", display: "block", marginBottom: "2px" }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }}>
        <option value="">Seleccionar...</option>
        {options.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

export default function ComprasPage() {
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [stats, setStats] = useState<Stat | null>(null);
  const [ps, setPS] = useState<PS[]>([]);
  const [pst, setPst] = useState<Pst[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [hasOpenCashSession, setHasOpenCashSession] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function load() {
    setLoading(true);
    Promise.all([
      fetchJson<PO[]>("/purchase-orders"),
      fetchJson<PS[]>("/purchase-statuses"),
      fetchJson<Pst[]>("/payment-statuses"),
      fetchJson<Stat>("/purchase-orders/stats?period=" + period),
    ]).then(([o, p, pt, st]) => {
      setOrders(o); setPS(p); setPst(pt); setStats(st);
    }).catch(console.error).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [refreshKey, period]);

  const filtered = orders.filter(o => {
    if (search && !o.provider_name?.toLowerCase().includes(search.toLowerCase()) && !o.order_number?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && o.status_name !== filterStatus) return false;
    if (filterPayment && o.payment_status_name !== filterPayment) return false;
    return true;
  });

  async function handleReceive(orderId: number) {
    if (!confirm("Recibir NP e incrementar stock?")) return;
    try { await postJson("/purchase-orders/" + orderId + "/receive", {}); setRefreshKey(k => k + 1); }
    catch (e) { alert("Error al recibir NP"); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Eliminar NP?")) return;
    await deleteJson("/purchase-orders/" + id);
    setRefreshKey(k => k + 1);
  }

  return (
    <div>
      <PageTitle>📥 Compras</PageTitle>
      <p style={{ fontSize: "13px", color: "#888", margin: "2px 0 16px" }}>Notas de pedido a proveedores. Stock aumenta al recibir.</p>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          <div style={{ background: "#1a1a2e", borderRadius: "12px", padding: "14px", color: "#fff" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>NPs del periodo</div>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.total_count}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "14px", border: "1px solid #eee" }}>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Total comprado</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#e74c3c" }}>${stats.total_amount.toLocaleString("es-AR")}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "4px", background: "#f0f0f0", padding: "3px", borderRadius: "8px", marginBottom: "12px", width: "fit-content" }}>
        {(["today", "week", "month"] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{ padding: "5px 12px", borderRadius: "6px", border: "none", background: period === p ? "#1a1a2e" : "transparent", color: period === p ? "#fff" : "#666", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
            {p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar NP o proveedor..." style={{ flex: 1, minWidth: "160px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px", minWidth: "140px" }}>
          <option value="">Estado compra: Todos</option>
          {ps.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px", minWidth: "150px" }}>
          <option value="">Estado pago: Todos</option>
          {pst.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#27ae60", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}>➕ Nueva Compra</button>
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? <Empty message="Sin notas de pedido" /> : (
        <div style={{ display: "grid", gap: "10px" }}>
          {filtered.map(o => (
            <Card key={o.id} onClick={() => setDetailId(o.id)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: "14px" }}>{o.order_number}</span>
                    {o.provider_name && <span style={{ fontSize: "12px", color: "#888" }}>{o.provider_name}</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888" }}>{new Date(o.created_at).toLocaleDateString("es-AR")}</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: "#1a1a2e", marginTop: "4px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>${Number(o.total).toLocaleString("es-AR")}{o.payment_paid != null && Number(o.payment_paid) < Number(o.total) && <span style={{ fontSize: "12px", fontWeight: 400, color: "#f39c12" }}> - ${Number(o.payment_paid).toLocaleString("es-AR")} pagado<span style={{ fontWeight: 400, color: "#e74c3c" }}> (resta ${Number((o.payment_pending ?? (o.total - o.payment_paid))).toLocaleString("es-AR")})</span></span>}{o.payment_paid != null && Number(o.payment_paid) >= Number(o.total) && <span style={{ fontSize: "12px", fontWeight: 400, color: "#27ae60" }}> - Cancelado</span>}</div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                    {o.status_name && <Badge color={o.status_color || "#888"}>{o.status_name}</Badge>}
                    {o.payment_status_name && <Badge color={o.payment_status_color || "#888"}>{o.payment_status_name}</Badge>}
                  </div>
                  {o.items?.length > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "#666", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {o.items.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx}>x {Number(item.quantity)} x {item.product_name}</div>
                      ))}
                      {o.items.length > 3 && <div style={{ color: "#999" }}>+ {o.items.length - 3} items mas</div>}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <button onClick={e => { e.stopPropagation(); setDetailId(o.id); }} style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #ddd", background: "#fff", color: "#1a1a2e", cursor: "pointer", fontSize: "12px" }}>👁️</button>
                  {o.status_name !== "Recibido" && (
                    <button onClick={e => { e.stopPropagation(); handleReceive(o.id); }} style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #27ae60", background: "#fff", color: "#27ae60", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>✅ Recibir</button>
                  )}
                  <button onClick={e => { e.stopPropagation(); handleDelete(o.id); }} style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#e74c3c" }}>🗑️</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewNPModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); setRefreshKey(k => k + 1); }} />}
      {detailId && <NPDetailModal orderId={detailId} onClose={() => setDetailId(null)} onUpdated={() => setRefreshKey(k => k + 1)} />}
    </div>
  );
}

function NewNPModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ provider_id: "", notes: "", delivery_fee: "0", discount_type: "", discount_value: "" });
  const [items, setItems] = useState<any[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inputItems, setInputItems] = useState<InputItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [pSearch, setPSearch] = useState("");
  const [iiSearch, setIiSearch] = useState("");

  const [provSearch, setProvSearch] = useState("");
  const [providerAdvances, setProviderAdvances] = useState<{ id: number; amount: number; remaining: number; notes: string; created_at: string; financial_account_id?: number | null }[]>([]);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState("");
  const [advanceAmountToUse, setAdvanceAmountToUse] = useState("");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showProductsDropdown, setShowProductsDropdown] = useState(false);
  const [showInputItemsDropdown, setShowInputItemsDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"products" | "insumos">("products");

  const [showNewProvider, setShowNewProvider] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewInsumo, setShowNewInsumo] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", business_name: "", tax_id: "", phone: "", whatsapp: "", email: "" });
  const [newProduct, setNewProduct] = useState({ name: "", price: "" });
  const [newInsumo, setNewInsumo] = useState({ name: "", unit: "", default_cost: "" });

  useEffect(() => {
    fetchJson<Product[]>("/products").then(setProducts).catch(() => setProducts([]));
    fetchJson<any[]>("/payment-methods").then(setPaymentMethods).catch(() => setPaymentMethods([]));
    fetchJson<InputItem[]>("/input-items").then(setInputItems).catch(() => setInputItems([]));
  }, []);

  function loadProviders(q: string) {
    fetchJson<Provider[]>("/providers?q=" + encodeURIComponent(q)).then(setProviders).catch(() => setProviders([]));
  }

  function setF(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })); }

  function addItem(item: any, type: "product" | "input_item") {
    if (items.find(i => (type === "product" ? i.product_id : i.input_item_id) === item.id)) return;
    const name = type === "product" ? item.name : item.name + " (" + item.unit + ")";
    const price = type === "product" ? Number(item.price) : Number(item.default_cost);
    setItems([...items, {
      product_id: type === "product" ? item.id : null,
      input_item_id: type === "input_item" ? item.id : null,
      product_name: name,
      quantity: 1,
      unit_price: price,
      item_type: type,
    }]);
  }

  function remItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }
  function updateItemQty(idx: number, qty: number) { const v = [...items]; v[idx].quantity = qty; setItems(v); }
  function updateItemPrice(idx: number, price: number) { const v = [...items]; v[idx].unit_price = price; setItems(v); }

  const productQuery = pSearch.trim().toLowerCase();
  const inputQuery = iiSearch.trim().toLowerCase();
  const fp = products.filter(p => !productQuery || p.name.toLowerCase().includes(productQuery));
  const fi = inputItems.filter(i => !inputQuery || i.name.toLowerCase().includes(inputQuery));
  const filteredProviders = providers.filter(p => !provSearch.trim() || p.name.toLowerCase().includes(provSearch.toLowerCase()) || p.business_name?.toLowerCase().includes(provSearch.toLowerCase()));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  let disc = 0;
  if (form.discount_type === "percent" && Number(form.discount_value)) disc = subtotal * (Number(form.discount_value) / 100);
  else if (form.discount_type === "fixed") disc = Number(form.discount_value);
  const total = Math.max(0, subtotal - disc + Number(form.delivery_fee || 0));
  const selectedAdvance = providerAdvances.find(a => String(a.id) === selectedAdvanceId) || null;

  useEffect(() => {
    if (form.provider_id) {
      fetchJson<any[]>("/advances?entity_type=provider&entity_id=" + form.provider_id)
        .then(setProviderAdvances)
        .catch(() => setProviderAdvances([]));
    } else {
      setProviderAdvances([]);
    }
  }, [form.provider_id]);

  async function saveProvider() {
    if (!newProvider.name) { alert("El nombre es obligatorio"); return; }
    try {
      const created = await postJson<Provider>("/providers", newProvider);
      setForm(prev => ({ ...prev, provider_id: String(created.id) }));
      setProvSearch(created.name);
      setShowNewProvider(false);
      setNewProvider({ name: "", business_name: "", tax_id: "", phone: "", whatsapp: "", email: "" });
    } catch (e) { alert("Error al crear proveedor"); }
  }

  async function saveProduct() {
    if (!newProduct.name || !newProduct.price) { alert("Nombre y precio son obligatorios"); return; }
    try {
      const created = await postJson<Product>("/products", { name: newProduct.name, price: Number(newProduct.price) });
      setProducts(prev => [...prev, created]);
      addItem(created, "product");
      setShowNewProduct(false);
      setNewProduct({ name: "", price: "" });
    } catch (e) { alert("Error al crear producto"); }
  }

  async function saveInsumo() {
    if (!newInsumo.name) { alert("El nombre es obligatorio"); return; }
    try {
      const created = await postJson<InputItem>("/input-items", { name: newInsumo.name, unit: newInsumo.unit, default_cost: Number(newInsumo.default_cost) || 0 });
      setInputItems(prev => [...prev, created]);
      addItem(created, "input_item");
      setShowNewInsumo(false);
      setNewInsumo({ name: "", unit: "", default_cost: "" });
    } catch (e) { alert("Error al crear insumo"); }
  }

  async function handleSave() {
    if (!form.provider_id) return alert("Seleccion? un proveedor");
    if (items.length === 0) return alert("Agreg? al menos un item");
    setSaving(true);
    try {
      const payload: any = { provider_id: Number(form.provider_id), notes: form.notes, delivery_fee: Number(form.delivery_fee) || 0, discount_type: form.discount_type || null, discount_value: Number(form.discount_value) || 0, items };
      if (isPaid && paymentMethodId && Number(paymentAmount) > 0) {
        payload.payment_method_id = Number(paymentMethodId);
        payload.payment_amount = Number(paymentAmount);
      }
      const purchaseOrder = await postJson<any>("/purchase-orders", payload);
      if (isPaid && selectedAdvance && Number(advanceAmountToUse) > 0) {
        await postJson(`/advances/${selectedAdvance.id}/use`, {
          amount: Number(advanceAmountToUse),
          purchase_order_id: purchaseOrder.id,
          session_id: null,
          notes: `Usa anticipo proveedor #${selectedAdvance.id}`,
        });
      }
      onCreated();
    } catch (e) { alert("Error"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 800 }}>📥 Nueva Compra</h2>

        {/* Proveedor */}
        {!showNewProvider ? (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#666" }}>Proveedor</label>
              <button onClick={() => setShowNewProvider(true)} style={{ fontSize: "11px", background: "none", border: "1px solid #27ae60", color: "#27ae60", padding: "2px 8px", borderRadius: "4px", cursor: "pointer" }}>➕ Nuevo</button>
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <input value={provSearch} onChange={e => { setProvSearch(e.target.value); setShowProviderDropdown(true); loadProviders(e.target.value); }} onFocus={() => { setShowProviderDropdown(true); if (!providers.length) loadProviders(""); }} placeholder="Buscar proveedor..." style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }} />
                <button onClick={() => { const next = !showProviderDropdown; setShowProviderDropdown(next); if (next && !providers.length) loadProviders(""); }} title="Ver todos los proveedores" style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "14px" }}>
                  🔍
                </button>
              </div>
              {showProviderDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #ddd", borderRadius: "8px", marginTop: "4px", maxHeight: "200px", overflowY: "auto", background: "#fff", zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  {filteredProviders.length > 0 ? filteredProviders.slice(0, 15).map(p => (
                    <div key={p.id} onClick={() => { setF("provider_id", String(p.id)); setProvSearch(p.name); setShowProviderDropdown(false); }} style={{ padding: "10px 14px", borderBottom: "1px solid #f0", cursor: "pointer", fontSize: "13px", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span><b>{p.name}</b>{p.business_name && <span style={{ color: "#888", marginLeft: "6px" }}>· {p.business_name}</span>}</span>
                      <span style={{ color: "#888" }}>{p.tax_id || ""}</span>
                    </div>
                  )) : (
                    <div style={{ padding: "12px", color: "#999", fontSize: "12px", textAlign: "center" }}>No se encontraron proveedores</div>
                  )}
                </div>
              )}
              {!!form.provider_id && (() => {
                const totalRemaining = providerAdvances.reduce((s, a) => s + Number(a.remaining || 0), 0);
                return totalRemaining > 0 ? (
                  <div style={{ marginTop: "8px", display: "inline-flex", fontSize: "11px", background: "#6c63ff", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                    💳 {totalRemaining.toLocaleString("es-AR")} anticipo
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "12px", padding: "12px", background: "#f8fff8", borderRadius: "8px", border: "1px solid #27ae60" }}>
            <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "8px" }}>➕ Nuevo Proveedor</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <FieldInput label="Nombre *" value={newProvider.name} onChange={v => setNewProvider(p => ({ ...p, name: v }))} placeholder="ej: Florería San Juan" />
              <FieldInput label="Razón Social" value={newProvider.business_name} onChange={v => setNewProvider(p => ({ ...p, business_name: v }))} placeholder="ej: Florería SJ SRL" />
              <FieldInput label="CUIT" value={newProvider.tax_id} onChange={v => setNewProvider(p => ({ ...p, tax_id: v }))} placeholder="XX-XXXXXXXX-X" />
              <FieldInput label="Teléfono" value={newProvider.phone} onChange={v => setNewProvider(p => ({ ...p, phone: v }))} placeholder="264XXXXXXX" />
              <FieldInput label="WhatsApp" value={newProvider.whatsapp} onChange={v => setNewProvider(p => ({ ...p, whatsapp: v }))} placeholder="549264..." />
              <FieldInput label="Email" value={newProvider.email} onChange={v => setNewProvider(p => ({ ...p, email: v }))} placeholder="info@floreria.com" />
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button onClick={() => setShowNewProvider(false)} style={{ flex: 1, padding: "6px", borderRadius: "6px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "12px" }}>Cancelar</button>
              <button onClick={saveProvider} style={{ flex: 2, padding: "6px", borderRadius: "6px", border: "none", background: "#27ae60", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>✅ Crear</button>
            </div>
          </div>
        )}

        {/* Items — tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
          <button onClick={() => setTab("products")} style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "2px solid", borderColor: tab === "products" ? "#1a1a2e" : "#ddd", background: tab === "products" ? "#1a1a2e" : "#fff", color: tab === "products" ? "#fff" : "#666", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>📦 Productos</button>
          <button onClick={() => setTab("insumos")} style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "2px solid", borderColor: tab === "insumos" ? "#1a1a2e" : "#ddd", background: tab === "insumos" ? "#1a1a2e" : "#fff", color: tab === "insumos" ? "#fff" : "#666", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>🧴 Insumos</button>
        </div>

        {tab === "products" && !showNewProduct && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#666" }}>Productos</label>
              <button onClick={() => setShowNewProduct(true)} style={{ fontSize: "11px", background: "none", border: "1px solid #27ae60", color: "#27ae60", padding: "2px 8px", borderRadius: "4px", cursor: "pointer" }}>➕ Nuevo</button>
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  value={pSearch}
                  onChange={e => { setPSearch(e.target.value); setShowProductsDropdown(true); }}
                  onFocus={() => setShowProductsDropdown(true)}
                  placeholder={`Buscar entre ${products.length} productos...`}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }}
                />
                <button onClick={() => setShowProductsDropdown(!showProductsDropdown)} title="Ver todos los productos" style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "14px" }}>
                  🔍
                </button>
              </div>
              {showProductsDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #ddd", borderRadius: "8px", marginTop: "4px", maxHeight: "200px", overflowY: "auto", background: "#fff", zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  {fp.length > 0 ? fp.slice(0, 15).map(p => (
                    <div key={p.id} onClick={() => { addItem(p, "product"); setPSearch(""); setShowProductsDropdown(false); }} style={{ padding: "10px 14px", borderBottom: "1px solid #f0", cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: "13px" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span>{p.name}</span>
                      <span style={{ fontWeight: 700, color: "#888" }}>${Number(p.price).toLocaleString("es-AR")}</span>
                    </div>
                  )) : (
                    <div style={{ padding: "12px", color: "#999", fontSize: "12px", textAlign: "center" }}>No se encontraron productos</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "products" && showNewProduct && (
          <div style={{ marginBottom: "12px", padding: "12px", background: "#f8fff8", borderRadius: "8px", border: "1px solid #27ae60" }}>
            <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "8px" }}>➕ Nuevo Producto</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <FieldInput label="Nombre *" value={newProduct.name} onChange={v => setNewProduct({ name: v, price: newProduct.price })} placeholder="ej: Ramo de rosas" />
              <FieldInput label="Precio *" value={newProduct.price} onChange={v => setNewProduct({ name: newProduct.name, price: v })} placeholder="0.00" type="number" />
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button onClick={() => setShowNewProduct(false)} style={{ flex: 1, padding: "6px", borderRadius: "6px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "12px" }}>Cancelar</button>
              <button onClick={saveProduct} style={{ flex: 2, padding: "6px", borderRadius: "6px", border: "none", background: "#27ae60", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>✅ Crear</button>
            </div>
          </div>
        )}

        {tab === "insumos" && !showNewInsumo && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#666" }}>Insumos</label>
              <button onClick={() => setShowNewInsumo(true)} style={{ fontSize: "11px", background: "none", border: "1px solid #27ae60", color: "#27ae60", padding: "2px 8px", borderRadius: "4px", cursor: "pointer" }}>➕ Nuevo</button>
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  value={iiSearch}
                  onChange={e => { setIiSearch(e.target.value); setShowInputItemsDropdown(true); }}
                  onFocus={() => setShowInputItemsDropdown(true)}
                  placeholder={`Buscar entre ${inputItems.length} insumos...`}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }}
                />
                <button onClick={() => setShowInputItemsDropdown(!showInputItemsDropdown)} title="Ver todos los insumos" style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "14px" }}>
                  🔍
                </button>
              </div>
              {showInputItemsDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, border: "1px solid #ddd", borderRadius: "8px", marginTop: "4px", maxHeight: "200px", overflowY: "auto", background: "#fff", zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  {fi.length > 0 ? fi.slice(0, 15).map(i => (
                    <div key={i.id} onClick={() => { addItem(i, "input_item"); setIiSearch(""); setShowInputItemsDropdown(false); }} style={{ padding: "10px 14px", borderBottom: "1px solid #f0", cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: "13px" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span>{i.name} <span style={{ fontSize: "11px", color: "#888" }}>({i.unit})</span></span>
                      <span style={{ fontWeight: 700, color: "#888" }}>${Number(i.default_cost).toLocaleString("es-AR")}</span>
                    </div>
                  )) : (
                    <div style={{ padding: "12px", color: "#999", fontSize: "12px", textAlign: "center" }}>No se encontraron insumos</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "insumos" && showNewInsumo && (
          <div style={{ marginBottom: "12px", padding: "12px", background: "#f8fff8", borderRadius: "8px", border: "1px solid #27ae60" }}>
            <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "8px" }}>➕ Nuevo Insumo</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <FieldInput label="Nombre *" value={newInsumo.name} onChange={v => setNewInsumo({ ...newInsumo, name: v })} placeholder="ej: Tela de rosas" />
              <FieldInput label="Unidad" value={newInsumo.unit} onChange={v => setNewInsumo({ ...newInsumo, unit: v })} placeholder="ej: Metro" />
              <FieldInput label="Costo default" value={newInsumo.default_cost} onChange={v => setNewInsumo({ ...newInsumo, default_cost: v })} placeholder="0.00" type="number" />
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button onClick={() => setShowNewInsumo(false)} style={{ flex: 1, padding: "6px", borderRadius: "6px", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "12px" }}>Cancelar</button>
              <button onClick={saveInsumo} style={{ flex: 2, padding: "6px", borderRadius: "6px", border: "none", background: "#27ae60", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>✅ Crear</button>
            </div>
          </div>
        )}

        {/* Items agregados */}
        {items.length > 0 && (
          <div style={{ marginBottom: "12px", background: "#f8f8f8", borderRadius: "8px", padding: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#666", marginBottom: "4px" }}>Items agregados ({items.length})</div>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", borderBottom: "1px solid #eee", fontSize: "13px" }}>
                <span style={{ fontSize: "12px" }}>{item.item_type === "product" ? "📦" : "🧴"}</span>
                <span style={{ flex: 1 }}>{item.product_name}</span>
                <input type="number" value={item.quantity} min={1} onChange={e => updateItemQty(idx, Number(e.target.value))} style={{ width: "50px", padding: "4px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "12px", textAlign: "center" }} />
                <span style={{ fontWeight: 700 }}>$</span>
                <input type="number" value={item.unit_price} onChange={e => updateItemPrice(idx, Number(e.target.value))} style={{ width: "70px", padding: "4px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "12px", textAlign: "right" }} />
                <span style={{ fontWeight: 700, minWidth: "80px", textAlign: "right" }}>${(item.quantity * item.unit_price).toLocaleString("es-AR")}</span>
                <button onClick={() => remItem(idx)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: "14px" }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Descuentos y envío */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          <FieldSelect label="Tipo Descuento" value={form.discount_type} onChange={v => setF("discount_type", v)} options={[{ id: "", name: "Sin descuento" }, { id: "percent", name: "%" }, { id: "fixed", name: "$" }]} />
          {form.discount_type && <FieldInput label="Monto" value={form.discount_value} onChange={v => setF("discount_value", v)} placeholder="0" type="number" />}
          <FieldInput label="Costo envío" value={form.delivery_fee} onChange={v => setF("delivery_fee", v)} placeholder="0.00" type="number" />
        </div>

        {/* Notas */}
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#666" }}>Notas</label>
          <textarea value={form.notes} onChange={e => setF("notes", e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px", minHeight: "60px", resize: "vertical" }} />
        </div>

        {/* Pagado checkbox */}
        <div style={{ marginBottom: "12px", padding: "12px", background: isPaid ? "#f0fff4" : "#f8f8f8", borderRadius: "8px", border: "1px solid " + (isPaid ? "#27ae60" : "#ddd"), transition: "all 0.2s" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} style={{ width: "18px", height: "18px" }} />
            <span style={{ fontWeight: 700, fontSize: "14px", color: isPaid ? "#27ae60" : "#666" }}>✅ Pagado en el acto</span>
          </label>
          {isPaid && (
            <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
              {form.provider_id && providerAdvances.length > 0 && (
                <>
                  <select value={selectedAdvanceId} onChange={e => {
                    const adv = providerAdvances.find(a => String(a.id) === e.target.value) || null;
                    setSelectedAdvanceId(e.target.value);
                    if (adv) {
                      const used = Math.min(Number(adv.remaining || 0), Number(total));
                      setAdvanceAmountToUse(String(used));
                      if (adv.financial_account_id) setPaymentMethodId(String(adv.financial_account_id));
                      setPaymentAmount(String(Math.max(0, Number(total) - used)));
                    } else {
                      setAdvanceAmountToUse("");
                    }
                  }} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }}>
                    <option value="">Usar anticipo</option>
                    {providerAdvances.map(a => <option key={a.id} value={a.id}>#{a.id} ? Disponible ${Number(a.remaining || 0).toLocaleString("es-AR")}</option>)}
                  </select>
                  {selectedAdvance && (
                    <input type="number" value={advanceAmountToUse} min={0} max={selectedAdvance.remaining} onChange={e => {
                      const val = e.target.value;
                      setAdvanceAmountToUse(val);
                      setPaymentAmount(String(Math.max(0, Number(total) - Math.min(Number(val || 0), Number(total)))));
                    }} placeholder="Monto de anticipo a usar" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "13px" }} />
                  )}
                </>
              )}
              {selectedAdvance && Number(advanceAmountToUse || 0) > 0 && (
                <div style={{ fontSize: "12px", color: "#666" }}>Usando anticipo: <b style={{ color: "#e67e22" }}>${Number(advanceAmountToUse).toLocaleString("es-AR")}</b></div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <FieldSelect label="Cuenta para saldo" value={paymentMethodId} onChange={setPaymentMethodId} options={paymentMethods} />
                <FieldInput label="Saldo a pagar ahora" value={paymentAmount} onChange={setPaymentAmount} placeholder="0.00" type="number" />
              </div>
              <div style={{ fontSize: "11px", color: "#888" }}>Si el anticipo cubre todo o quer?s dejar saldo pendiente, pod?s dejar el saldo en 0.</div>
            </div>
          )}
        </div>

        {/* Total */}
        <div style={{ borderTop: "2px solid #1a1a2e", paddingTop: "12px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "18px", fontWeight: 800, color: "#1a1a2e" }}>
            <span>Total:</span><span>${total.toLocaleString("es-AR")}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: "8px", border: "none", background: "#27ae60", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, opacity: saving ? 0.7 : 1 }}>{saving ? "Guardando..." : "✅ Crear Compra"}</button>
        </div>
      </div>
    </div>
  );
}

function NPDetailModal({ orderId, onClose, onUpdated }: any) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson("/purchase-orders/" + orderId)
      .then(setOrder)
      .catch(() => setError("No se pudo cargar la compra"))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "40px", textAlign: "center", width: "100%", maxWidth: "600px" }}>
        <Loading />
      </div>
    </div>
  );

  if (error || !order) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "40px", textAlign: "center", width: "100%", maxWidth: "600px" }}>
        <p style={{ color: "#e74c3c" }}>{error || "No se pudo cargar la compra"}</p>
        <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#333", color: "#fff", cursor: "pointer" }}>Cerrar</button>
      </div>
    </div>
  );

  async function handleReceive() {
    if (!confirm("Marcar como Recibida e incrementar stock?")) return;
    try {
      await postJson("/purchase-orders/" + orderId + "/receive", {});
      onUpdated();
    } catch (e) {
      alert("Error");
    }
  }

  const remaining = Number(order.total) - Number(order.payment_paid || 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>{order.order_number}</h2>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
              {order.provider_name || "Sin proveedor"}
            </div>
            <div style={{ fontSize: "12px", color: "#888" }}>
              {new Date(order.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", padding: "4px 8px" }}>?</button>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {order.status_name && <Badge color={order.status_color}>{order.status_name}</Badge>}
          {order.payment_status_name && <Badge color={order.payment_status_color}>{order.payment_status_name}</Badge>}
          <span style={{ padding: "6px 10px", borderRadius: "8px", background: "#f0f0f0", fontSize: "13px", color: "#666" }}>
            ?? Compra
          </span>
          {order.status_name !== "Recibido" && (
            <button onClick={handleReceive}
              style={{ padding: "6px 14px", borderRadius: "8px", border: "none", background: "#1a1a2e", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}>
              Marcar Recibida
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "16px" }}>
          <div style={{ background: "#f8f8f8", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "2px" }}>Subtotal</div>
            <div style={{ fontWeight: 800, fontSize: "15px" }}>${Number(order.subtotal).toLocaleString("es-AR")}</div>
          </div>
          {Number(order.discount_value) > 0 && (
            <div style={{ background: "#fde8e8", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "#888", marginBottom: "2px" }}>Descuento</div>
              <div style={{ fontWeight: 800, fontSize: "15px", color: "#e74c3c" }}>
                -{order.discount_type === "percent" ? order.discount_value + "%" : "$" + Number(order.discount_value).toLocaleString("es-AR")}
              </div>
            </div>
          )}
          {Number(order.delivery_fee) > 0 && (
            <div style={{ background: "#f8f8f8", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "#888", marginBottom: "2px" }}>Env?o</div>
              <div style={{ fontWeight: 800, fontSize: "15px" }}>${Number(order.delivery_fee).toLocaleString("es-AR")}</div>
            </div>
          )}
          <div style={{ background: "#1a1a2e", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "2px" }}>Total</div>
            <div style={{ fontWeight: 800, fontSize: "15px", color: "#fff" }}>${Number(order.total).toLocaleString("es-AR")}</div>
          </div>
        </div>

        <div style={{ background: "#f8f8f8", borderRadius: "10px", padding: "12px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: 700, fontSize: "13px" }}>?? Pagos</span>
            <span style={{ fontSize: "12px", color: "#888" }}>{order.payments?.length || 0} imputado(s)</span>
          </div>
          {order.payments && order.payments.length > 0 ? (
            <div>
              {order.payments.map((p: any) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #e0e0e0", fontSize: "13px" }}>
                  <span>
                    <b>${Number(p.amount).toLocaleString("es-AR")}</b>
                    {p.account_name && <span style={{ color: "#888", marginLeft: "6px" }}>{p.account_name}</span>}
                    <span style={{ color: "#aaa", fontSize: "11px", marginLeft: "6px" }}>
                      {new Date(p.created_at).toLocaleDateString("es-AR")}
                    </span>
                    {p.notes && <span style={{ color: "#666", marginLeft: "6px" }}>? {p.notes}</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: "12px", color: "#999" }}>Sin pagos registrados</div>}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "13px", fontWeight: 700 }}>
            <span>Pagado: <span style={{ color: "#27ae60" }}>${Number(order.payment_paid || 0).toLocaleString("es-AR")}</span></span>
            {remaining > 0 && <span style={{ color: "#f39c12" }}>Pendiente: ${remaining.toLocaleString("es-AR")}</span>}
            {remaining <= 0 && <span style={{ color: "#27ae60" }}>? Cancelado</span>}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>?? Items</div>
          {order.items && order.items.length > 0 ? (
            <div style={{ border: "1px solid #eee", borderRadius: "8px", overflow: "hidden" }}>
              {order.items.map((item: any, idx: number) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: idx < order.items.length - 1 ? "1px solid #f0" : "none", fontSize: "13px" }}>
                  <span>{item.quantity} ? {item.product_name}</span>
                  <span style={{ fontWeight: 700 }}>${Number(item.subtotal).toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: "12px", color: "#999" }}>Sin items</div>}
        </div>

        {order.notes && (
          <div style={{ fontSize: "13px", color: "#666", fontStyle: "italic", padding: "8px 0", borderTop: "1px solid #eee" }}>
            {order.notes}
          </div>
        )}
      </div>
    </div>
  );
}
