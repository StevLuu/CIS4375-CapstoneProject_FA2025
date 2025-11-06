import { useState, useEffect } from "react";
import { LoginModal } from "../Components/auth/LoginModal";
import { SignupModal } from "../Components/auth/SignupModal";
import { api } from "../lib/api";
import { useAuth } from "../Components/auth/useAuth";

export default function Settings() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const { loggedIn, refresh } = useAuth();

  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  async function handleLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
      await refresh(); // update local auth state without extra DB reads
      alert("Logged out");
    } catch (err: any) {
      alert(err?.message || "Logout failed");
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <div className="max-w-lg space-y-6 rounded-2xl border p-6 shadow-sm bg-white dark:bg-neutral-900 dark:border-neutral-800">
        {/* Theme */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-700 dark:text-neutral-200">Theme</span>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="btn bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
          </button>
        </div>

        {/* Auth actions */}
        {loggedIn ? (
          <button
            onClick={handleLogout}
            className="rounded-xl bg-red-600 px-5 py-2 font-medium text-white transition hover:bg-red-700"
          >
            Logout
          </button>
        ) : (
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-xl bg-green-600 px-5 py-2 font-medium text-white transition hover:bg-green-700"
            >
              Login
            </button>
            <button
              onClick={() => setShowSignup(true)}
              className="rounded-xl bg-neutral-800 px-5 py-2 font-medium text-white transition hover:bg-black"
            >
              Create User
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          // your LoginModal already redirects to "/"
          await refresh(); // safe if you remove redirect later
        }}
      />
      <SignupModal
        open={showSignup}
        onClose={() => setShowSignup(false)}
        onSuccess={() => {
          setShowSignup(false);
          setShowLogin(true); // prompt to log in after signup
        }}
      />
    </div>
  );
}
