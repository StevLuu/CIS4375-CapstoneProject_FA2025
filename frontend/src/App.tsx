import { BrowserRouter, Routes, Route } from "react-router-dom";
import Nav from "./Components/Nav";
import Home from "./Page/Home";
import Dashboard from "./Page/Dashboard";
import Inventory from "./Page/Inventory";
import Sales from "./Page/Sales";
import CSV from "./Page/CSV";
import Settings from "./Page/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white text-neutral-900">
        <Nav />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/csv" element={<CSV />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
        <footer className="py-10 text-center text-sm text-neutral-500">
          Clickable prototype · No backend
        </footer>
      </div>
    </BrowserRouter>
  );
}
