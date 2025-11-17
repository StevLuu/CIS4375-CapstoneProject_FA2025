import { BrowserRouter, Routes, Route } from "react-router-dom";
import Nav from "./Components/Nav";
import Home from "./Page/Home";
import Dashboard from "./Page/Dashboard";
import Inventory from "./Page/Inventory";
import Sales from "./Page/Sales";
import CSV from "./Page/CSV";
import Logs from "./Page/Logs";
import Settings from "./Page/Settings";
import SplashScreen from "./Components/SplashScreen";


export default function App() {
  return (
    <>
      <SplashScreen />
      <BrowserRouter>
        <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
          <Nav />
          <div className="mx-auto max-w-6xl px-4 py-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/csv" element={<CSV />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
          <footer className="py-10 text-center text-sm text-neutral-400 border-t bg-white/60 backdrop-blur">
            © 2025 Kumo Consulting · Group 17 Capstone Project · University of Houston
          </footer>
        </div>
      </BrowserRouter>
    </>
  );
}
