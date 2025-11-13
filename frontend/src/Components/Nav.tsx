// src/components/Nav.tsx
import { NavLink } from "react-router-dom";
import { useAuth } from "../Components/auth/useAuth";

export default function Nav() {
  const link =
    "px-3 py-2 rounded-full border text-sm hover:bg-neutral-100 transition";
  const active = "bg-neutral-900 text-white";
  const { loggedIn, user } = useAuth();
  const label = loggedIn
    ? user?.squareUsername || user?.email || "Account"
    : "Login";

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        {/* Left: Logo + Company Name */}
        <NavLink to="/" className="flex items-center gap-2">
          <img
            src="/Logo.png"
            alt="Kumo Consulting Logo"
            className="h-8 w-auto"
          />
          <span className="font-semibold text-lg tracking-wide">
            Kumo Consulting
          </span>
        </NavLink>

        {/* Center: Main Nav (only when logged in) */}
        {loggedIn && (
          <nav className="flex-1 flex justify-center items-center gap-3">
{/*  REMOVED / parking lot          
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `${link} ${isActive ? active : ""}`
              }
            >
              Dashboard
            </NavLink> */}
            <NavLink
              to="/inventory"
              className={({ isActive }) =>
                `${link} ${isActive ? active : ""}`
              }
            >
              Inventory
            </NavLink>
{/*  REMOVED/ redundant with log page           
            <NavLink
              to="/sales"
              className={({ isActive }) =>
                `${link} ${isActive ? active : ""}`
              }
            >
              Sales
            </NavLink> */}
            <NavLink
              to="/logs"
              className={({ isActive }) =>
                `${link} ${isActive ? active : ""}`
              }
            >
              Logs
            </NavLink>
            <NavLink
              to="/csv"
              className={({ isActive }) =>
                `${link} ${isActive ? active : ""}`
              }
            >
              CSV Import
            </NavLink>
          </nav>
        )}

        {/* Right: Settings/Login */}
        <div className="flex items-center gap-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `px-3 py-2 rounded-full border text-sm hover:bg-neutral-100 transition flex items-center gap-2 ${
                isActive ? "bg-neutral-900 text-white" : ""
              }`
            }
          >
            <span>{label}</span>
            <span aria-hidden>⚙️</span>
          </NavLink>
        </div>
      </div>
    </header>
  );
}
