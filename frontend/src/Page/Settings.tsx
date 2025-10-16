// src/pages/Settings.tsx
import { useState, useEffect } from "react";

export default function Settings() {
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "light"
  );

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <div className="bg-white dark:bg-neutral-900 border dark:border-neutral-800 rounded-2xl p-6 shadow-sm max-w-lg space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Business Name
          </label>
          <input
            type="text"
            placeholder="Xiiyta"
            className="input dark:bg-neutral-800 dark:border-neutral-700 dark:text-white mt-1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Owner Email
          </label>
          <input
            type="email"
            placeholder="owner@xiiyta.com"
            className="input dark:bg-neutral-800 dark:border-neutral-700 dark:text-white mt-1"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-700 dark:text-neutral-200">
            Theme
          </span>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="btn bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
          </button>
        </div>

        <div className="pt-6">
          <button className="px-5 py-2 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
