import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authApi } from "../api/auth";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  organization: { id: number; name: string; branding: any };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("rforms_user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    localStorage.setItem("rforms_token", res.data.token);
    localStorage.setItem("rforms_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem("rforms_token");
    localStorage.removeItem("rforms_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
