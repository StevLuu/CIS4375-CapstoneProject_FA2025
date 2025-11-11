// src/Page/Inventory.tsx
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";
import { api } from "../lib/api";

// TODO: Schema: Make item.current_quantity non-nullable (Int @default(0)); add migration; ensure API returns a number. Then remove any UI null-coercions.
// ---- Types aligned to backend ----
export type CategoryDTO = { category_id: number; category_name: string; parent_category_id: number | null };
// Mark ItemDTO as read only to stop accidental writes to fields like sku in the UI.
export type ItemDTO = {
  sku: string;
  item_name: string;
  description: string | null;
  current_quantity: number; // backend field
  price: number | null;
  online_sale_price?: number | null;
};

type ItemsResp = { items: ItemDTO[]; nextCursor: string | null };
type CategoriesResp = { categories: CategoryDTO[] };
type CategoryItemsResp = { items: ItemDTO[]; scope: "direct" | "subtree" };
type UpdatePayload = Omit<Partial<ItemDTO>, "sku" | "current_quantity"> & {
  quantityDelta?: number;
  current_quantity?: number;
};


// ---- Helpers ----
function toView(it: ItemDTO) {
  return {
    sku: it.sku,
    name: it.item_name || it.sku,
    stock: Number.isFinite(it.current_quantity) ? it.current_quantity : 0,
    price: typeof it.price === "number" ? it.price : 0,
    raw: it,
  };
}

