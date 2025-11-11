import { useState } from "react";
import Modal from "../ui/Modal";
import { api } from "../../lib/api";

type SignupModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function SignupModal({ open, onClose, onSuccess }: SignupModalProps) {
  const [email, setEmail] = useState("");
  const [squareUsername, setSquareUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      const msg = "Passwords do not match";
      setError(msg);
      alert(msg);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api<void>("/auth/signup", {json: { email, password, squareUsername: squareUsername || null },});
      onClose();
      onSuccess?.(); // parent will open Login modal
    } catch (err: any) {
      const msg = err?.message || "Signup failed";
      setError(msg);
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create account">
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
            Square Username <span className="text-neutral-500 text-xs">(optional)</span>
          </label>
          <input
            type="text"
            autoComplete="off"
            placeholder="Xiiyta"
            value={squareUsername}
            onChange={(e) => setSquareUsername(e.target.value)}
            className="input mt-1 w-full dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="***"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-1 w-full dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Confirm password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="***"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
          className="w-full rounded-xl bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
    </Modal>
  );
}
