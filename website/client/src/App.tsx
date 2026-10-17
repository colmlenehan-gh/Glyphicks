/* Matrix Lightspace design reminder: use near-black space, mineral white type, Signal Lime live states, and one continuous LED-matrix world. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";

// Secondary pages are split into their own chunks so the landing page loads first.
const Download = lazy(() => import("./pages/Download"));
const Studio = lazy(() => import("./pages/Studio"));
const Support = lazy(() => import("./pages/Support"));

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/support" component={Support} />
      <Route path="/download" component={Download} />
      <Route path="/studio" component={Studio} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
