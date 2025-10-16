// src/pages/Dashboard.tsx

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "Mon", sales: 120 },
  { name: "Tue", sales: 190 },
  { name: "Wed", sales: 130 },
  { name: "Thu", sales: 220 },
  { name: "Fri", sales: 170 },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Vendor Dashboard</h1>
      <p className="text-neutral-500">
        Snapshot of weekly performance. (Mock data for presentation)
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-neutral-500">Total Sales</p>
          <h2 className="text-2xl font-semibold">$12,430</h2>
        </div>
        <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-neutral-500">Items in Stock</p>
          <h2 className="text-2xl font-semibold">328</h2>
        </div>
        <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-neutral-500">Low Stock Alerts</p>
          <h2 className="text-2xl font-semibold text-red-500">5</h2>
        </div>
      </div>

      {/* Simple bar chart */}
      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Weekly Sales</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="sales" fill="#6366F1" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
