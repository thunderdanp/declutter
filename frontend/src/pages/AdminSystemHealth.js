import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';
import './AdminSystemHealth.css';

function AdminSystemHealth({ setIsAuthenticated }) {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [healthData, setHealthData] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchHealthData = useCallback(async () => {
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/system-health', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch system health data');
      const data = await res.json();
      setHealthData(data);
    } catch (err) {
      console.error('System health fetch error:', err);
      setError('Failed to load system health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealthData]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#27ae60';
      case 'degraded': return '#f39c12';
      case 'down': return '#e74c3c';
      case 'unconfigured': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'degraded': return 'Degraded';
      case 'down': return 'Down';
      case 'unconfigured': return 'Not Configured';
      default: return status;
    }
  };

  // TrendChart reused from AdminAnalytics pattern
  const TrendChart = ({ data, dateKey, valueKey, label }) => {
    if (!data || data.length === 0) return <p className="no-data">No data available</p>;

    const maxValue = Math.max(...data.map(d => parseInt(d[valueKey]) || 0));
    const range = maxValue || 1;

    return (
      <div className="trend-chart">
        <div className="trend-header">
          <span className="trend-label">{label}</span>
          <span className="trend-max">Max: {maxValue}</span>
        </div>
        <div className="trend-area">
          {data.map((item, index) => {
            const height = ((parseInt(item[valueKey]) || 0) / range) * 100;
            return (
              <div key={index} className="trend-bar-wrapper" title={`${item[dateKey]}: ${item[valueKey]}`}>
                <div
                  className="trend-bar"
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
                {index % Math.ceil(data.length / 7) === 0 && (
                  <span className="trend-date">{new Date(item[dateKey]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Bar chart for table sizes
  const TableSizeChart = ({ tableSizes }) => {
    if (!tableSizes || tableSizes.length === 0) return <p className="no-data">No data available</p>;

    const top10 = tableSizes.slice(0, 10);
    const maxSize = Math.max(...top10.map(t => t.sizeBytes));

    return (
      <div className="table-size-chart">
        {top10.map((table, i) => (
          <div key={i} className="table-size-row">
            <span className="table-size-name">{table.table}</span>
            <div className="table-size-bar-bg">
              <div
                className="table-size-bar-fill"
                style={{ width: `${maxSize > 0 ? (table.sizeBytes / maxSize) * 100 : 0}%` }}
              />
            </div>
            <span className="table-size-value">{table.size}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="admin-layout">
      <nav className="admin-sidebar">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant</h2>
        </Link>
        <div className="admin-label">Admin</div>
        <div className="admin-sidebar-links">
          <Link to="/admin" className="nav-link">Dashboard</Link>
          <Link to="/admin/users" className="nav-link">Users</Link>
          <Link to="/admin/categories" className="nav-link">Categories</Link>
          <Link to="/admin/api-usage" className="nav-link">API Usage</Link>
          <Link to="/admin/ai-config" className="nav-link">AI Config</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link">Activity Logs</Link>
          <Link to="/admin/email-templates" className="nav-link">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link">Announcements</Link>
          <Link to="/admin/settings" className="nav-link">Settings</Link>
          <Link to="/admin/system-health" className="nav-link active">System Health</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
        </div>
        <div className="admin-sidebar-footer">
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="admin-main">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">System Health</h1>
            <p className="page-subtitle">Real-time system monitoring and diagnostics</p>
          </div>

          <div className="admin-header">
            <div className="health-overall-status">
              {healthData && (
                <>
                  <span
                    className="health-indicator-dot"
                    style={{ backgroundColor: getStatusColor(healthData.overallStatus) }}
                  />
                  <span className="health-overall-label">{getStatusLabel(healthData.overallStatus)}</span>
                </>
              )}
            </div>
            <div className="health-controls">
              <label className="auto-refresh-toggle">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh (30s)
              </label>
              <button onClick={fetchHealthData} className="btn btn-secondary" disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && <div className="message message-error">{error}</div>}

          {loading && !healthData ? (
            <div className="loading-state">Loading system health data...</div>
          ) : healthData && (
            <>
              {/* Section 1: Database Connection Status */}
              <div className="health-section">
                <h2 className="health-section-title">Database Connection Status</h2>
                <div className="health-status-grid">
                  <div className="health-metric-card">
                    <div className="health-indicator">
                      <span
                        className="health-indicator-dot"
                        style={{ backgroundColor: healthData.database.connected ? '#27ae60' : '#e74c3c' }}
                      />
                      <span className="health-indicator-label">
                        {healthData.database.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.database.latencyMs}ms</div>
                    <div className="metric-label">Query Latency</div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.database.databaseSize}</div>
                    <div className="metric-label">Database Size</div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.database.poolTotal}</div>
                    <div className="metric-label">Total Connections</div>
                  </div>
                </div>

                <div className="health-sub-grid">
                  <div className="health-detail-card">
                    <h3>Connection Pool</h3>
                    <div className="detail-rows">
                      <div className="detail-row">
                        <span>Idle</span><span>{healthData.database.poolIdle}</span>
                      </div>
                      <div className="detail-row">
                        <span>Active</span><span>{healthData.database.poolActive}</span>
                      </div>
                      <div className="detail-row">
                        <span>Waiting</span><span>{healthData.database.poolWaiting}</span>
                      </div>
                    </div>
                  </div>
                  <div className="health-detail-card">
                    <h3>Table Row Counts</h3>
                    <div className="detail-rows">
                      {healthData.database.tableCounts && Object.entries(healthData.database.tableCounts).map(([table, count]) => (
                        <div key={table} className="detail-row">
                          <span>{table}</span><span>{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: API Endpoint Health Checks */}
              <div className="health-section">
                <h2 className="health-section-title">API Endpoint Health Checks</h2>
                <div className="health-endpoint-list">
                  {healthData.endpoints.map((ep, i) => (
                    <div key={i} className="health-endpoint-row">
                      <div className="endpoint-status">
                        <span
                          className="health-indicator-dot"
                          style={{ backgroundColor: getStatusColor(ep.status) }}
                        />
                        <span className="endpoint-name">{ep.name}</span>
                      </div>
                      <span className="endpoint-path">{ep.endpoint}</span>
                      <span className={`endpoint-status-badge status-${ep.status}`}>
                        {getStatusLabel(ep.status)}
                      </span>
                      <span className="endpoint-latency">
                        {ep.latencyMs !== null ? `${ep.latencyMs}ms` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Storage Usage Statistics */}
              <div className="health-section">
                <h2 className="health-section-title">Storage Usage Statistics</h2>
                <div className="health-status-grid">
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.storage.uploads.totalSize}</div>
                    <div className="metric-label">Uploads Size</div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.storage.uploads.fileCount}</div>
                    <div className="metric-label">Uploaded Files</div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.database.databaseSize}</div>
                    <div className="metric-label">Database Size</div>
                  </div>
                </div>

                <div className="health-detail-card">
                  <h3>Table Sizes (Top 10)</h3>
                  <TableSizeChart tableSizes={healthData.database.tableSizes} />
                </div>
              </div>

              {/* Section 4: Error Rate Monitoring */}
              <div className="health-section">
                <h2 className="health-section-title">Error Rate Monitoring</h2>
                <div className="health-status-grid">
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.errors.last24h.errorRate}</div>
                    <div className="metric-label">Error Rate (24h)</div>
                    <div className="metric-detail">
                      {healthData.errors.last24h.apiErrors} errors / {healthData.errors.last24h.totalApiCalls} calls
                    </div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.errors.last7d.errorRate}</div>
                    <div className="metric-label">Error Rate (7d)</div>
                    <div className="metric-detail">
                      {healthData.errors.last7d.apiErrors} errors / {healthData.errors.last7d.totalApiCalls} calls
                    </div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">{healthData.errors.last30d.errorRate}</div>
                    <div className="metric-label">Error Rate (30d)</div>
                    <div className="metric-detail">
                      {healthData.errors.last30d.apiErrors} errors / {healthData.errors.last30d.totalApiCalls} calls
                    </div>
                  </div>
                  <div className="health-metric-card">
                    <div className="metric-value">
                      {healthData.errors.last24h.failedLogins + healthData.errors.last7d.failedLogins + healthData.errors.last30d.failedLogins > 0
                        ? healthData.errors.last7d.failedLogins
                        : 0}
                    </div>
                    <div className="metric-label">Failed Logins (7d)</div>
                  </div>
                </div>

                <div className="health-detail-card">
                  <TrendChart
                    data={healthData.errors.dailyErrors}
                    dateKey="date"
                    valueKey="apiErrors"
                    label="API Errors (Last 7 Days)"
                  />
                </div>

                <div className="health-detail-card">
                  <h3>Recent Errors</h3>
                  {healthData.errors.recentErrors.length === 0 ? (
                    <p className="no-data">No recent errors</p>
                  ) : (
                    <div className="recent-errors-list">
                      {healthData.errors.recentErrors.map((err) => (
                        <div key={err.id} className="recent-error-row">
                          <div className="error-endpoint">{err.endpoint}</div>
                          <div className="error-message">{err.error_message || 'Unknown error'}</div>
                          <div className="error-meta">
                            <span>{err.user_email || 'Unknown user'}</span>
                            <span>{new Date(err.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="health-footer">
                Last updated: {new Date(healthData.timestamp).toLocaleString()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSystemHealth;
