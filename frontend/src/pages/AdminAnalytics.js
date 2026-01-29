import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';
import './AdminAnalytics.css';

function AdminAnalytics({ setIsAuthenticated }) {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [summary, setSummary] = useState(null);
  const [itemTrends, setItemTrends] = useState(null);
  const [userActivity, setUserActivity] = useState(null);
  const [categories, setCategories] = useState(null);
  const [conversions, setConversions] = useState(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const [summaryRes, trendsRes, activityRes, categoriesRes, conversionsRes] = await Promise.all([
        fetch(`/api/admin/analytics/summary?period=${period}`, { headers }),
        fetch(`/api/admin/analytics/item-trends?period=${period}`, { headers }),
        fetch(`/api/admin/analytics/user-activity?period=${period}`, { headers }),
        fetch(`/api/admin/analytics/categories?period=${period}`, { headers }),
        fetch(`/api/admin/analytics/conversions?period=${period}`, { headers })
      ]);

      if (!summaryRes.ok || !trendsRes.ok || !activityRes.ok || !categoriesRes.ok || !conversionsRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      setSummary(await summaryRes.json());
      setItemTrends(await trendsRes.json());
      setUserActivity(await activityRes.json());
      setCategories(await categoriesRes.json());
      setConversions(await conversionsRes.json());
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  // Recommendation color mapping
  const getRecommendationColor = (rec) => {
    const colors = {
      keep: '#27ae60',
      accessible: '#2ecc71',
      storage: '#3498db',
      sell: '#f39c12',
      donate: '#9b59b6',
      discard: '#e74c3c'
    };
    return colors[rec] || '#7f8c8d';
  };

  // Simple bar chart component
  const BarChart = ({ data, labelKey, valueKey, colorFn }) => {
    if (!data || data.length === 0) return <p className="no-data">No data available</p>;

    const maxValue = Math.max(...data.map(d => parseInt(d[valueKey]) || 0));

    return (
      <div className="bar-chart">
        {data.map((item, index) => (
          <div key={index} className="bar-row">
            <span className="bar-label">{item[labelKey]}</span>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${maxValue > 0 ? (item[valueKey] / maxValue) * 100 : 0}%`,
                  backgroundColor: colorFn ? colorFn(item[labelKey]) : '#D46F4D'
                }}
              />
            </div>
            <span className="bar-value">{item[valueKey]}</span>
          </div>
        ))}
      </div>
    );
  };

  // Donut chart component
  const DonutChart = ({ data, labelKey, valueKey, colorFn }) => {
    if (!data || data.length === 0) return <p className="no-data">No data available</p>;

    const total = data.reduce((sum, d) => sum + (parseInt(d[valueKey]) || 0), 0);
    let cumulativePercent = 0;

    const segments = data.map((item, index) => {
      const percent = total > 0 ? (item[valueKey] / total) * 100 : 0;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;
      return {
        ...item,
        percent,
        startPercent,
        color: colorFn ? colorFn(item[labelKey]) : `hsl(${index * 60}, 70%, 50%)`
      };
    });

    const createConicGradient = () => {
      if (segments.length === 0) return 'conic-gradient(#e0e0e0 0% 100%)';
      return `conic-gradient(${segments.map(s =>
        `${s.color} ${s.startPercent}% ${s.startPercent + s.percent}%`
      ).join(', ')})`;
    };

    return (
      <div className="donut-chart-container">
        <div className="donut-chart" style={{ background: createConicGradient() }}>
          <div className="donut-hole">
            <span className="donut-total">{total}</span>
            <span className="donut-label">Total</span>
          </div>
        </div>
        <div className="donut-legend">
          {segments.map((item, index) => (
            <div key={index} className="legend-item">
              <span className="legend-color" style={{ backgroundColor: item.color }} />
              <span className="legend-label">{item[labelKey]}</span>
              <span className="legend-value">{item[valueKey]} ({item.percent.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Line/Area chart component for trends
  const TrendChart = ({ data, dateKey, valueKey, label }) => {
    if (!data || data.length === 0) return <p className="no-data">No data available</p>;

    const maxValue = Math.max(...data.map(d => parseInt(d[valueKey]) || 0));
    const minValue = 0;
    const range = maxValue - minValue || 1;

    return (
      <div className="trend-chart">
        <div className="trend-header">
          <span className="trend-label">{label}</span>
          <span className="trend-max">Max: {maxValue}</span>
        </div>
        <div className="trend-area">
          {data.map((item, index) => {
            const height = ((item[valueKey] - minValue) / range) * 100;
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
          <Link to="/admin/api-usage" className="nav-link">API Usage</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link active">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link">Activity Logs</Link>
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
          <h1 className="page-title">Analytics Dashboard</h1>
          <p className="page-subtitle">Insights and trends for your decluttering journey</p>
        </div>
        <div className="admin-header">
          <div></div>
          <div className="period-selector">
            <label>Time Period:</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="form-control period-select">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <button onClick={fetchAllData} className="btn btn-secondary" disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <div className="message message-error">{error}</div>}

        {/* Analytics Sub-tabs */}
        <div className="analytics-tabs">
          <button
            className={`analytics-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`analytics-tab ${activeTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            Item Trends
          </button>
          <button
            className={`analytics-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            User Activity
          </button>
          <button
            className={`analytics-tab ${activeTab === 'categories' ? 'active' : ''}`}
            onClick={() => setActiveTab('categories')}
          >
            Categories
          </button>
          <button
            className={`analytics-tab ${activeTab === 'conversions' ? 'active' : ''}`}
            onClick={() => setActiveTab('conversions')}
          >
            Conversions
          </button>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && summary && (
              <div className="analytics-section">
                <h2 className="section-title">Summary Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">📦</div>
                    <div className="stat-number">{summary.itemsAdded}</div>
                    <div className="stat-label">Items Added</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-number">{summary.activeUsers}</div>
                    <div className="stat-label">Active Users</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-number">{summary.decisionsMade}</div>
                    <div className="stat-label">Decisions Made</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🎯</div>
                    <div className="stat-number">{summary.followRate}%</div>
                    <div className="stat-label">Follow Rate</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🆕</div>
                    <div className="stat-number">{summary.newUsers}</div>
                    <div className="stat-label">New Users</div>
                  </div>
                </div>

                {itemTrends && (
                  <div className="chart-section">
                    <h3>Items Added Over Time</h3>
                    <TrendChart
                      data={itemTrends.itemsPerDay}
                      dateKey="date"
                      valueKey="count"
                      label="Daily Items"
                    />
                  </div>
                )}

                {itemTrends && (
                  <div className="chart-section">
                    <h3>Recommendations Distribution</h3>
                    <DonutChart
                      data={itemTrends.recommendationTotals}
                      labelKey="recommendation"
                      valueKey="count"
                      colorFn={getRecommendationColor}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Item Trends Tab */}
            {activeTab === 'items' && itemTrends && (
              <div className="analytics-section">
                <h2 className="section-title">Item Trends</h2>

                <div className="chart-section">
                  <h3>Items Added Per Day</h3>
                  <TrendChart
                    data={itemTrends.itemsPerDay}
                    dateKey="date"
                    valueKey="count"
                    label="Daily Items"
                  />
                </div>

                <div className="chart-section">
                  <h3>Recommendations by Type (Total)</h3>
                  <BarChart
                    data={itemTrends.recommendationTotals}
                    labelKey="recommendation"
                    valueKey="count"
                    colorFn={getRecommendationColor}
                  />
                </div>

                <div className="chart-section">
                  <h3>Recommendations Distribution</h3>
                  <DonutChart
                    data={itemTrends.recommendationTotals}
                    labelKey="recommendation"
                    valueKey="count"
                    colorFn={getRecommendationColor}
                  />
                </div>
              </div>
            )}

            {/* User Activity Tab */}
            {activeTab === 'users' && userActivity && (
              <div className="analytics-section">
                <h2 className="section-title">User Activity Metrics</h2>

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-number">{userActivity.activeUsers}</div>
                    <div className="stat-label">Active Users</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-number">{userActivity.averageItemsPerUser.toFixed(1)}</div>
                    <div className="stat-label">Avg Items/User</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🏆</div>
                    <div className="stat-number">{userActivity.maxItemsPerUser}</div>
                    <div className="stat-label">Max Items/User</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">👤</div>
                    <div className="stat-number">{userActivity.totalUsers}</div>
                    <div className="stat-label">Total Users</div>
                  </div>
                </div>

                <div className="chart-section">
                  <h3>User Registrations Over Time</h3>
                  <TrendChart
                    data={userActivity.registrations}
                    dateKey="date"
                    valueKey="count"
                    label="New Users"
                  />
                </div>

                <div className="chart-section">
                  <h3>Top Users by Items</h3>
                  <div className="top-users-table">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>User</th>
                          <th>Items Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userActivity.topUsers.map((user, index) => (
                          <tr key={user.id}>
                            <td>#{index + 1}</td>
                            <td>{user.first_name} {user.last_name}</td>
                            <td>{user.item_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Categories Tab */}
            {activeTab === 'categories' && categories && (
              <div className="analytics-section">
                <h2 className="section-title">Category Distribution</h2>

                <div className="chart-section">
                  <h3>Items by Category</h3>
                  <DonutChart
                    data={categories.distribution}
                    labelKey="category"
                    valueKey="count"
                  />
                </div>

                <div className="chart-section">
                  <h3>Category Breakdown</h3>
                  <BarChart
                    data={categories.distribution}
                    labelKey="category"
                    valueKey="count"
                  />
                </div>

                <div className="chart-section">
                  <h3>Recommendations by Category</h3>
                  <div className="category-recommendations">
                    {Object.entries(
                      categories.recommendationsByCategory.reduce((acc, item) => {
                        if (!acc[item.category]) acc[item.category] = [];
                        acc[item.category].push(item);
                        return acc;
                      }, {})
                    ).map(([category, recs]) => (
                      <div key={category} className="category-rec-group">
                        <h4>{category}</h4>
                        <div className="rec-pills">
                          {recs.map((rec, idx) => (
                            <span
                              key={idx}
                              className="rec-pill"
                              style={{ backgroundColor: getRecommendationColor(rec.recommendation) }}
                            >
                              {rec.recommendation}: {rec.count}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Conversions Tab */}
            {activeTab === 'conversions' && conversions && (
              <div className="analytics-section">
                <h2 className="section-title">Recommendation Conversion Tracking</h2>

                <div className="stats-grid">
                  <div className="stat-card stat-success">
                    <div className="stat-icon">✅</div>
                    <div className="stat-number">{conversions.overall.followed}</div>
                    <div className="stat-label">Followed</div>
                  </div>
                  <div className="stat-card stat-warning">
                    <div className="stat-icon">↔️</div>
                    <div className="stat-number">{conversions.overall.diverged}</div>
                    <div className="stat-label">Diverged</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-number">{conversions.overall.total}</div>
                    <div className="stat-label">Total Decisions</div>
                  </div>
                  <div className="stat-card stat-highlight">
                    <div className="stat-icon">🎯</div>
                    <div className="stat-number">{conversions.overall.followRate}%</div>
                    <div className="stat-label">Follow Rate</div>
                  </div>
                </div>

                <div className="chart-section">
                  <h3>Conversion by Recommendation Type</h3>
                  <div className="conversion-table">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Recommendation</th>
                          <th>Followed</th>
                          <th>Diverged</th>
                          <th>Total</th>
                          <th>Follow Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversions.byRecommendationType.map((item, index) => {
                          const rate = item.total > 0 ? ((item.followed / item.total) * 100).toFixed(1) : 0;
                          return (
                            <tr key={index}>
                              <td>
                                <span className="rec-pill" style={{ backgroundColor: getRecommendationColor(item.recommendation) }}>
                                  {item.recommendation}
                                </span>
                              </td>
                              <td>{item.followed}</td>
                              <td>{item.diverged}</td>
                              <td>{item.total}</td>
                              <td>
                                <div className="progress-bar">
                                  <div className="progress-fill" style={{ width: `${rate}%` }} />
                                  <span className="progress-text">{rate}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="chart-section">
                  <h3>Pending Decisions</h3>
                  <p className="section-description">Items with recommendations but no user decision yet.</p>
                  <BarChart
                    data={conversions.pendingDecisions}
                    labelKey="recommendation"
                    valueKey="count"
                    colorFn={getRecommendationColor}
                  />
                </div>

                {conversions.modifiedRecommendations.length > 0 && (
                  <div className="chart-section">
                    <h3>Modified Recommendations</h3>
                    <p className="section-description">Cases where admin changed the AI's recommendation.</p>
                    <div className="modifications-table">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Original</th>
                            <th>Changed To</th>
                            <th>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conversions.modifiedRecommendations.map((item, index) => (
                            <tr key={index}>
                              <td>
                                <span className="rec-pill" style={{ backgroundColor: getRecommendationColor(item.original_recommendation) }}>
                                  {item.original_recommendation}
                                </span>
                              </td>
                              <td>
                                <span className="rec-pill" style={{ backgroundColor: getRecommendationColor(item.modified_to) }}>
                                  {item.modified_to}
                                </span>
                              </td>
                              <td>{item.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="chart-section">
                  <h3>Conversion Matrix</h3>
                  <p className="section-description">Shows what users decided vs. what was recommended.</p>
                  <div className="matrix-container">
                    {Object.entries(
                      conversions.conversionMatrix.reduce((acc, item) => {
                        if (!acc[item.recommendation]) acc[item.recommendation] = {};
                        acc[item.recommendation][item.decision] = item.count;
                        return acc;
                      }, {})
                    ).map(([rec, decisions]) => (
                      <div key={rec} className="matrix-row">
                        <div className="matrix-rec">
                          <span className="rec-pill" style={{ backgroundColor: getRecommendationColor(rec) }}>
                            {rec}
                          </span>
                        </div>
                        <div className="matrix-decisions">
                          {Object.entries(decisions).map(([decision, count]) => (
                            <span
                              key={decision}
                              className={`decision-chip ${decision === rec ? 'matched' : 'diverged'}`}
                              style={{ borderColor: getRecommendationColor(decision) }}
                            >
                              → {decision}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
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

export default AdminAnalytics;
