// src/Page/Inventory.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../Components/ui/Modal";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";
import { api, clampSeed, formatSku, nextSku } from "../lib/api";

/* ===== Types ===== */
export type CategoryNode = {
  category_id: number;
  category_name: string;
  parent_category_id: number | null;
  has_children?: boolean;
  counts?: { direct: number };
};
export type ItemDTO = {
  sku: string;
  item_name: string;
  description: string | null;
  current_quantity: number | null;
  price: number | string | null;
  online_sale_price?: number | string | null;
  archived?: "Y" | "N" | null;
};
type CategoriesResp = {
  categories: Array<{ category_id: number; category_name: string; parent_category_id: number | null }>;
};
// server returns items with optional nextCursor for pagination
type ItemsResp = { items: ItemDTO[]; nextCursor: string | null };
type BreadcrumbPaths = Array<Array<{ category_id: number; category_name: string }>>;
type ArchivedFilter = "exclude" | "include" | "only";
type SortDir = "asc" | "desc";

/* ===== Helpers ===== */
const fmtMoney = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeItem(it: ItemDTO) {
  return {
    ...it,
    current_quantity: Number.isFinite(it.current_quantity as any) ? Number(it.current_quantity) : 0,
    price: asNumber(it.price),
    online_sale_price: asNumber(it.online_sale_price as any),
    archived: (it.archived ?? "N") as "Y" | "N",
  };
}

