import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { PortfolioProvider } from './contexts/PortfolioContext';
import { Toaster } from 'sonner';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PortfolioViewPage = lazy(() => import('./pages/PortfolioViewPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export interface AuthContextType {
  user: User | null;
  loading: boolean;
}

interface User {
  id: string;
  email: string;
  name?: string;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AuthProvider>
          <ThemeProvider>
            <PortfolioProvider>
              <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
                <Toaster 
                  position="top-right"
                  toastOptions={{
                    classNames: {
                      toast: "group toast group-[.toaster]:bg-background/95 group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg backdrop-blur-sm",
                      description: "group-[.toast]:text-muted-foreground",
                      actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
                      cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
                    },
                  }}
                />
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    <Route path="/" element={
                      <PublicRoute>
                        <div className="relative">
                          <Header />
                          <LandingPage />
                        </div>
                      </PublicRoute>
                    } />
                    <Route path="/dashboard/*" element={
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/portfolio/:portfolioId" element={
                      <ProtectedRoute>
                        <PortfolioViewPage />
                      </ProtectedRoute>
                    } />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </div>
            </PortfolioProvider>
          </ThemeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </Router>
  );
}

export default App;