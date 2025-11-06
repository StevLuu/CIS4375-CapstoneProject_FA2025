// src/Page/Inventory.tsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";


const mockItems = [
  { sku: "A001", name: "Glitter Keychain", stock: 12, price: 5 },
  { sku: "A002", name: "Sticker Pack", stock: 30, price: 3.5 },
  { sku: "A003", name: "Acrylic Charm", stock: 8, price: 7 },
  { sku: "A004", name: "Print Set", stock: 15, price: 10 },
  { sku: "A005", name: "Enamel Pin", stock: 5, price: 9 },
];

const mockCategories = [
  {
    category: "Stickers",
    sub: [
      { name: "Holo Stickers", stock: 20, price: 3 },
      { name: "Matte Stickers", stock: 15, price: 2.5 },
    ],
  },
  {
    category: "Keychains",
    sub: [
      { name: "Acrylic Keychains", stock: 12, price: 5 },
      { name: "Resin Keychains", stock: 8, price: 6 },
    ],
  },
  {
    category: "Prints",
    sub: [
      { name: "A4 Prints", stock: 10, price: 10 },
      { name: "Mini Prints", stock: 25, price: 6 },
    ],
  },
];

export default function Inventory() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!loggedIn || !user?.email) setShowLogin(true);
  }, [loggedIn, user]);
  
  const [search, setSearch] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const filtered = mockItems.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase())
  );



  return (


    <div className="space-y-10">
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
        }}
      />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Inventory</h1>
        <p className="text-neutral-500 mt-1">
          View all products or expand categories below.
        </p>
      </div>

      {/* Search Bar */}
      <div>
        <input
          type="text"
          placeholder="Search by item or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input md:w-1/2"
        />
      </div>

      {/* Flat Inventory Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-4">All Items</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <div
              key={item.sku}
              className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{item.name}</h2>
                <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-full">
                  {item.sku}
                </span>
              </div>
              <p className="text-sm text-neutral-600 mb-2">
                Stock:{" "}
                <span
                  className={`font-medium ${item.stock <= 5 ? "text-red-600" : "text-green-600"
                    }`}
                >
                  {item.stock}
                </span>
              </p>
              <p className="text-sm text-neutral-600 mb-4">
                Price: ${item.price.toFixed(2)}
              </p>
              <button className="btn text-sm bg-indigo-600 text-white hover:bg-indigo-700">
                View Details
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Inventory Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4">By Category</h2>
        <div className="space-y-4">
          {mockCategories.map((group, idx) => (
            <div
              key={idx}
              className="bg-white border rounded-2xl shadow-sm overflow-hidden"
            >
              <button
                onClick={() =>
                  setOpenCategory(
                    openCategory === group.category ? null : group.category
                  )
                }
                className="w-full text-left px-5 py-4 font-semibold flex justify-between items-center hover:bg-neutral-50 transition"
              >
                <span>{group.category}</span>
                <span className="text-neutral-400">
                  {openCategory === group.category ? "−" : "+"}
                </span>
              </button>

              <AnimatePresence>
                //TODO: when opening other dropdowns don't close previous
                {openCategory === group.category && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="px-5 pb-4"
                  >
                    <table className="w-full text-sm">
                      <thead className="border-b text-left">
                        <tr>
                          <th className="py-2">Item</th>
                          <th className="py-2">Stock</th>
                          <th className="py-2">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.sub.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b last:border-0 hover:bg-neutral-50 transition"
                          >
                            <td className="py-2">{item.name}</td>
                            <td
                              className={`py-2 font-medium ${item.stock <= 5
                                ? "text-red-600"
                                : "text-green-600"
                                }`}
                            >
                              {item.stock}
                            </td>
                            <td className="py-2">${item.price.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
