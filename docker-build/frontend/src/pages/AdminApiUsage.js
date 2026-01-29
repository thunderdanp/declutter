import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';

function AdminApiUsage({ setIsAuthenticated }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    monthlyLimit: 50,
    perUserLimit: 10,
    alertThreshold: 80,
    alertsEnabled: true
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/api-usage/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setSettings(data.settings);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching API usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/api-usage/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const getUsagePercent = () => {
    if (!stats) return 0;
    return ((parseFloat(stats.currentMonth.systemKeyCost) / settings.monthlyLimit) * 100).toFixed(1);
  };

  const getStatusColor = (percent) => {
    if (percent >= 90) return '#e74c3c';
    if (percent >= 70) return '#f39c12';
    return '#27ae60';
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant - Admin</h2>
        </Link>
        <div className="nav-links">
          <Link to="/admin" className="nav-link">Admin Dashboard</Link>
          <Link to="/admin/users" className="nav-link">Users</Link>
          <Link to="/admin/categories" className="nav-link">Categories</Link>
          <Link to="/admin/api-usage" className="nav-link active">API Usage</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/email-templates" className="nav-link">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link">Announcements</Link>
          <Link to="/admin/settings" className="nav-link">Settings</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">API Usage Monitor</h1>
          <p className="page-subtitle">Track Claude API usage and costs</p>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            {/* Current Month Stats */}
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-number">{stats?.currentMonth.totalCalls || 0}</div>
                <div className="stat-label">Total API Calls</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-number">{stats?.currentMonth.successRate || 0}%</div>
                <div className="stat-label">Success Rate</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-number">${stats?.currentMonth.totalCost || '0.00'}</div>
                <div className="stat-label">Total Cost (Month)</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-icon">🏢</div>
                <div className="stat-number">${stats?.currentMonth.systemKeyCost || '0.00'}</div>
                <div className="stat-label">System Key Cost</div>
              </div>
            </div>

            {/* Usage Progress Bar */}
            <div className="settings-container" style={{ marginTop: '2rem' }}>
              <div className="settings-section">
                <h2 className="settings-section-title">Monthly Budget Usage</h2>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span>System Key Usage</span>
                    <span>${stats?.currentMonth.systemKeyCost} / ${settings.monthlyLimit}</span>
                  </div>
                  <div style={{
                    height: '24px',
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(getUsagePercent(), 100)}%`,
                      background: getStatusColor(getUsagePercent()),
                      transition: 'width 0.3s ease',
                      borderRadius: '12px'
                    }} />
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '0.25rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    {getUsagePercent()}% used
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <strong>Input Tokens:</strong> {stats?.currentMonth.totalInputTokens?.toLocaleString() || 0}
                  </div>
                  <div>
                    <strong>Output Tokens:</strong> {stats?.currentMonth.totalOutputTokens?.toLocaleString() || 0}
                  </div>
                  <div>
                    <strong>Successful Calls:</strong> {stats?.currentMonth.successfulCalls || 0}
                  </div>
                  <div>
                    <strong>Failed Calls:</strong> {stats?.currentMonth.failedCalls || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Users */}
            {stats?.topUsers?.length > 0 && (
              <div className="settings-container" style={{ marginTop: '2rem' }}>
                <div className="settings-section">
                  <h2 className="settings-section-title">Top Users by Usage</h2>
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>API Calls</th>
                          <th>Cost</th>
                          <th>Using Own Key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.topUsers.map((user) => (
                          <tr key={user.id}>
                            <td>
                              <strong>{user.name}</strong>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.email}</div>
                            </td>
                            <td>{user.totalCalls}</td>
                            <td>${user.totalCost}</td>
                            <td>
                              {user.userKeyCalls > 0 ? (
                                <span className="status-badge status-approved">{user.userKeyCalls} calls</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Daily Usage Chart (Simple) */}
            {stats?.dailyUsage?.length > 0 && (
              <div className="settings-container" style={{ marginTop: '2rem' }}>
                <div className="settings-section">
                  <h2 className="settings-section-title">Daily Usage (This Month)</h2>
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Calls</th>
                          <th>Successful</th>
                          <th>Failed</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.dailyUsage.slice(-10).reverse().map((day) => (
                          <tr key={day.date}>
                            <td>{new Date(day.date).toLocaleDateString()}</td>
                            <td>{day.calls}</td>
                            <td style={{ color: '#27ae60' }}>{day.successful}</td>
                            <td style={{ color: day.failed > 0 ? '#e74c3c' : 'inherit' }}>{day.failed}</td>
                            <td>${day.cost}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Settings */}
            <div className="settings-container" style={{ marginTop: '2rem' }}>
              <div className="settings-section">
                <h2 className="settings-section-title">Usage Limits & Alerts</h2>

                <div className="form-group">
                  <label>Monthly Cost Limit (System Key)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={settings.monthlyLimit}
                    onChange={(e) => setSettings({ ...settings, monthlyLimit: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="form-help">Maximum spend per month for system API key usage</p>
                </div>

                <div className="form-group">
                  <label>Per-User Monthly Limit</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={settings.perUserLimit}
                    onChange={(e) => setSettings({ ...settings, perUserLimit: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="form-help">Maximum spend per user per month (using system key)</p>
                </div>

                <div className="form-group">
                  <label>Alert Threshold (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="form-control"
                    value={settings.alertThreshold}
                    onChange={(e) => setSettings({ ...settings, alertThreshold: parseInt(e.target.value) || 0 })}
                  />
                  <p className="form-help">Send alert when usage reaches this percentage of limit</p>
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.alertsEnabled}
                      onChange={(e) => setSettings({ ...settings, alertsEnabled: e.target.checked })}
                    />
                    <span style={{ marginLeft: '0.5rem' }}>Enable Usage Alerts</span>
                  </label>
                </div>

                {message && (
                  <div className={`message ${message.includes('success') ? 'message-success' : 'message-error'}`}>
                    {message}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  onClick={handleSaveSettings}
                  disabled={saving}
                  style={{ marginTop: '1rem' }}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminApiUsage;
