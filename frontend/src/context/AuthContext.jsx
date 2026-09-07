import { createContext, useContext, useEffect, useState, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rp_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Terjadi kesalahan. Silakan coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = checking session, false = unauthenticated, object = user
  const [user, setUser] = useState(null);

  useEffect(() => {
    const check = async () => {
      const token = localStorage.getItem("rp_access_token");
      if (!token) {
        setUser(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        try {
          const { data } = await api.post("/auth/refresh");
          localStorage.setItem("rp_access_token", data.access_token);
          const me = await api.get("/auth/me");
          setUser(me.data);
        } catch {
          localStorage.removeItem("rp_access_token");
          setUser(false);
        }
      }
    };
    check();
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem("rp_access_token", data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // cookie may already be gone
    }
    localStorage.removeItem("rp_access_token");
    setUser(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
