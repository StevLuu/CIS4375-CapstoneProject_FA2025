import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const mockData = [
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

export default function SubInventory() {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Sub-Inventory</h1>
      <p className="text-neutral-500">
        Nested categories showing product groups and sub-items. (Mock data)
      </p>

      <div className="space-y-4">
        {mockData.map((group, idx) => (
          <div
            key={idx}
            className="bg-white border rounded-2xl shadow-sm overflow-hidden"
          >
            <button
              onClick={() =>
                setOpenCategory(openCategory === group.category ? null : group.category)
              }
              className="w-full text-left px-5 py-4 font-semibold flex justify-between items-center hover:bg-neutral-50 transition"
            >
              <span>{group.category}</span>
              <span className="text-neutral-400">
                {openCategory === group.category ? "−" : "+"}
              </span>
            </button>

            <AnimatePresence>
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
                            className={`py-2 font-medium ${
                              item.stock <= 5
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
  );
}
