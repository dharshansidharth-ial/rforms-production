import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, FileText, BarChart2, Users, Settings,
  LogOut, Plus, Menu, X, Building2
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/forms", icon: FileText, label: "Forms" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/users", icon: Users, label: "Users", adminOnly: true },
  { to: "/organization", icon: Building2, label: "Organization", adminOnly: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isAdmin = user?.role === "super_admin" || user?.role === "org_admin";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className={`app-layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-icon">R</span>
            {sidebarOpen && <span className="brand-name">Forms</span>}
          </div>
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {sidebarOpen && (
          <button className="create-btn" onClick={() => navigate("/forms/new")}>
            <Plus size={16} />
            <span>New Form</span>
          </button>
        )}

        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`nav-item ${location.pathname === to ? "active" : ""}`}
            >
              <Icon size={18} />
              {sidebarOpen && <span>{label}</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            {sidebarOpen && (
              <div className="user-details">
                <div className="user-name">{user?.name}</div>
                <div className="user-role">{user?.role?.replace("_", " ")}</div>
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
