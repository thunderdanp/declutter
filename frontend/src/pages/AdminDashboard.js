import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Admin.css';

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching admin stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>Declutter Assistant - Admin</h2>
        </div>
        <div className="nav-links">
          <Link to="/admin" className="nav-link active">Admin Dashboard</Link>
          <Link to="/admin/users" className="nav-link">Users</Link>
          <Link to="/admin/settings" className="nav-link">Settings</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">System overview and management</p>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-number">{stats?.totalUsers || 0}</div>
                <div className="stat-label">Total Users</div>
              </div>

              <div className="admin-stat-card stat-warning">
                <div className="stat-icon">⏳</div>
                <div className="stat-number">{stats?.pendingUsers || 0}</div>
                <div className="stat-label">Pending Approval</div>
                {stats?.pendingUsers > 0 && (
                  <Link to="/admin/users?filter=pending" className="stat-action">
                    Review Now →
                  </Link>
                )}
              </div>

              <div className="admin-stat-card">
                <div className="stat-icon">📦</div>
                <div className="stat-number">{stats?.totalItems || 0}</div>
                <div className="stat-label">Total Items</div>
              </div>
            </div>

            <div className="admin-section">
              <h2 className="section-title">Recent Users</h2>
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Registered</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.recentUsers?.map(user => (
                      <tr key={user.id}>
                        <td>{user.email}</td>
                        <td>{user.first_name} {user.last_name}</td>
                        <td>{formatDate(user.created_at)}</td>
                        <td>
                          {user.is_approved ? (
                            <span className="status-badge status-approved">Approved</span>
                          ) : (
                            <span className="status-badge status-pending">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-quick-actions">
              <Link to="/admin/users" className="admin-action-card">
                <div className="action-icon">👥</div>
                <h3>Manage Users</h3>
                <p>View, approve, and manage user accounts</p>
              </Link>

              <Link to="/admin/settings" className="admin-action-card">
                <div className="action-icon">⚙️</div>
                <h3>System Settings</h3>
                <p>Configure registration and email settings</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
