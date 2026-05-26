import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-600">Cargando sesión…</p>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoadingScreen />;
  return isAuthenticated ? <Component /> : <Login />;
}

function LoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) return <AuthLoadingScreen />;
  if (isAuthenticated) return null;
  return <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={LoginRoute} />
      <Route path={"/"} component={() => <ProtectedRoute component={Home} />} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DevAuthBypassBanner() {
  const { isDevBypass } = useAuth();
  if (!isDevBypass) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        padding: "8px 12px",
        borderRadius: 8,
        background: "#fff3cd",
        border: "1px solid #ffc107",
        fontSize: 12,
        fontWeight: 600,
        color: "#664d03",
      }}
    >
      DEV: login bypass activo — quitar VITE_DEV_BYPASS_AUTH antes de prod
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Router />
            <DevAuthBypassBanner />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
