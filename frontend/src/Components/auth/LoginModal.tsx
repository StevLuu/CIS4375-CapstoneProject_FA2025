import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../ui/Modal";
import { api } from "../../lib/api";
import { SignupModal } from "../auth/SignupModal";

export function LoginModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSignup, setShowSignup] = useState(false); // local toggle

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api<void>("/auth/login", { json: { email, password } });
      onClose();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Login failed");
      alert(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Login">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email field */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1 w-full dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            />
          </div>

          {/* Password field */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1 w-full dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-green-600 px-5 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {submitting ? "Logging in..." : "Login"}
          </button>

          {/* Footer link */}
          <div className="text-center text-sm text-neutral-600 dark:text-neutral-300">
            No account?{" "}
            <button
              type="button"
              onClick={() => {
                onClose(); // close login
                setShowSignup(true); // open signup
              }}
              className="underline underline-offset-2 hover:no-underline"
            >
              Create an account
            </button>
          </div>
        </form>
      </Modal>

      {/* Nested Signup Modal */}
      <SignupModal
        open={showSignup}
        onClose={() => setShowSignup(false)}
        onSuccess={() => {
          setShowSignup(false);
          // optionally re-open login automatically:
          setTimeout(() => {
            // reopen login for immediate login
          }, 300);
        }}
      />
    </>
  );
}
