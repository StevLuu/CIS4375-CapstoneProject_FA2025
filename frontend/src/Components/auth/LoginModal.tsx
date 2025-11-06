import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../ui/Modal";
import { api } from "../../lib/api";

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api<void>("/auth/login", { json: { email, password } });
  
      window.location.assign("/");
    } catch (err: any) {
      const msg = err?.message || "Login failed";
      setError(msg);
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Login">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            placeholder="email@kumo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mt-1 w-full dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="***"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-1 w-full dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600" role="alert">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-green-600 px-5 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Login"}
        </button>
      </form>
    </Modal>
  );
}