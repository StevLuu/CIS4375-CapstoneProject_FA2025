// src/pages/Sales.tsx
import { useState, useEffect } from "react";
import { useAuth } from "../Components/auth/useAuth";
import { LoginModal } from "../Components/auth/LoginModal";

export default function Sales() {
  const { loggedIn, user, refresh } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!loggedIn || !user?.email) setShowLogin(true);
  }, [loggedIn, user]);

  return (
    <div className="space-y-10">

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={async () => {
          setShowLogin(false);
          await refresh();
        }}
      />
      
      <h1 className="text-2xl font-bold">Sales Page</h1>
    </div>
  );
}
