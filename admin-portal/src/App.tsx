import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FormsList from "./pages/FormsList";
import FormBuilder from "./pages/FormBuilder";
import Responses from "./pages/Responses";
import Analytics from "./pages/Analytics";
import OrgAnalytics from "./pages/OrgAnalytics";
import Users from "./pages/Users";
import Organization from "./pages/Organization";
import "./App.css";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !["super_admin", "org_admin"].includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/forms" element={<PrivateRoute><FormsList /></PrivateRoute>} />
      <Route path="/forms/new" element={<PrivateRoute><FormBuilder /></PrivateRoute>} />
      <Route path="/forms/:id/edit" element={<PrivateRoute><FormBuilder /></PrivateRoute>} />
      <Route path="/forms/:id/responses" element={<PrivateRoute><Responses /></PrivateRoute>} />
      <Route path="/forms/:id/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
      <Route path="/users" element={<PrivateRoute><AdminRoute><Users /></AdminRoute></PrivateRoute>} />
      <Route path="/organization" element={<PrivateRoute><AdminRoute><Organization /></AdminRoute></PrivateRoute>} />
      <Route path="/analytics" element={<PrivateRoute><OrgAnalytics /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}
