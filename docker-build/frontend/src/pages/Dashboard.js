import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Dashboard.css';

function Dashboard({ setIsAuthenticated }) {
  const [stats, setStats] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'));
    setUser(userData);
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const getRecommendationCount = (recommendation) => {
    if (!stats?.byRecommendation) return 0;
    const item = stats.byRecommendation.find(r => r.recommendation === recommendation);
    return item ? parseInt(item.count) : 0;
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>Declutter Assistant</h2>
        </div>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link active">Dashboard</Link>
          <Link to="/profile" className="nav-link">Profile</Link>
          <Link to="/evaluate" className="nav-link">Evaluate Item</Link>
          <Link to="/history" className="nav-link">My Items</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Welcome back, {user?.firstName}!</h1>
          <p className="page-subtitle">Let's continue organizing your space</p>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="stats-grid">
              <Link to="/history" className="stat-card stat-total">
                <div className="stat-number">{stats?.total || 0}</div>
                <div className="stat-label">Total Items Evaluated</div>
              </Link>

              <Link to="/history?filter=keep" className="stat-card stat-keep">
                <div className="stat-number">{getRecommendationCount('keep')}</div>
                <div className="stat-label">Keep</div>
              </Link>

              <Link to="/history?filter=storage" className="stat-card stat-storage">
                <div className="stat-number">{getRecommendationCount('storage')}</div>
                <div className="stat-label">Storage</div>
              </Link>

              <Link to="/history?filter=sell" className="stat-card stat-sell">
                <div className="stat-number">{getRecommendationCount('sell')}</div>
                <div className="stat-label">Sell</div>
              </Link>

              <Link to="/history?filter=donate" className="stat-card stat-donate">
                <div className="stat-number">{getRecommendationCount('donate')}</div>
                <div className="stat-label">Donate</div>
              </Link>

              <Link to="/history?filter=discard" className="stat-card stat-discard">
                <div className="stat-number">{getRecommendationCount('discard')}</div>
                <div className="stat-label">Discard</div>
              </Link>
            </div>

            <div className="quick-actions">
              <h2 className="section-title">Quick Actions</h2>
              <div className="actions-grid">
                <Link to="/evaluate" className="action-card">
                  <div className="action-icon">📦</div>
                  <h3>Evaluate New Item</h3>
                  <p>Get personalized recommendations for your belongings</p>
                </Link>

                <Link to="/profile" className="action-card">
                  <div className="action-icon">👤</div>
                  <h3>Update Profile</h3>
                  <p>Refine your preferences and decision-making style</p>
                </Link>

                <Link to="/history" className="action-card">
                  <div className="action-icon">📋</div>
                  <h3>My Items</h3>
                  <p>Review all your evaluated items</p>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
