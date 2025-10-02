// src/components/Nav.tsx
import { NavLink } from "react-router-dom";

export default function Nav() {
  const link =
    "px-3 py-2 rounded-full border text-sm hover:bg-neutral-100 transition";
  const active = "bg-neutral-900 text-white";

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        {/* Left: Logo + Company Name */}
        <NavLink to="/" className="flex items-center gap-2">
          {/* Replace black circle with logo */}
          <img
            src="/Logo.png"  // put your file in /public as "Logo.png"
            alt="Kumo Consulting Logo"
            className="h-8 w-auto"
          />
          <span className="font-semibold text-lg tracking-wide">
            Kumo Consulting
          </span>
        </NavLink>

        {/* Center: Main Nav */}
        <nav className="mx-auto flex items-center gap-3">
          <NavLink to="/dashboard" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
            Dashboard
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
            Inventory
          </NavLink>
          <NavLink to="/sales" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
            Sales
          </NavLink>
          <NavLink to="/csv" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
            CSV Import
          </NavLink>
        </nav>

        {/* Right: Settings only */}
        <div className="flex items-center gap-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${link} flex items-center gap-2 ${isActive ? active : ""}`
            }
          >
            <span>Settings</span>
            <span aria-hidden>⚙️</span>
          </NavLink>
        </div>
      </div>
    </header>
  );
}
