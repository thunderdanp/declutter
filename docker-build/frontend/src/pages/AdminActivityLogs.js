import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';
import './AdminActivityLogs.css';

function AdminActivityLogs({ setIsAuthenticated }) {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('logs');

  // Logs data
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ actionTypes: [], actions: [] });

  // Filter state
  const [selectedActionType, setSelectedActionType] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('7');

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50'
      });

      if (selectedActionType) params.append('actionType', selectedActionType);
      if (selectedAction) params.append('action', selectedAction);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/admin/activity-logs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch logs');

      const data = await response.json();
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Fetch logs error:', err);
      setError('Failed to load activity logs');
    }
  }, [selectedActionType, selectedAction, searchTerm]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/activity-logs/stats?period=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch stats');

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Fetch stats error:', err);
    }
  }, [period]);

  const fetchFilters = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/activity-logs/filters', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch filters');

      const data = await response.json();
      setFilters(data);
    } catch (err) {
      console.error('Fetch filters error:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchLogs(), fetchStats(), fetchFilters()]);
      setLoading(false);
    };
    loadData();
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [period, fetchStats]);

  useEffect(() => {
    fetchLogs(1);
  }, [selectedActionType, selectedAction, searchTerm, fetchLogs]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionTypeColor = (type) => {
    const colors = {
      user: '#3498db',
      item: '#27ae60',
      admin: '#9b59b6',
      system: '#e74c3c'
    };
    return colors[type] || '#7f8c8d';
  };

  const getActionIcon = (action) => {
    const icons = {
      login_success: '🔓',
      login_failed: '🔒',
      user_registered: '👤',
      user_approved: '✅',
      user_deleted: '🗑️',
      item_created: '➕',
      item_updated: '✏️',
      item_deleted: '🗑️',
      decision_recorded: '✔️',
      decision_cleared: '↩️',
      profile_updated: '👤',
      announcement_sent: '📢',
      recommendation_weights_updated: '⚖️',
      recommendation_thresholds_updated: '📊',
      recommendation_strategies_updated: '🎯',
      recommendation_settings_reset: '🔄',
      user_api_settings_updated: '🔑'
    };
    return icons[action] || '📋';
  };

  const renderDetailsCell = (log) => {
    if (!log.details) return '-';

    try {
      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      const entries = Object.entries(details).slice(0, 3);

      return (
        <div className="details-cell">
          {entries.map(([key, value]) => (
            <span key={key} className="detail-item">
              <span className="detail-key">{key}:</span> {String(value).substring(0, 30)}
            </span>
          ))}
          {Object.keys(details).length > 3 && <span className="detail-more">+{Object.keys(details).length - 3} more</span>}
        </div>
      );
    } catch {
      return '-';
    }
  };

  // Simple bar chart component
  const SimpleBarChart = ({ data, labelKey, valueKey, maxBars = 10 }) => {
    const sortedData = [...data].sort((a, b) => b[valueKey] - a[valueKey]).slice(0, maxBars);
    const maxValue = Math.max(...sortedData.map(d => d[valueKey]), 1);

    return (
      <div className="simple-bar-chart">
        {sortedData.map((item, index) => (
          <div key={index} className="bar-row">
            <div className="bar-label">{item[labelKey]}</div>
            <div className="bar-container">
              <div
                className="bar"
                style={{
                  width: `${(item[valueKey] / maxValue) * 100}%`,
                  backgroundColor: getActionTypeColor(item[labelKey])
                }}
              />
              <span className="bar-value">{item[valueKey]}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`admin-container ${isDark ? 'dark' : ''}`}>
      <nav className="admin-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant - Admin</h2>
        </Link>
        <div className="nav-links">
          <Link to="/admin" className="nav-link">Admin Dashboard</Link>
          <Link to="/admin/users" className="nav-link">Users</Link>
          <Link to="/admin/categories" className="nav-link">Categories</Link>
          <Link to="/admin/api-usage" className="nav-link">API Usage</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link active">Activity Logs</Link>
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

      <div className="admin-content">
        <div className="admin-header">
          <h1>Activity Logs</h1>
          <p>Track user actions, item changes, and system events</p>
        </div>

        <div className="analytics-tabs">
          <button
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Activity Logs
          </button>
          <button
            className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Statistics
          </button>
          <button
            className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            Security
          </button>
        </div>

        {loading ? (
          <div className="loading-spinner">Loading activity logs...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <>
            {activeTab === 'logs' && (
              <div className="logs-section">
                <div className="filters-row">
                  <div className="filter-group">
                    <label>Action Type</label>
                    <select
                      value={selectedActionType}
                      onChange={(e) => setSelectedActionType(e.target.value)}
                    >
                      <option value="">All Types</option>
                      {filters.actionTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>Action</label>
                    <select
                      value={selectedAction}
                      onChange={(e) => setSelectedAction(e.target.value)}
                    >
                      <option value="">All Actions</option>
                      {filters.actions.map(action => (
                        <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group search-group">
                    <label>Search</label>
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button
                    className="clear-filters-btn"
                    onClick={() => {
                      setSelectedActionType('');
                      setSelectedAction('');
                      setSearchTerm('');
                    }}
                  >
                    Clear Filters
                  </button>
                </div>

                <div className="logs-table-container">
                  <table className="logs-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>User</th>
                        <th>Type</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id}>
                          <td className="time-cell">{formatDate(log.created_at)}</td>
                          <td className="user-cell">
                            {log.user_email ? (
                              <span title={log.user_email}>
                                {log.first_name} {log.last_name}
                              </span>
                            ) : (
                              <span className="anonymous">Anonymous</span>
                            )}
                          </td>
                          <td>
                            <span
                              className="action-type-badge"
                              style={{ backgroundColor: getActionTypeColor(log.action_type) }}
                            >
                              {log.action_type}
                            </span>
                          </td>
                          <td className="action-cell">
                            <span className="action-icon">{getActionIcon(log.action)}</span>
                            {log.action.replace(/_/g, ' ')}
                          </td>
                          <td>{renderDetailsCell(log)}</td>
                          <td className="ip-cell">{log.ip_address || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pagination.totalPages > 1 && (
                  <div className="pagination">
                    <button
                      onClick={() => fetchLogs(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </button>
                    <span>
                      Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </span>
                    <button
                      onClick={() => fetchLogs(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stats' && stats && (
              <div className="stats-section">
                <div className="period-selector">
                  <label>Period:</label>
                  <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                    <option value="1">Last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>

                <div className="stats-grid">
                  <div className="stat-card">
                    <h3>Activity by Type</h3>
                    <SimpleBarChart
                      data={stats.typeCounts}
                      labelKey="action_type"
                      valueKey="count"
                    />
                  </div>

                  <div className="stat-card">
                    <h3>Top Actions</h3>
                    <SimpleBarChart
                      data={stats.actionCounts}
                      labelKey="action"
                      valueKey="count"
                    />
                  </div>

                  <div className="stat-card wide">
                    <h3>Daily Activity</h3>
                    <div className="daily-activity-chart">
                      {stats.dailyActivity.map((day, index) => {
                        const maxTotal = Math.max(...stats.dailyActivity.map(d => parseInt(d.total)), 1);
                        return (
                          <div key={index} className="day-bar">
                            <div
                              className="day-bar-fill"
                              style={{ height: `${(parseInt(day.total) / maxTotal) * 100}%` }}
                              title={`${day.date}: ${day.total} actions`}
                            />
                            <span className="day-label">
                              {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="stat-card">
                    <h3>Most Active Users</h3>
                    <div className="active-users-list">
                      {stats.mostActiveUsers.map((user, index) => (
                        <div key={user.id} className="active-user-row">
                          <span className="rank">#{index + 1}</span>
                          <span className="user-name">{user.first_name} {user.last_name}</span>
                          <span className="action-count">{user.action_count} actions</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && stats && (
              <div className="security-section">
                <div className="period-selector">
                  <label>Period:</label>
                  <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                    <option value="1">Last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>

                <div className="security-grid">
                  <div className="security-card">
                    <h3>Recent Failed Logins</h3>
                    {stats.recentFailedLogins.length === 0 ? (
                      <p className="no-data">No failed login attempts</p>
                    ) : (
                      <table className="failed-logins-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Email</th>
                            <th>Reason</th>
                            <th>IP Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.recentFailedLogins.map((login, index) => (
                            <tr key={index}>
                              <td>{formatDate(login.created_at)}</td>
                              <td>{login.email}</td>
                              <td>
                                <span className={`reason-badge ${login.reason}`}>
                                  {login.reason === 'invalid_password' ? 'Wrong Password' :
                                   login.reason === 'user_not_found' ? 'Unknown User' :
                                   login.reason === 'not_approved' ? 'Not Approved' : login.reason}
                                </span>
                              </td>
                              <td>{login.ip_address || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="security-card">
                    <h3>Security Summary</h3>
                    <div className="security-stats">
                      <div className="security-stat">
                        <span className="stat-value">
                          {stats.recentFailedLogins.length}
                        </span>
                        <span className="stat-label">Failed Logins</span>
                      </div>
                      <div className="security-stat">
                        <span className="stat-value">
                          {stats.typeCounts.find(t => t.action_type === 'admin')?.count || 0}
                        </span>
                        <span className="stat-label">Admin Actions</span>
                      </div>
                      <div className="security-stat">
                        <span className="stat-value">
                          {stats.actionCounts.find(a => a.action === 'user_deleted')?.count || 0}
                        </span>
                        <span className="stat-label">Users Deleted</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminActivityLogs;
