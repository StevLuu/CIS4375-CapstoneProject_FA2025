import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";

export default function Home() {
  return (
    <div className="text-center space-y-10 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <img
          src="/Logo.png"
          alt="Kumo Consulting"
          className="mx-auto h-24 mb-6"
        />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Xiiyta Inventory Management System
        </h1>
        <p className="text-neutral-500 max-w-xl mx-auto mt-4">
          A cloud-based platform that helps small businesses like{" "}
          <span className="font-semibold text-neutral-800">Xiiyta</span> manage
          inventory across Etsy, Square, and in-person markets.
        </p>
      </motion.div>

      <motion.div
        className="flex justify-center gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <NavLink
          to="/dashboard"
          className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          View Dashboard
        </NavLink>
        <NavLink
          to="/inventory"
          className="px-6 py-3 rounded-xl border text-sm font-medium hover:bg-neutral-50 transition"
        >
          Explore Inventory
        </NavLink>
      </motion.div>

      <motion.div
        className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto pt-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        {[
          {
            title: "Centralized Inventory",
            text: "Combine Etsy, Square, and in-person sales into one dashboard.",
          },
          {
            title: "Real-Time Updates",
            text: "Quick entry and CSV imports keep stock levels synced.",
          },
          {
            title: "Vendor Insights",
            text: "Visualize trends and low-stock alerts with clear analytics.",
          },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition text-left"
          >
            <h3 className="font-semibold text-lg mb-2">{card.title}</h3>
            <p className="text-sm text-neutral-600">{card.text}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
