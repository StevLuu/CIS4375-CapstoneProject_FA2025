import { useState } from "react";
import { motion } from "framer-motion";

const mockLogs = [
  {
    id: 1,
    time: "2025-10-06 14:32",
    type: "CSV Import",
    detail: "Etsy_Inventory_Oct.csv imported successfully (52 items).",
    status: "Success",
  },
  {
    id: 2,
    time: "2025-10-05 18:10",
    type: "Manual Update",
    detail: "Inventory adjusted: Enamel Pins +3",
    status: "Success",
  },
  {
    id: 3,
    time: "2025-10-04 09:22",
    type: "System Alert",
    detail: "Low stock detected: Acrylic Charms (5 left)",
    status: "Warning",
  },
  {
    id: 4,
    time: "2025-10-03 20:00",
    type: "CSV Import",
    detail: "Square_Sales_Export.csv failed validation (missing SKU column).",
    status: "Error",
  },
];

export default function Logs() {
  const [filter, setFilter] = useState("All");

  const filteredLogs =
    filter === "All"
      ? mockLogs
      : mockLogs.filter((log) => log.status === filter);

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <h1 className="text-3xl font-semibold">System Logs</h1>
      <p className="text-neutral-500">
        Recent system activity, imports, and updates. (Demo data)
      </p>

      {/* Filter buttons */}
      <div className="flex gap-2">
        {["All", "Success", "Warning", "Error"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
              filter === status
                ? "bg-indigo-600 text-white"
                : "hover:bg-neutral-100"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Log table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Time</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Detail</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr
                key={log.id}
                className="border-b last:border-0 hover:bg-neutral-50 transition"
              >
                <td className="px-4 py-3 text-neutral-600">{log.time}</td>
                <td className="px-4 py-3">{log.type}</td>
                <td className="px-4 py-3 text-neutral-700">{log.detail}</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    log.status === "Success"
                      ? "text-green-600"
                      : log.status === "Warning"
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {log.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}