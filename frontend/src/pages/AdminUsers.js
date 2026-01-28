import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Admin.css';

function AdminUsers({ setIsAuthenticated }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlFilter = params.get('filter');
    if (urlFilter) setFilter(urlFilter);
    fetchUsers();
  }, [location.search]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    if (!window.confirm('Approve this user?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('User approved successfully');
        fetchUsers();
      }
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user? This will also delete all their items. This action cannot be undone.')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('User deleted successfully');
        fetchUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredUsers = users.filter(user => {
    if (filter === 'pending') return !user.is_approved;
    if (filter === 'approved') return user.is_approved;
    if (filter === 'admin') return user.is_admin;
    return true;
  });

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant - Admin</h2>
        </Link>
        <div className="nav-links">
          <Link to="/admin" className="nav-link">Admin Dashboard</Link>
          <Link to="/admin/users" className="nav-link active">Users</Link>
          <Link to="/admin/categories" className="nav-link">Categories</Link>
          <Link to="/admin/email-templates" className="nav-link">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link">Announcements</Link>
          <Link to="/admin/settings" className="nav-link">Settings</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage all registered users</p>
        </div>

        <div className="filter-bar">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Users ({users.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({users.filter(u => !u.is_approved).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            Approved ({users.filter(u => u.is_approved).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'admin' ? 'active' : ''}`}
            onClick={() => setFilter('admin')}
          >
            Admins ({users.filter(u => u.is_admin).length})
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h2>No Users Found</h2>
            <p>No users match the selected filter</p>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Registered</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.first_name} {user.last_name}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>{user.item_count || 0}</td>
                    <td>
                      <div className="status-badges">
                        {user.is_admin && (
                          <span className="status-badge status-admin">Admin</span>
                        )}
                        {user.is_approved ? (
                          <span className="status-badge status-approved">Approved</span>
                        ) : (
                          <span className="status-badge status-pending">Pending</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {!user.is_approved && (
                          <button 
                            className="btn-approve"
                            onClick={() => handleApprove(user.id)}
                          >
                            Approve
                          </button>
                        )}
                        <button 
                          className="btn-delete"
                          onClick={() => handleDelete(user.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUsers;
