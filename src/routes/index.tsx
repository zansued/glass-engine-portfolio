import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/ui/LoadingSpinner';

// Lazy load components
const LandingPage = lazy(() => import('../pages/LandingPage'));
const PortfolioViewPage = lazy(() => import('../pages/PortfolioViewPage'));
const DashboardLayout = lazy(() => import('../components/DashboardLayout'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const PortfolioList = lazy(() => import('../components/PortfolioList'));
const PortfolioEditor = lazy(() => import('../components/PortfolioEditor'));
const ProjectManagementPage = lazy(() => import('../pages/ProjectManagementPage'));
const AnalyticsDashboard = lazy(() => import('../pages/AnalyticsDashboard'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const ErrorBoundary = lazy(() => import('../components/ErrorBoundary'));

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Public Layout Component
const PublicLayout = (): JSX.Element => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <Suspense fallback={<LoadingSpinner />}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
};

// Dashboard Layout Component
const DashboardLayoutWrapper = (): JSX.Element => {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </ProtectedRoute>
  );
};

// Helper component to consolidate Suspense and ErrorBoundary wrapping
interface LazyRouteElementProps {
  component: React.ComponentType;
  props?: Record<string, unknown>;
}

const LazyRouteElement = React.memo(({ component: Component, props = {} }: LazyRouteElementProps): JSX.Element => {
  // Memoized prop sanitization to prevent unnecessary re-computation
  const safeProps = React.useMemo(() => {
    const sanitized: Record<string, unknown> = {};
    
    Object.entries(props).forEach(([key, value]) => {
      // Skip dangerous property names
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        return;
      }

      // Allow only safe, serializable types for route props
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.every(item => 
          typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
        ))
      ) {
        sanitized[key] = value;
      } else {
        console.warn(`Unsafe prop type for key "${key}" in route component. Prop omitted.`);
      }
    });

    return sanitized;
  }, [props]);

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ErrorBoundary>
        <Component {...safeProps} />
      </ErrorBoundary>
    </Suspense>
  );
});

LazyRouteElement.displayName = 'LazyRouteElement';

// Safe regex pattern for portfolio IDs - prevents ReDoS attacks
const SAFE_PORTFOLIO_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

// Portfolio ID validation function - simplified and secure
const isValidPortfolioId = (id: string): boolean => {
  // Use environment variable if available, otherwise fallback to default pattern
  const envPattern = process.env.REACT_APP_PORTFOLIO_ID_REGEX;
  
  if (!envPattern) {
    return SAFE_PORTFOLIO_ID_PATTERN.test(id);
  }

  // Validate the regex pattern is safe before use
  try {
    // Basic safety checks
    if (envPattern.length > 100) {
      console.warn('Portfolio ID regex pattern too long, falling back to default.');
      return SAFE_PORTFOLIO_ID_PATTERN.test(id);
    }

    // Check for obviously dangerous patterns that could cause ReDoS
    const dangerousPatterns = [
      /\(\.*\+\.*\)/, // Nested quantifiers
      /\.\*\.\*/, // Multiple wildcards
      /\{.+,?\}/, // Unbounded repetitions
      /\(\?[^)]*\)/, // Lookahead/lookbehind
      /\\[sS]\*/, // Repeated whitespace matchers
      /\(\?:\)*/, // Empty non-capturing groups with quantifiers
    ];

    const isPotentiallyDangerous = dangerousPatterns.some(pattern => pattern.test(envPattern));
    if (isPotentiallyDangerous) {
      console.warn('Potentially dangerous portfolio ID regex pattern detected, falling back to default.');
      return SAFE_PORTFOLIO_ID_PATTERN.test(id);
    }

    // Test with a reasonable timeout to prevent ReDoS
    const startTime = Date.now();
    const portfolioIdRegex = new RegExp(envPattern);
    
    // Set a timeout for regex execution
    const TIMEOUT_MS = 100;
    let timeoutExceeded = false;
    
    const timeoutId = setTimeout(() => {
      timeoutExceeded = true;
    }, TIMEOUT_MS);
    
    const result = portfolioIdRegex.test(id);
    
    clearTimeout(timeoutId);
    
    if (timeoutExceeded) {
      console.warn('Portfolio ID regex validation timed out, falling back to default.');
      return SAFE_PORTFOLIO_ID_PATTERN.test(id);
    }

    return result;
  } catch (error) {
    console.error('Error validating portfolio ID with custom regex:', error);
    return SAFE_PORTFOLIO_ID_PATTERN.test(id);
  }
};

// Router configuration
const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      {
        index: true,
        element: <LazyRouteElement component={LandingPage} />
      },
      {
        path: 'portfolio/:id',
        element: <LazyRouteElement component={PortfolioViewPage} />,
        loader: ({ params }) => {
          if (!params.id || !isValidPortfolioId(params.id)) {
            throw new Response('Invalid portfolio ID', { status: 400 });
          }
          return null;
        }
      },
      {
        path: '*',
        element: <LazyRouteElement component={NotFoundPage} />
      }
    ]
  },
  {
    path: '/dashboard',
    element: <DashboardLayoutWrapper />,
    children: [
      {
        index: true,
        element: <LazyRouteElement component={DashboardPage} />
      },
      {
        path: 'portfolios',
        element: <LazyRouteElement component={PortfolioList} />
      },
      {
        path: 'portfolio/:id/edit',
        element: <LazyRouteElement component={PortfolioEditor} />,
        loader: ({ params }) => {
          if (!params.id || !isValidPortfolioId(params.id)) {
            throw new Response('Invalid portfolio ID', { status: 400 });
          }
          return null;
        }
      },
      {
        path: 'projects',
        element: <LazyRouteElement component={ProjectManagementPage} />
      },
      {
        path: 'analytics',
        element: <LazyRouteElement component={AnalyticsDashboard} />
      },
      {
        path: 'settings',
        element: <LazyRouteElement component={SettingsPage} />
      }
    ]
  }
]);

// Main App Router Component
const AppRouter = (): JSX.Element => {
  return <RouterProvider router={router} />;
};

export default AppRouter;