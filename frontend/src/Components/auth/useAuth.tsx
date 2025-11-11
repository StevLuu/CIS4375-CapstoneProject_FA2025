import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../../lib/api";

type User = { email: string; squareUsername: string | null };
type AuthContextType = { loggedIn: boolean; user?: User; refresh: () => Promise<void> };

const AuthContext = createContext<AuthContextType>({ loggedIn: false, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<User | undefined>(undefined);

  const refresh = async () => {
    try {
      const r = await api<{ loggedIn: true; user: User }>("/auth/me");
      setLoggedIn(true);
      setUser(r.user);
    } catch {
      setLoggedIn(false);
      setUser(undefined);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <AuthContext.Provider value={{ loggedIn, user, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
