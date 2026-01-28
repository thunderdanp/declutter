import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useCategories } from '../context/CategoryContext';
import './ItemHistory.css';

function ItemHistory({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { getCategoryBySlug } = useCategories();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  useEffect(() => {
    fetchItems();
  }, [filter]);

  const fetchItems = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = '/api/items';
      
      if (filter !== 'all') {
        url += `?recommendation=${filter}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const recommendationLabels = {
    keep: 'Keep',
    storage: 'Storage',
    accessible: 'Accessible',
    sell: 'Sell',
    donate: 'Donate',
    discard: 'Discard'
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant</h2>
        </Link>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/profile" className="nav-link">Profile</Link>
          <Link to="/evaluate" className="nav-link">Evaluate Item</Link>
          <Link to="/my-items" className="nav-link active">My Items</Link>
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
          <h1 className="page-title">My Items</h1>
          <p className="page-subtitle">Review all your evaluated items</p>
        </div>

        <div className="filter-bar">
          <button
            className={`filter-btn filter-all ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Items
          </button>
          <button
            className={`filter-btn filter-keep ${filter === 'keep' ? 'active' : ''}`}
            onClick={() => setFilter('keep')}
          >
            Keep
          </button>
          <button
            className={`filter-btn filter-storage ${filter === 'storage' ? 'active' : ''}`}
            onClick={() => setFilter('storage')}
          >
            Storage
          </button>
          <button
            className={`filter-btn filter-sell ${filter === 'sell' ? 'active' : ''}`}
            onClick={() => setFilter('sell')}
          >
            Sell
          </button>
          <button
            className={`filter-btn filter-donate ${filter === 'donate' ? 'active' : ''}`}
            onClick={() => setFilter('donate')}
          >
            Donate
          </button>
          <button
            className={`filter-btn filter-discard ${filter === 'discard' ? 'active' : ''}`}
            onClick={() => setFilter('discard')}
          >
            Discard
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading items...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h2>No Items Yet</h2>
            <p>Start evaluating items to see them here</p>
            <Link to="/evaluate" className="btn btn-primary">
              Evaluate an Item
            </Link>
          </div>
        ) : (
          <div className="items-grid">
            {items.map(item => (
              <Link to={`/items/${item.id}`} key={item.id} className="item-card">
                {item.image_url && (
                  <div className="item-image">
                    <img src={item.image_url} alt={item.name} />
                  </div>
                )}
                <div className="item-content">
                  <h3>{item.name}</h3>
                  {item.description && (
                    <p className="item-description">{item.description}</p>
                  )}
                  <div className="item-meta">
                    {item.location && (
                      <span className="meta-tag">📍 {item.location}</span>
                    )}
                    {item.category && (
                      <span className="meta-tag">
                        {(() => {
                          const cat = getCategoryBySlug(item.category);
                          return cat ? `${cat.icon} ${cat.display_name}` : `🏷️ ${item.category}`;
                        })()}
                      </span>
                    )}
                  </div>
                  <div className="item-footer">
                    <span className={`recommendation-pill pill-${item.recommendation}`}>
                      {recommendationLabels[item.recommendation]}
                    </span>
                    <span className="item-date">{formatDate(item.created_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ItemHistory;
