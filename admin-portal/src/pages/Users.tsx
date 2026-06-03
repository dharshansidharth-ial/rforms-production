import React, { useEffect, useState } from "react";
import client from "../api/client";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, X } from "lucide-react";

const ROLES = ["org_admin", "form_owner", "editor", "viewer", "approver", "analyst", "responder"];

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "form_owner", department: "" });

  const load = async () => {
    setLoading(true);
    const res = await client.get("/users");
    setUsers(res.data.users);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ email: "", name: "", password: "", role: "form_owner", department: "" });
    setShowForm(true);
  };

  const openEdit = (user: any) => {
    setEditing(user);
    setForm({ email: user.email, name: user.name, password: "", role: user.role, department: user.department || "" });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await client.patch(`/users/${editing.id}`, { user: { name: form.name, role: form.role, department: form.department } });
        toast.success("User updated");
      } else {
        await client.post("/users", { user: form });
        toast.success("User created");
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error saving user");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Deactivate ${name}?`)) return;
    await client.delete(`/users/${id}`);
    toast.success("User deactivated");
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Users</h1>
        <button className="btn-primary" onClick={openCreate}><Plus size={15} /> Add User</button>
      </div>

      {loading ? <div className="page-loading">Loading...</div> : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="badge role-badge">{u.role.replace("_", " ")}</span></td>
                  <td>{u.department || "—"}</td>
                  <td><span className={`status-badge ${u.status}`}>{u.status}</span></td>
                  <td>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}</td>
                  <td>
                    <div className="action-buttons">
                      <button onClick={() => openEdit(u)}><Edit2 size={15} /></button>
                      <button className="danger" onClick={() => handleDelete(u.id, u.name)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? "Edit User" : "Create User"}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="user-form">
              {!editing && (
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" required value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              )}
              <div className="form-group">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              {!editing && (
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" required value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}
              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Department</label>
                <input value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