export default function Inventory() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  // UI state
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [categoriesRoot, setCategoriesRoot] = useState<CategoryDTO[]>([]);
  const [catChildren, setCatChildren] = useState<Record<number, CategoryDTO[] | undefined>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Data state
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<{ open: boolean; item?: ItemDTO }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; sku?: string }>({ open: false });

  useEffect(() => {
    if (!loggedIn || !user?.email) setShowLogin(true);
  }, [loggedIn, user]);

  // Load root categories once when logged in
  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const data = await api<CategoriesResp>(`/categories`);
        setCategoriesRoot(data.categories ?? []);
      } catch (_) {}
    })();
  }, [loggedIn]);

  // Fetch function with cursor
  async function loadItems(opts?: { reset?: boolean; cursor?: string | null }) {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (search.trim()) params.set("q", search.trim());
      if (categoryId !== undefined) params.set("category_id", String(categoryId));
      if (opts?.cursor) params.set("cursor", opts.cursor);

      const data = await api<ItemsResp>(`/items?${params.toString()}`);
      const newItems = data.items ?? [];
      setItems((prev) => (opts?.reset ? newItems : [...prev, ...newItems]));
      setNextCursor(data.nextCursor ?? null);
    } catch (e: any) {
      setError(e?.message || "Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  // Initial + on search/category change
  useEffect(() => {
    if (!loggedIn) return;
    const t = setTimeout(() => {
      void loadItems({ reset: true, cursor: null });
    }, 300);
    return () => clearTimeout(t);
  }, [loggedIn, search, categoryId]);

  // lazy-load children for a parent once
  async function loadChildren(parentId: number) {
    if (catChildren[parentId]) return; // cached
    try {
      const data = await api<CategoriesResp>(`/categories?parent_id=${parentId}`);
      setCatChildren((m) => ({ ...m, [parentId]: data.categories ?? [] }));
    } catch (_) {}
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    void loadChildren(id);
  }

  const view = useMemo(() => items.map(toView), [items]);

  // ---- CRUD actions (optimistic) ----
  async function addItem(payload: {
    sku: string;
    item_name: string;
    description?: string | null;
    current_quantity?: number;
    price?: number | null;
    online_sale_price?: number | null;
  }) {
    // minimal roundtrips: post then prepend locally with server echo
    const created = await api<ItemDTO>(`/items`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    setItems((prev) => [created, ...prev]);
  }

  async function updateItem(sku: string, changes: UpdatePayload) {
    const idx = items.findIndex(i => i.sku === sku);
    if (idx < 0) return;
    const prev: ItemDTO = items[idx]!;

    const nextQty =
    typeof changes.current_quantity === "number"
      ? changes.current_quantity
      : typeof changes.quantityDelta === "number"
      ? prev.current_quantity + changes.quantityDelta
      : prev.current_quantity;

  

    // local optimistic update
    const optimistic: ItemDTO = {
      ...prev,
      ...(changes.item_name !== undefined ? { item_name: changes.item_name } : {}),
      ...(changes.description !== undefined ? { description: changes.description ?? null } : {}),
      ...(changes.price !== undefined ? { price: changes.price } : {}),
      ...(changes.online_sale_price !== undefined ? { online_sale_price: changes.online_sale_price } : {}),
      current_quantity: nextQty,
    };
  
    setItems(list => list.map(it => (it.sku === sku ? optimistic : it)));
  

    try {
      const res = await api<{ message: string; quantity?: { delta: number; after: number } }>(
        `/items/${encodeURIComponent(sku)}`,
        { method: "PATCH", body: JSON.stringify(changes), headers: { "Content-Type": "application/json" } }
      );
      if (res.quantity) {
        setItems(list =>
          list.map(it => (it.sku === sku ? { ...it, current_quantity: res.quantity!.after } : it))
        );
      }
    } catch (e) {
      setItems(list => list.map(it => (it.sku === sku ? prev : it)));
      throw e;
    }
  }
  

  async function deleteItem(sku: string) {
    const prev = items;
    // optimistic remove
    setItems((list) => list.filter((it) => it.sku !== sku));
    try {
      await api<void>(`/items/${encodeURIComponent(sku)}`, { method: "DELETE" });
    } catch (e) {
      // revert
      setItems(prev);
      throw e;
    }
  }

  return (
    <div className="space-y-10">
      {/* Auth modal */}
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
          void loadItems({ reset: true, cursor: null });
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Inventory</h1>
          <p className="mt-1 text-neutral-500">View all products or filter below.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn bg-indigo-600 text-white hover:bg-indigo-700">
          + Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by item or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input md:w-1/2"
        />
        <select
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
          className="input w-48"
        >
          <option value="">All categories</option>
          <option value="1">Category 1</option>
          <option value="2">Category 2</option>
        </select>
      </div>

      {/* Error */}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Items Grid */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">All Items</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {view.map((item) => (
            <div key={item.sku} className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{item.name}</h2>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
                  {item.sku}
                </span>
              </div>
              <p className="mb-2 text-sm text-neutral-600">
                Stock:{" "}
                <span className={`font-medium ${item.stock <= 5 ? "text-red-600" : "text-green-600"}`}>{item.stock}</span>
              </p>
              <p className="mb-4 text-sm text-neutral-600">Price: ${item.price.toFixed(2)}</p>
              <div className="flex gap-2">
                <button
                  className="btn border text-sm"
                  onClick={() => setEditOpen({ open: true, item: item.raw })}
                >
                  Update
                </button>
                <button
                  className="btn border text-sm text-red-600"
                  onClick={() => setConfirmDelete({ open: true, sku: item.sku })}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Load more */}
        <div className="mt-6">
          {nextCursor ? (
            <button
              disabled={loading}
              onClick={() => loadItems({ cursor: nextCursor })}
              className="btn bg-neutral-900 text-white hover:bg-black disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          ) : (
            <p className="text-sm text-neutral-500">{loading ? "Loading…" : "No more items"}</p>
          )}
        </div>
      </div>

      {/* Categories browser */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">By Category</h2>
        <div className="rounded-2xl border bg-white p-5">
          {categoriesRoot.length === 0 ? (
            <p className="text-sm text-neutral-500">No categories yet.</p>
          ) : (
            <ul className="space-y-2">
              {categoriesRoot.map((root) => (
                <li key={root.category_id}>
                  <CategoryRow
                    node={root}
                    depth={0}
                    expanded={expanded.has(root.category_id)}
                    onToggle={() => toggleExpand(root.category_id)}
                    onSelect={() => setCategoryId(root.category_id)}
                    childrenNodes={catChildren[root.category_id]}
                  />
                  {expanded.has(root.category_id) && catChildren[root.category_id] && (
                    <Tree
                      nodes={catChildren[root.category_id]!}
                      depth={1}
                      expanded={expanded}
                      catChildren={catChildren}
                      onToggle={toggleExpand}
                      onSelect={(id) => setCategoryId(id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Add Item Modal */}
      {addOpen && (
        <Modal title="Add Item" onClose={() => setAddOpen(false)}>
          <AddItemForm
            onCancel={() => setAddOpen(false)}
            onSave={async (payload) => {
              await addItem(payload);
              setAddOpen(false);
            }}
          />
        </Modal>
      )}

      {/* Edit Item Modal */}
      {editOpen.open && editOpen.item && (
        <Modal title={`Update ${editOpen.item.sku}`} onClose={() => setEditOpen({ open: false })}>
          <EditItemForm
            item={editOpen.item}
            onCancel={() => setEditOpen({ open: false })}
            onSave={async (changes) => {
              await updateItem(editOpen.item!.sku, changes);
              setEditOpen({ open: false });
            }}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete.open && confirmDelete.sku && (
        <Modal title="Delete Item" onClose={() => setConfirmDelete({ open: false })}>
          <div className="space-y-4">
            <p>Are you sure you want to delete SKU {confirmDelete.sku}? This logs removal.</p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setConfirmDelete({ open: false })}>Cancel</button>
              <button
                className="btn bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  await deleteItem(confirmDelete.sku!);
                  setConfirmDelete({ open: false });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Tree({ nodes, depth, expanded, catChildren, onToggle, onSelect }: {
  nodes: CategoryDTO[];
  depth: number;
  expanded: Set<number>;
  catChildren: Record<number, CategoryDTO[] | undefined>;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="space-y-2">
      {nodes.map((n) => (
        <li key={`${depth}-${n.category_id}`}>
          <CategoryRow
            node={n}
            depth={depth}
            expanded={expanded.has(n.category_id)}
            onToggle={() => onToggle(n.category_id)}
            onSelect={() => onSelect(n.category_id)}
            childrenNodes={catChildren[n.category_id]}
          />
          {expanded.has(n.category_id) && catChildren[n.category_id] && (
            <Tree
              nodes={catChildren[n.category_id]!}
              depth={depth + 1}
              expanded={expanded}
              catChildren={catChildren}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function CategoryRow({ node, depth, expanded, onToggle, onSelect, childrenNodes }: {
  node: CategoryDTO;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  childrenNodes?: CategoryDTO[] | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn px-2" onClick={onToggle} aria-label="Toggle">
        {expanded ? "-" : "+"}
      </button>
      <button className="btn border" onClick={onSelect}>
        <span style={{ paddingLeft: depth * 12 }}>{node.category_name}</span>
      </button>
      {expanded && childrenNodes === undefined && (
        <span className="text-xs text-neutral-500">loading…</span>
      )}
    </div>
  );
}

// ---- Modal shell ----
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Add Item form ----
function AddItemForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (payload: { sku: string; item_name: string; description?: string | null; current_quantity?: number; price?: number | null; online_sale_price?: number | null }) => Promise<void>;
}) {
  const [form, setForm] = useState<{ sku: string; item_name: string; description: string; current_quantity: number; price: string }>(
    { sku: "", item_name: "", description: "", current_quantity: 0, price: "" }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setErr(null);
        try {
          await onSave({
            sku: form.sku.trim(),
            item_name: form.item_name.trim(),
            description: form.description.trim() || null,
            current_quantity: Number(form.current_quantity) || 0,
            price: form.price === "" ? null : Number(form.price),
          });
        } catch (e: any) {
          setErr(e?.message || "Failed to add item");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-3">
        <input className="input" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
        <input className="input" placeholder="Item name" value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required />
        <textarea className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <input className="input" type="number" placeholder="Initial qty" value={form.current_quantity} onChange={(e) => setForm({ ...form, current_quantity: Number(e.target.value) })} />
          <input className="input" type="number" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// ---- Edit Item form (supports quantityDelta OR absolute) ----
function EditItemForm({
  item,
  onCancel,
  onSave,
}: {
  item: ItemDTO;
  onCancel: () => void;
  onSave: (changes: Partial<ItemDTO> & { quantityDelta?: number; current_quantity?: number }) => Promise<void>;
}) {
  const [form, setForm] = useState<{
    item_name: string;
    description: string;
    price: string;
    quantityDelta: string; // integer
    setAbsolute: string; // integer absolute qty
  }>(() => ({
    item_name: item.item_name ?? "",
    description: item.description ?? "",
    price: item.price == null ? "" : String(item.price),
    quantityDelta: "",
    setAbsolute: "",
  }));

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const payloadFromForm = (): Partial<ItemDTO> & { quantityDelta?: number; current_quantity?: number } => {
    const p: Partial<ItemDTO> & { quantityDelta?: number; current_quantity?: number } = {};
    if (form.item_name !== item.item_name) p.item_name = form.item_name;
    if ((form.description || null) !== (item.description || null)) p.description = form.description || null;
    if (form.price !== (item.price == null ? "" : String(item.price))) p.price = form.price === "" ? null : Number(form.price);

    if (form.setAbsolute.trim() !== "") {
      p.current_quantity = Number(form.setAbsolute);
    } else if (form.quantityDelta.trim() !== "") {
      p.quantityDelta = Number(form.quantityDelta);
    }
    return p;
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const changes = payloadFromForm();
        if (!Object.keys(changes).length) return onCancel();
        setSaving(true);
        setErr(null);
        try {
          await onSave(changes);
        } catch (e: any) {
          setErr(e?.message || "Failed to update item");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-3">
        <input className="input" placeholder="Item name" value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
        <textarea className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input className="input" type="number" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />

        <div className="rounded-xl border p-3">
          <p className="mb-2 text-sm font-medium">Quantity</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="input"
              type="number"
              placeholder="Δ quantity (e.g., 5 or -2)"
              value={form.quantityDelta}
              onChange={(e) => setForm({ ...form, quantityDelta: e.target.value, setAbsolute: "" })}
            />
            <input
              className="input"
              type="number"
              placeholder="Set absolute qty"
              value={form.setAbsolute}
              onChange={(e) => setForm({ ...form, setAbsolute: e.target.value, quantityDelta: "" })}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">Use either Δ or absolute. Leaving both empty updates only fields.</p>
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
