import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { isDevAuthBypassEnabled } from "@/const";

interface AuthContextType {
  isAuthenticated: boolean;
  isDevBypass: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const devBypass = isDevAuthBypassEnabled();
  const [isAuthenticated, setIsAuthenticated] = useState(devBypass);

  useEffect(() => {
    if (devBypass) {
      setIsAuthenticated(true);
      return;
    }
    const stored = localStorage.getItem("auth_token");
    if (stored === "authenticated") {
      setIsAuthenticated(true);
    }
  }, [devBypass]);

  const login = (username: string, password: string): boolean => {
    if (username === "edone" && password === "TJ2026") {
      localStorage.setItem("auth_token", "authenticated");
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    if (devBypass) return;
    localStorage.removeItem("auth_token");
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isDevBypass: devBypass, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
