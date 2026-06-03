import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import client from "../api/client";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  organization: { id: number; name: string; branding: any };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("rforms_customer_token");
    const storedUser  = localStorage.getItem("rforms_customer_user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await client.post("/auth/login", { email, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem("rforms_customer_token", t);
    localStorage.setItem("rforms_customer_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("rforms_customer_token");
    localStorage.removeItem("rforms_customer_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