/* ===== Page ===== */
export default function Inventory() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  // tree
  const [roots, setRoots] = useState<CategoryNode[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [children, setChildren] = useState<Record<number, CategoryNode[] | undefined>>({});

  // items per category
  const [itemsByCat, setItemsByCat] = useState<Record<number, { rows: ItemDTO[]; nextCursor: string | null }>>({});

  // uncategorized
  const [showUncat, setShowUncat] = useState(true);
  const [uncat, setUncat] = useState<{ rows: ItemDTO[]; nextCursor: string | null }>({ rows: [], nextCursor: null });

  // controls
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("exclude");
  const [sort, setSort] = useState<SortDir>("asc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // selection and modals
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [massOpen, setMassOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [singleEdit, setSingleEdit] = useState<{ open: boolean; sku?: string }>({ open: false });
  const [editCategory, setEditCategory] = useState<{ open: boolean; node?: CategoryNode }>({ open: false });

  // breadcrumbs cache
  const breadcrumbsRef = useRef<Record<string, BreadcrumbPaths>>({});

  // auth
  useEffect(() => { if (!loggedIn || !user?.email) setShowLogin(true); }, [loggedIn, user]);

  // load roots and uncategorized
  useEffect(() => {
    if (!loggedIn) return;
    void loadRoots();
    void loadUncategorized({ reset: true });
  }, [loggedIn]);

  // roots via /categories (parent_id defaults to null)
  async function loadRoots() {
    const data = await api<CategoriesResp>(`/categories`);
    const nodes: CategoryNode[] = (data.categories ?? []).map(c => ({
      category_id: c.category_id,
      category_name: c.category_name,
      parent_category_id: c.parent_category_id ?? null,
    }));
    setRoots(nodes);
  }

  // children via /categories?parent_id=ID
  async function loadChildren(parentId: number) {
    if (children[parentId]) return;
    const data = await api<CategoriesResp>(`/categories?parent_id=${parentId}`);
    const nodes: CategoryNode[] = (data.categories ?? []).map(c => ({
      category_id: c.category_id,
      category_name: c.category_name,
      parent_category_id: c.parent_category_id ?? null,
    }));
    setChildren(m => ({ ...m, [parentId]: nodes }));
  }

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    void loadChildren(id);
  }

  // items for a category via /items/by-category
  async function loadItemsForCategory(categoryId: number, opts?: { reset?: boolean; cursor?: string | null }) {
    const params = new URLSearchParams();
    params.set("category_id", String(categoryId));
    params.set("includeDescendants", "0");
    params.set("limit", "100");
    if (search.trim()) params.set("q", search.trim());
    if (archivedFilter) params.set("archived", archivedFilter);
    if (opts?.cursor) params.set("cursor", opts.cursor);

    const data = await api<ItemsResp>(`/items/by-category?${params.toString()}`);
    const rows = (data.items ?? []).map(normalizeItem);
    setItemsByCat(m => {
      const prev = m[categoryId]?.rows ?? [];
      return {
        ...m,
        [categoryId]: {
          rows: opts?.reset ? rows : [...prev, ...rows],
          nextCursor: data.nextCursor ?? null,
        },
      };
    });
  }

  // uncategorized via /categories/uncategorized
  async function loadUncategorized(opts?: { reset?: boolean; cursor?: string | null }) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (search.trim()) params.set("q", search.trim());
    if (archivedFilter) params.set("archived", archivedFilter);
    if (opts?.cursor) params.set("cursor", opts.cursor);
    const data = await api<ItemsResp>(`/categories/uncategorized?${params.toString()}`);
    const rows = (data.items ?? []).map(normalizeItem);
    setUncat(prev => ({ rows: opts?.reset ? rows : [...prev.rows, ...rows], nextCursor: data.nextCursor ?? null }));
  }

  // re-query opened nodes and uncategorized on submitted filter changes
  useEffect(() => {
    Array.from(expanded).forEach(id => void loadItemsForCategory(id, { reset: true, cursor: null }));
    if (showUncat) void loadUncategorized({ reset: true, cursor: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedFilter, sort, search]);

  // selection
  function toggleSelect(sku: string) { setSelectedSkus(s => { const n = new Set(s); n.has(sku) ? n.delete(sku) : n.add(sku); return n; }); }

  // breadcrumbs
  async function ensureBreadcrumbFor(sku: string) {
    if (breadcrumbsRef.current[sku]) return;
    try {
      const resp = await api<Record<string, BreadcrumbPaths>>(`/items/categories?skus=${encodeURIComponent(sku)}`);
      breadcrumbsRef.current = { ...breadcrumbsRef.current, ...resp };
    } catch { }
  }

  // archive toggle via dedicated endpoint
  async function archiveOne(sku: string, to: "Y" | "N") {
    setItemsByCat(m => {
      const mm = { ...m };
      for (const key of Object.keys(mm)) {
        const cid = Number(key);
        const entry = mm[cid];
        if (!entry) continue;
        mm[cid] = { ...entry, rows: entry.rows.map(it => it.sku === sku ? { ...it, archived: to } : it) };
      }
      return mm;
    });
    setUncat(u => ({ ...u, rows: u.rows.map(it => it.sku === sku ? { ...it, archived: to } : it) }));
    try {
      await api(`/items/${encodeURIComponent(sku)}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: to }),
      });
    } catch { }
  }

  return (
    <div className="space-y-6">
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => { setShowLogin(false); await refresh(); await loadRoots(); await loadUncategorized({ reset: true }); }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Inventory</h1>
          <p className="mt-1 text-neutral-500">Submit search to filter.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}
          >
            <input className="input w-56" placeholder="Search name or SKU"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <button className="btn" type="submit">Search</button>
            {(search || searchInput) && (
              <button className="btn" type="button" onClick={() => { setSearchInput(""); setSearch(""); }}>
                Clear
              </button>
            )}
          </form>
          <select className="input w-40" value={archivedFilter} onChange={e => setArchivedFilter(e.target.value as ArchivedFilter)}>
            <option value="exclude">Hide archived</option>
            <option value="include">Include archived</option>
            <option value="only">Only archived</option>
          </select>
          <select className="input w-28" value={sort} onChange={e => setSort(e.target.value as SortDir)}>
            <option value="asc">A to Z</option>
            <option value="desc">Z to A</option>
          </select>
          {selectedSkus.size > 0 && <button className="btn" onClick={() => setMassOpen(true)}>Submit {selectedSkus.size} selected</button>}
          <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => setAddOpen(true)}>+ Item</button>
        </div>
      </div>

      {/* Uncategorized */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2">
          <button className="btn px-2" onClick={() => setShowUncat(!showUncat)} aria-label="Toggle">{showUncat ? "▾" : "▸"}</button>
          <span className="font-medium">Uncategorized</span>
          <span className="rounded-full border px-2 py-0.5 text-xs text-neutral-600">{uncat.rows.length}</span>
        </div>
        {showUncat && (
          <div className="ml-6 mt-2">
            {uncat.rows.length === 0 ? (
              <p className="text-xs text-neutral-500">No items.</p>
            ) : (
              <ul className="space-y-1">
                {uncat.rows.slice().sort((a, b) => {
                  const A = (a.item_name || a.sku).toLowerCase(); const B = (b.item_name || b.sku).toLowerCase();
                  return sort === "asc" ? A.localeCompare(B) : B.localeCompare(A);
                }).map(it => {
                  const archived = (it.archived ?? "N") === "Y";
                  const crumbs = breadcrumbsRef.current[it.sku];
                  return (
                    <li
                      key={it.sku}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${archived ? "opacity-60 grayscale" : ""}`}
                      onMouseEnter={() => ensureBreadcrumbFor(it.sku)}
                      title={crumbs ? crumbs.map(p => p.map(q => q.category_name).join(" > ")).join("\n") : ""}
                      onClick={() => setSingleEdit({ open: true, sku: it.sku })}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          onClick={(e) => e.stopPropagation()}
                          checked={selectedSkus.has(it.sku)}
                          onChange={() => toggleSelect(it.sku)}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{it.item_name || it.sku}</span>
                            <span className="rounded-full border px-2 py-0.5 text-[10px] text-neutral-600">{it.sku}</span>
                          </div>
                          <div className="text-xs text-neutral-600">
                            Stock {Number(it.current_quantity ?? 0)}{"  "}
                            Price {it.price == null ? "N/A" : fmtMoney.format(it.price as number)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {archived ? (
                          <button className="text-xs text-indigo-600 hover:underline" onClick={(e) => { e.stopPropagation(); archiveOne(it.sku, "N"); }}>
                            - archive
                          </button>
                        ) : (
                          <button className="text-xs text-indigo-600 hover:underline" onClick={(e) => { e.stopPropagation(); archiveOne(it.sku, "Y"); }}>
                            + archive
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {uncat.nextCursor && <button className="btn text-sm mt-2" onClick={() => loadUncategorized({ cursor: uncat.nextCursor })}>Load more</button>}
          </div>
        )}

        {/* Category tree */}
        {roots.length === 0 ? (
          <p className="text-sm text-neutral-500 mt-4">No categories yet.</p>
        ) : (
          <ul className="space-y-2 mt-4">
            {roots.map(n => (
              <li key={n.category_id}>
                <CategoryBranch
                  node={n}
                  depth={0}
                  expanded={expanded}
                  onToggle={() => { toggleExpand(n.category_id); void loadItemsForCategory(n.category_id, { reset: true }); }}
                  childrenMap={children}
                  onOpenChild={(id) => { toggleExpand(id); void loadItemsForCategory(id, { reset: true }); }}
                  itemsByCat={itemsByCat}
                  onLoadMore={(id) => { const next = itemsByCat[id]?.nextCursor; if (next) void loadItemsForCategory(id, { cursor: next }); }}
                  sort={sort}
                  selectedSkus={selectedSkus}
                  onToggleSelect={toggleSelect}
                  onEditCategory={(node) => setEditCategory({ open: true, node })}
                  onHoverItem={ensureBreadcrumbFor}
                  breadcrumbs={breadcrumbsRef.current}
                  onArchiveToggle={(sku, to) => void archiveOne(sku, to)}
                  onOpenSingleEdit={(sku) => setSingleEdit({ open: true, sku })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mass edit modal */}
      {massOpen && (
        <MassEditModal
          selected={[...selectedSkus]}
          onClose={() => setMassOpen(false)}
          onDone={() => {
            setMassOpen(false);
            setSelectedSkus(new Set());
            Array.from(expanded).forEach(id => void loadItemsForCategory(id, { reset: true }));
            if (showUncat) void loadUncategorized({ reset: true });
          }}
        />
      )}

      {/* Category edit modal */}
      {editCategory.open && editCategory.node && (
        <CategoryEditModal
          node={editCategory.node}
          onClose={() => setEditCategory({ open: false })}
          onUpdated={async () => { setEditCategory({ open: false }); await loadRoots(); if (editCategory.node?.parent_category_id != null) await loadChildren(editCategory.node.parent_category_id); }}
        />
      )}

      {/* Add item */}
      {addOpen && (
        <Modal open={true} onClose={() => setAddOpen(false)} title="Add item">
          <AddItemForm
            onCancel={() => setAddOpen(false)}
            onSave={async (payload) => {
              await api(`/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
              setAddOpen(false);
              Array.from(expanded).forEach(id => void loadItemsForCategory(id, { reset: true }));
              if (showUncat) void loadUncategorized({ reset: true });
            }}
          />
        </Modal>
      )}

      {/* Single item edit */}
      {singleEdit.open && singleEdit.sku && (
        <Modal open={true} onClose={() => setSingleEdit({ open: false })} title={`Edit ${singleEdit.sku}`}>
          <SingleEditForm
            sku={singleEdit.sku}
            onCancel={() => setSingleEdit({ open: false })}
            onSaved={async () => {
              setSingleEdit({ open: false });
              Array.from(expanded).forEach(id => void loadItemsForCategory(id, { reset: true }));
              if (showUncat) void loadUncategorized({ reset: true });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/* ===== Category branch ===== */
function CategoryBranch(props: {
  node: CategoryNode; depth: number; expanded: Set<number>; onToggle: () => void;
  childrenMap: Record<number, CategoryNode[] | undefined>;
  onOpenChild: (id: number) => void;
  itemsByCat: Record<number, { rows: ItemDTO[]; nextCursor: string | null }>;
  onLoadMore: (catId: number) => void; sort: SortDir;
  selectedSkus: Set<string>; onToggleSelect: (sku: string) => void;
  onEditCategory: (node: CategoryNode) => void;
  onHoverItem: (sku: string) => void;
  breadcrumbs: Record<string, BreadcrumbPaths>;
  onArchiveToggle: (sku: string, to: "Y" | "N") => void;
  onOpenSingleEdit: (sku: string) => void;
}) {
  const { node, depth, expanded, onToggle, childrenMap, onOpenChild, itemsByCat, onLoadMore, sort,
    selectedSkus, onToggleSelect, onEditCategory, onHoverItem, breadcrumbs, onArchiveToggle, onOpenSingleEdit } = props;
  const open = expanded.has(node.category_id);
  const items = itemsByCat[node.category_id]?.rows ?? [];
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const A = (a.item_name || a.sku).toLowerCase(); const B = (b.item_name || b.sku).toLowerCase();
      return sort === "asc" ? A.localeCompare(B) : B.localeCompare(A);
    });
    return arr;
  }, [items, sort]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button className="btn px-2" onClick={onToggle} aria-label="Toggle">{open ? "▾" : "▸"}</button>
        <div className="flex items-center gap-2">
          <span style={{ paddingLeft: depth * 12 }} className="font-medium">{node.category_name}</span>
          {node.counts && <span className="rounded-full border px-2 py-0.5 text-xs text-neutral-600">{node.counts.direct}</span>}
          <button className="text-xs text-indigo-600 hover:underline" onClick={() => onEditCategory(node)}>edit</button>
        </div>
      </div>

      {open && (
        <div className="ml-6 mt-2 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-xs text-neutral-500">No items in this category.</p>
          ) : (
            <ul className="space-y-1">
              {sorted.map(it => {
                const archived = (it.archived ?? "N") === "Y";
                const crumbs = breadcrumbs[it.sku];
                return (
                  <li
                    key={it.sku}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${archived ? "opacity-60 grayscale" : ""}`}
                    onMouseEnter={() => onHoverItem(it.sku)}
                    title={crumbs ? crumbs.map(p => p.map(q => q.category_name).join(" > ")).join("\n") : ""}
                    onClick={() => onOpenSingleEdit(it.sku)}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        onClick={(e) => e.stopPropagation()}
                        checked={selectedSkus.has(it.sku)}
                        onChange={() => onToggleSelect(it.sku)}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{it.item_name || it.sku}</span>
                          <span className="rounded-full border px-2 py-0.5 text-[10px] text-neutral-600">{it.sku}</span>
                        </div>
                        <div className="text-xs text-neutral-600">
                          Stock {Number(it.current_quantity ?? 0)}{"  "}
                          Price {it.price == null ? "N/A" : fmtMoney.format(it.price as number)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {archived ? (
                        <button className="text-xs text-indigo-600 hover:underline" onClick={(e) => { e.stopPropagation(); onArchiveToggle(it.sku, "N"); }}>
                          - archive
                        </button>
                      ) : (
                        <button className="text-xs text-indigo-600 hover:underline" onClick={(e) => { e.stopPropagation(); onArchiveToggle(it.sku, "Y"); }}>
                          + archive
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {itemsByCat[node.category_id]?.nextCursor && (
            <button className="btn text-sm" onClick={() => onLoadMore(node.category_id)}>Load more</button>
          )}

          {childrenMap[node.category_id] && childrenMap[node.category_id]!.length > 0 && (
            <ul className="mt-2 space-y-2">
              {childrenMap[node.category_id]!.map(ch => (
                <li key={`${node.category_id}-${ch.category_id}`}>
                  <CategoryBranch
                    node={ch} depth={depth + 1} expanded={expanded}
                    onToggle={() => onOpenChild(ch.category_id)}
                    childrenMap={childrenMap} onOpenChild={onOpenChild}
                    itemsByCat={itemsByCat} onLoadMore={onLoadMore}
                    sort={sort} selectedSkus={selectedSkus} onToggleSelect={onToggleSelect}
                    onEditCategory={onEditCategory} onHoverItem={onHoverItem}
                    breadcrumbs={breadcrumbs} onArchiveToggle={onArchiveToggle}
                    onOpenSingleEdit={onOpenSingleEdit}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Mass edit modal, tagging, forms remain unchanged below ===== */
/* ... keep your existing MassEditModal, MassTag, PickerTree, PickerRow, MassFieldEdit, CategoryEditModal, AddItemForm, SingleEditForm components ... */


/* ===== Mass edit modal ===== */
function MassEditModal(props: { selected: string[]; onClose: () => void; onDone: () => void }) {
  const { selected, onClose, onDone } = props;
  const [tab, setTab] = useState<"tag" | "edit">("tag");
  return (
    <Modal open={true} onClose={onClose} title="Mass actions">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button className={`btn ${tab === "tag" ? "bg-neutral-900 text-white" : ""}`} onClick={() => setTab("tag")}>Tag</button>
          <button className={`btn ${tab === "edit" ? "bg-neutral-900 text-white" : ""}`} onClick={() => setTab("edit")}>Edit</button>
          <div className="ml-auto text-sm text-neutral-600">{selected.length} selected</div>
        </div>
        {tab === "tag" ? <MassTag selected={selected} onDone={onDone} /> : <MassFieldEdit selected={selected} onDone={onDone} />}
      </div>
    </Modal>
  );
}

/* ===== Tagging tab ===== */
function MassTag(props: { selected: string[]; onDone: () => void }) {
  const { selected, onDone } = props;
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [children, setChildren] = useState<Record<number, CategoryNode[] | undefined>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    (async () => {
      const d = await api<CategoriesResp>(`/categories`);
      const nodes: CategoryNode[] = (d.categories ?? []).map(c => ({
        category_id: c.category_id, category_name: c.category_name, parent_category_id: c.parent_category_id ?? null
      }));
      setTree(nodes);
    })();
  }, []);

  async function openNode(id: number) {
    setExpanded(s => new Set(s).add(id));
    if (!children[id]) {
      const d = await api<CategoriesResp>(`/categories?parent_id=${id}`);
      const nodes: CategoryNode[] = (d.categories ?? []).map(c => ({
        category_id: c.category_id, category_name: c.category_name, parent_category_id: c.parent_category_id ?? null
      }));
      setChildren(m => ({ ...m, [id]: nodes }));
    }
  }
  async function createChild() {
    if (!active || !newName.trim()) return;
    setCreating(true);
    try {
      await api(`/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_name: newName.trim(), parent_category_id: active }) });
      const d = await api<CategoriesResp>(`/categories?parent_id=${active}`);
      const nodes: CategoryNode[] = (d.categories ?? []).map(c => ({
        category_id: c.category_id, category_name: c.category_name, parent_category_id: c.parent_category_id ?? null
      }));
      setChildren(m => ({ ...m, [active]: nodes }));
      setNewName("");
    } finally { setCreating(false); }
  }
  async function attachOrDetach(action: "attach" | "detach") {
    if (!active) return;
    await api(`/categories/${active}/items/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, skus: selected }) });
    onDone();
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border p-3 max-h-72 overflow-auto">
        <ul className="space-y-2">
          {tree.map(n => (
            <li key={n.category_id}>
              <PickerRow node={n} depth={0} expanded={expanded.has(n.category_id)} onToggle={() => openNode(n.category_id)} onSelect={() => setActive(n.category_id)} activeId={active} />
              {expanded.has(n.category_id) && children[n.category_id] && (
                <PickerTree nodes={children[n.category_id]!} depth={1} expanded={expanded} childrenMap={children} onOpen={openNode} onSelect={(id) => setActive(id)} activeId={active} />
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2">
        <input className="input" placeholder="New child name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn" onClick={createChild} disabled={creating || !active || !newName.trim()}>New</button>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => attachOrDetach("detach")} disabled={!active}>Remove from category</button>
          <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => attachOrDetach("attach")} disabled={!active}>Add to category</button>
        </div>
      </div>
    </div>
  );
}
function PickerTree(props: { nodes: CategoryNode[]; depth: number; expanded: Set<number>; childrenMap: Record<number, CategoryNode[] | undefined>; onOpen: (id: number) => void; onSelect: (id: number) => void; activeId: number | null; }) {
  const { nodes, depth, expanded, childrenMap, onOpen, onSelect, activeId } = props;
  return (
    <ul className="space-y-2">
      {nodes.map(n => (
        <li key={`${depth}-${n.category_id}`}>
          <PickerRow node={n} depth={depth} expanded={expanded.has(n.category_id)} onToggle={() => onOpen(n.category_id)} onSelect={() => onSelect(n.category_id)} activeId={activeId} />
          {expanded.has(n.category_id) && childrenMap[n.category_id] && (
            <PickerTree nodes={childrenMap[n.category_id]!} depth={depth + 1} expanded={expanded} childrenMap={childrenMap} onOpen={onOpen} onSelect={onSelect} activeId={activeId} />
          )}
        </li>
      ))}
    </ul>
  );
}
function PickerRow(props: { node: CategoryNode; depth: number; expanded: boolean; onToggle: () => void; onSelect: () => void; activeId: number | null; }) {
  const { node, depth, expanded, onToggle, onSelect, activeId } = props;
  const active = activeId === node.category_id;
  return (
    <div className="flex items-center gap-2">
      <button className="btn px-2" onClick={onToggle} aria-label="Toggle">{expanded ? "▾" : "▸"}</button>
      <button className={`btn border ${active ? "bg-neutral-900 text-white" : ""}`} onClick={onSelect}>
        <span style={{ paddingLeft: depth * 12 }}>{node.category_name}</span>
      </button>
    </div>
  );
}

/* ===== Mass field edit ===== */
function MassFieldEdit(props: { selected: string[]; onDone: () => void }) {
  const { selected, onDone } = props;
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [qty, setQty] = useState("");
  const [openMore, setOpenMore] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({
    description: "", variation_name: "", online_sale_price: "",
    seo_title: "", seo_description: "", permalink: "", gtin: "",
    square_online_item_visibility: "", item_type: "",
    social_media_link_title: "", social_media_link_description: "",
    shipping_enabled: "", self_serve_ordering: "", delivery_enabled: "", pickup_enabled: "",
    sellable: "", contains_alcohol: "", stockable: "", skip_detail_screen_in_pos: "",
    option_name_1: "", option_value_1: "", stock_alert_enabled: "", stock_alert_count: "", modifier: "",
  });

  async function submit() {
    const patch: Record<string, any> = {};
    if (name.trim()) patch.item_name = name.trim();
    if (price.trim()) patch.price = Number(price);
    if (openMore) {
      for (const [k, v] of Object.entries(form)) {
        if (v.trim() !== "") patch[k] = ["online_sale_price", "stock_alert_count"].includes(k) ? Number(v) : v;
      }
    }
    const updates = props.selected.map(sku => ({
      sku,
      patch,
      current_quantity: qty.trim() === "" ? undefined : Number(qty),
    }));
    await api(`/items/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) });
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <input className="input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input className="input" type="number" step="0.01" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} />
        <input className="input" type="number" placeholder="Set absolute quantity" value={qty} onChange={e => setQty(e.target.value)} />
      </div>
      <div className="rounded-xl border">
        <button className="w-full px-3 py-2 text-left text-sm" onClick={() => setOpenMore(!openMore)}>More fields</button>
        {openMore && (
          <div className="border-t p-3 grid gap-2">
            {Object.keys(form).map(k => (
              <input key={k} className="input" placeholder={k} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={props.onDone}>Cancel</button>
        <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={submit}>Apply edits</button>
      </div>
    </div>
  );
}

/* ===== Category edit modal — full CRUD ===== */
function CategoryEditModal(props: {
  node: CategoryNode;
  onClose: () => void;
  onUpdated: () => void; // caller already reloads roots and siblings
}) {
  const { node, onClose, onUpdated } = props;

  const [name, setName] = useState(node.category_name);
  const [parentId, setParentId] = useState<number | null>(node.parent_category_id ?? null);

  // tree picker state for choosing a new parent
  const [roots, setRoots] = useState<CategoryNode[]>([]);
  const [children, setChildren] = useState<Record<number, CategoryNode[] | undefined>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  // create child
  const [newChild, setNewChild] = useState("");
  const [creating, setCreating] = useState(false);

  // delete
  const [cascade, setCascade] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // load roots for the parent picker
    (async () => {
      const d = await api<{ categories: Array<{ category_id: number; category_name: string; parent_category_id: number | null }> }>(`/categories`);
      const nodes: CategoryNode[] = (d.categories ?? []).map(c => ({
        category_id: c.category_id,
        category_name: c.category_name,
        parent_category_id: c.parent_category_id ?? null,
      }));
      setRoots(nodes);
    })();
  }, []);

  async function openNode(id: number) {
    setExpanded(s => new Set(s).add(id));
    if (!children[id]) {
      const d = await api<{ categories: Array<{ category_id: number; category_name: string; parent_category_id: number | null }> }>(`/categories?parent_id=${id}`);
      const nodes: CategoryNode[] = (d.categories ?? []).map(c => ({
        category_id: c.category_id,
        category_name: c.category_name,
        parent_category_id: c.parent_category_id ?? null,
      }));
      setChildren(m => ({ ...m, [id]: nodes }));
    }
  }

  function selectParent(newParentId: number | null) {
    // prevent selecting itself
    if (newParentId === node.category_id) return;
    setParentId(newParentId);
    setPickerOpen(false);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api(`/categories/${node.category_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_name: name.trim(),
          parent_category_id: parentId,
        }),
      });
      await onUpdated();
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function createChild() {
    if (!newChild.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      await api(`/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_name: newChild.trim(),
          parent_category_id: node.category_id,
        }),
      });
      setNewChild("");
      await onUpdated();
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function removeCategory() {
    if (!confirm("Delete this category? Items remain linked only if their links are in other categories. all of its child categories (and possibly related entries in link tables) are automatically deleted too.")) return;
    setDeleting(true);
    setErr(null);
    try {
      await api(`/categories/${node.category_id}?cascade=${cascade ? "1" : "0"}`, { method: "DELETE" });
      onClose();
      await onUpdated();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Edit category">
      <div className="space-y-5">
        {/* Rename */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} />
        </div>

        {/* Parent picker */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">Parent</label>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setPickerOpen(p => !p)}>
              {pickerOpen ? "Close picker" : "Choose parent"}
            </button>
            <button className="btn" onClick={() => selectParent(null)}>Set as root</button>
            <span className="text-sm text-neutral-600">
              {parentId == null ? "Root" : `Parent ID ${parentId}`}
            </span>
          </div>
          {pickerOpen && (
            <div className="rounded-xl border p-3 max-h-72 overflow-auto">
              <ul className="space-y-2">
                {/* Root pseudo-row */}
                <li>
                  <button
                    className={`btn border ${parentId == null ? "bg-neutral-900 text-white" : ""}`}
                    onClick={() => selectParent(null)}
                  >
                    Root
                  </button>
                </li>
                {roots.map(r => (
                  <li key={`root-${r.category_id}`}>
                    <div className="flex items-center gap-2">
                      <button className="btn px-2" onClick={() => openNode(r.category_id)} aria-label="Toggle">
                        {expanded.has(r.category_id) ? "▾" : "▸"}
                      </button>
                      <button
                        className={`btn border ${parentId === r.category_id ? "bg-neutral-900 text-white" : ""}`}
                        onClick={() => selectParent(r.category_id)}
                        disabled={r.category_id === node.category_id}
                      >
                        {r.category_name}
                      </button>
                    </div>
                    {expanded.has(r.category_id) && children[r.category_id] && (
                      <PickerTree
                        nodes={children[r.category_id]!}
                        depth={1}
                        expanded={expanded}
                        childrenMap={children}
                        onOpen={openNode}
                        onSelect={(id) => selectParent(id)}
                        activeId={parentId}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Create child */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">Create child</label>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Child name" value={newChild} onChange={e => setNewChild(e.target.value)} />
            <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={createChild} disabled={creating || !newChild.trim()}>
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input id="cascade" type="checkbox" checked={cascade} onChange={e => setCascade(e.target.checked)} />
            <label htmlFor="cascade" className="text-sm">Cascade on delete</label>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose} disabled={saving || deleting}>Close</button>
            <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn border border-red-600 text-red-700 hover:bg-red-50" onClick={removeCategory} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}


/* ===== Add item and single edit ===== */
function AddItemForm(props: {
  onCancel: () => void;
  onSave: (p: {
    sku: string;
    item_name: string;
    description?: string | null;
    current_quantity?: number;
    price?: number | null;
    online_sale_price?: number | null;
  }) => Promise<void>;
}) {
  const { onCancel, onSave } = props;

  const [f, setF] = useState({
    sku: "",
    item_name: "",
    description: "",
    qty: "",
    price: "",
    online_sale_price: "",
  });

  // Auto SKU controls
  const [autoSku, setAutoSku] = useState(true);
  const [seedMode, setSeedMode] = useState<"name" | "custom">("name");
  const [seedInput, setSeedInput] = useState("");
  const counterRef = useRef(0);

  // compute current seed
  const seed = useMemo(() => {
    if (seedMode === "custom" && seedInput.trim()) return clampSeed(seedInput);
    return clampSeed(f.item_name);
  }, [seedMode, seedInput, f.item_name]);

  // regenerate SKU when auto mode or seed changes
  useEffect(() => {
    if (!autoSku) return;
    setF((cur) => ({ ...cur, sku: formatSku(seed, counterRef.current) }));
  }, [autoSku, seed]);

  // simple increment helper
  const bumpSku = () => {
    counterRef.current = (counterRef.current + 1) % 10000;
    const next = formatSku(seed, counterRef.current);
    setF((cur) => ({ ...cur, sku: next }));
    return next;
  };

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setErr(null);

        // ensure SKU present
        let sku = f.sku.trim().toUpperCase();
        if (autoSku && !/^[A-Z]{3}\d{4}$/.test(sku)) {
          sku = formatSku(seed, counterRef.current);
          setF((cur) => ({ ...cur, sku }));
        }

        const payload = {
          sku,
          item_name: f.item_name.trim(),
          description: f.description.trim() || null,
          current_quantity: f.qty ? Number(f.qty) : 0,
          price: f.price ? Number(f.price) : null,
          online_sale_price: f.online_sale_price ? Number(f.online_sale_price) : null,
        };

        try {
          // try up to 5 times on duplicate
          const MAX_TRIES = 5;
          for (let i = 0; i < MAX_TRIES; i++) {
            try {
              await onSave(payload);
              setSaving(false);
              return;
            } catch (e: any) {
              // detect duplicate by status if available or by message text
              const status = e?.status ?? e?.response?.status;
              const msg = String(e?.message || "");
              const isConflict = status === 409 || /already exists|duplicate|conflict/i.test(msg);
              if (autoSku && isConflict) {
                payload.sku = i === 0 ? nextSku(payload.sku) : bumpSku();
                continue;
              }
              throw e;
            }
          }
          // final attempt bump once more
          payload.sku = bumpSku();
          await onSave(payload);
        } catch (e: any) {
          setErr(e?.message || "Failed to add item");
        } finally {
          setSaving(false);
        }
      }}
      className="grid gap-3"
    >
      {/* Auto SKU controls */}
      <div className="rounded-xl border p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={autoSku}
            onChange={(ev) => setAutoSku(ev.target.checked)}
          />
          Auto generate SKU (AAA0000)
        </label>

        <div className={`grid gap-2 ${autoSku ? "opacity-100" : "opacity-50"}`}>
          <div className="flex items-center gap-4">
            <span className="text-sm">Seed</span>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="seedMode"
                checked={seedMode === "name"}
                onChange={() => setSeedMode("name")}
              />
              From name
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="seedMode"
                checked={seedMode === "custom"}
                onChange={() => setSeedMode("custom")}
              />
              Custom
            </label>
            <input
              className="input w-24"
              placeholder="ABC"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              disabled={seedMode !== "custom"}
            />
          </div>
          <div className="text-xs text-neutral-600">
            Seed uses first three letters. Non letters are removed.
          </div>
        </div>
      </div>

      <input
        className="input"
        placeholder="SKU"
        value={f.sku}
        onChange={(e) => setF({ ...f, sku: e.target.value.toUpperCase() })}
        required
        disabled={autoSku}
      />
      <input
        className="input"
        placeholder="Name"
        value={f.item_name}
        onChange={(e) => setF({ ...f, item_name: e.target.value })}
        required
      />
      <textarea
        className="input"
        placeholder="Description"
        value={f.description}
        onChange={(e) => setF({ ...f, description: e.target.value })}
      />
      <div className="grid grid-cols-3 gap-3">
        <input
          className="input"
          type="number"
          placeholder="Qty"
          value={f.qty}
          onChange={(e) => setF({ ...f, qty: e.target.value })}
        />
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="Price"
          value={f.price}
          onChange={(e) => setF({ ...f, price: e.target.value })}
        />
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="Online sale price"
          value={f.online_sale_price}
          onChange={(e) => setF({ ...f, online_sale_price: e.target.value })}
        />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving} type="submit">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function SingleEditForm(props: { sku: string; onCancel: () => void; onSaved: () => void }) {
  const { sku, onCancel, onSaved } = props;
  const [base, setBase] = useState<{ item_name: string; description: string; price: string }>(
    { item_name: "", description: "", price: "" }
  );
  const [qtyDelta, setQtyDelta] = useState<string>("");
  const [qtyAbs, setQtyAbs] = useState<string>("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [more, setMore] = useState<Record<string, string>>({
    online_sale_price: "", variation_name: "",
    seo_title: "", seo_description: "", permalink: "", gtin: "",
    square_online_item_visibility: "", item_type: "",
    social_media_link_title: "", social_media_link_description: "",
    shipping_enabled: "", self_serve_ordering: "", delivery_enabled: "", pickup_enabled: "",
    sellable: "", contains_alcohol: "", stockable: "", skip_detail_screen_in_pos: "",
    option_name_1: "", option_value_1: "", stock_alert_enabled: "", stock_alert_count: "", modifier: "",
  });
  const [err, setErr] = useState<string | null>(null); const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const it = await api<ItemDTO>(`/items/${encodeURIComponent(sku)}`);
        setBase({
          item_name: it.item_name ?? "",
          description: it.description ?? "",
          price: it.price == null ? "" : String(it.price),
        });
        setMore(m => ({ ...m, online_sale_price: (it.online_sale_price == null ? "" : String(it.online_sale_price)) }));
      } catch (e: any) { setErr(e?.message || "Failed to load item"); }
    })();
  }, [sku]);

  async function submit() {
    setSaving(true); setErr(null);
    try {
      const patch: Record<string, any> = {};
      if (base.item_name.trim()) patch.item_name = base.item_name.trim();
      patch.description = base.description;
      if (base.price.trim()) patch.price = Number(base.price);
      if (moreOpen) {
        for (const [k, v] of Object.entries(more)) {
          if (v.trim() !== "") patch[k] = ["online_sale_price", "stock_alert_count"].includes(k) ? Number(v) : v;
        }
      }
      if (qtyAbs.trim() !== "") patch.current_quantity = Number(qtyAbs);
      else if (qtyDelta.trim() !== "") patch.quantityDelta = Number(qtyDelta);

      await api(`/items/${encodeURIComponent(sku)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      onSaved();
    } catch (e: any) { setErr(e?.message || "Failed to update item"); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
      <input className="input" placeholder="Name" value={base.item_name} onChange={e => setBase({ ...base, item_name: e.target.value })} />
      <textarea className="input" placeholder="Description" value={base.description} onChange={e => setBase({ ...base, description: e.target.value })} />
      <div className="grid grid-cols-3 gap-3">
        <input className="input" type="number" step="0.01" placeholder="Price" value={base.price} onChange={e => setBase({ ...base, price: e.target.value })} />
        <input className="input" type="number" placeholder="Δ quantity" value={qtyDelta} onChange={e => { setQtyDelta(e.target.value); setQtyAbs(""); }} />
        <input className="input" type="number" placeholder="Set absolute qty" value={qtyAbs} onChange={e => { setQtyAbs(e.target.value); setQtyDelta(""); }} />
      </div>
      <div className="rounded-xl border">
        <button className="w-full px-3 py-2 text-left text-sm" type="button" onClick={() => setMoreOpen(!moreOpen)}>More fields</button>
        {moreOpen && (
          <div className="border-t p-3 grid gap-2">
            {Object.keys(more).map(k => (
              <input key={k} className="input" placeholder={k} value={more[k]} onChange={e => setMore({ ...more, [k]: e.target.value })} />
            ))}
          </div>
        )}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
