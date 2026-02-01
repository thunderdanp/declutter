import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCategories } from '../context/CategoryContext';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';
import './AdminCategories.css';

// Common emoji icons for category selection
const ICON_OPTIONS = [
  '👕', '📚', '💻', '🍳', '🖼️', '🛋️', '🧸', '🔧', '📦',
  '🎮', '🎵', '📷', '👟', '💍', '🎒', '🧴', '🏃', '🎨',
  '🌿', '🚗', '✈️', '🏠', '💼', '🎁', '🔑', '📱', '⌚'
];

// Color options
const COLOR_OPTIONS = [
  '#9C27B0', '#795548', '#2196F3', '#FF9800', '#E91E63',
  '#607D8B', '#FFEB3B', '#9E9E9E', '#78909C', '#4CAF50',
  '#F44336', '#3F51B5', '#00BCD4', '#8BC34A', '#FF5722'
];

function AdminCategories({ setIsAuthenticated }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    icon: '📦',
    color: '#78909C',
    sort_order: 0,
    is_default: false
  });
  const [mergeData, setMergeData] = useState({
    sourceId: '',
    targetId: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { refreshCategories } = useCategories();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setIsMerging(false);
    setSelectedCategory(null);
    const maxSortOrder = categories.length > 0
      ? Math.max(...categories.filter(c => !c.is_default).map(c => c.sort_order)) + 1
      : 1;
    setFormData({
      name: '',
      display_name: '',
      icon: '📦',
      color: '#78909C',
      sort_order: maxSortOrder,
      is_default: false
    });
  };

  const handleEdit = (category) => {
    setSelectedCategory(category);
    setIsEditing(true);
    setIsCreating(false);
    setIsMerging(false);
    setFormData({
      name: category.name,
      display_name: category.display_name,
      icon: category.icon || '📦',
      color: category.color || '#78909C',
      sort_order: category.sort_order || 0,
      is_default: category.is_default || false
    });
  };

  const handleMergeStart = () => {
    setIsMerging(true);
    setIsEditing(false);
    setIsCreating(false);
    setSelectedCategory(null);
    setMergeData({ sourceId: '', targetId: '' });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setIsMerging(false);
    setSelectedCategory(null);
    setFormData({
      name: '',
      display_name: '',
      icon: '📦',
      color: '#78909C',
      sort_order: 0,
      is_default: false
    });
    setMergeData({ sourceId: '', targetId: '' });
    setMessage('');
  };

  const handleSave = async () => {
    if (!formData.name || !formData.display_name) {
      setMessage('Name and display name are required');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const url = isCreating
        ? '/api/admin/categories'
        : `/api/admin/categories/${selectedCategory.id}`;
      const method = isCreating ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setMessage(isCreating ? 'Category created successfully!' : 'Category updated successfully!');
        await fetchCategories();
        await refreshCategories();
        setTimeout(() => {
          handleCancel();
        }, 1500);
      } else {
        const data = await response.json();
        setMessage(data.error || 'Failed to save category');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      setMessage('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    if (category.is_default) {
      alert('Cannot delete the default category');
      return;
    }

    const itemCount = parseInt(category.item_count) || 0;
    const confirmMessage = itemCount > 0
      ? `Are you sure you want to delete "${category.display_name}"? ${itemCount} item(s) will be moved to the default category.`
      : `Are you sure you want to delete "${category.display_name}"?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchCategories();
        await refreshCategories();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete category');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    }
  };

  const handleMerge = async () => {
    if (!mergeData.sourceId || !mergeData.targetId) {
      setMessage('Please select both source and target categories');
      return;
    }

    if (mergeData.sourceId === mergeData.targetId) {
      setMessage('Source and target must be different categories');
      return;
    }

    const sourceCategory = categories.find(c => c.id === parseInt(mergeData.sourceId));
    const targetCategory = categories.find(c => c.id === parseInt(mergeData.targetId));

    if (!window.confirm(
      `Are you sure you want to merge "${sourceCategory?.display_name}" into "${targetCategory?.display_name}"? ` +
      `All items in "${sourceCategory?.display_name}" will be moved to "${targetCategory?.display_name}" and the source category will be deleted.`
    )) {
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/categories/merge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceId: parseInt(mergeData.sourceId),
          targetId: parseInt(mergeData.targetId)
        })
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`Categories merged! ${data.itemsMoved} item(s) moved.`);
        await fetchCategories();
        await refreshCategories();
        setTimeout(() => {
          handleCancel();
        }, 2000);
      } else {
        const data = await response.json();
        setMessage(data.error || 'Failed to merge categories');
      }
    } catch (error) {
      console.error('Error merging categories:', error);
      setMessage('Failed to merge categories');
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
          <Link to="/admin/categories" className="nav-link active">Categories</Link>
          <Link to="/admin/api-usage" className="nav-link">API Usage</Link>
          <Link to="/admin/ai-config" className="nav-link">AI Config</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link">Activity Logs</Link>
          <Link to="/admin/email-templates" className="nav-link">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link">Announcements</Link>
          <Link to="/admin/settings" className="nav-link">Settings</Link>
          <Link to="/admin/system-health" className="nav-link">System Health</Link>
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
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Manage item categories</p>
        </div>

        {loading ? (
          <div className="loading">Loading categories...</div>
        ) : (
          <>
            {(isEditing || isCreating) ? (
              <div className="settings-container">
                <div className="settings-section">
                  <h2 className="settings-section-title">
                    {isCreating ? 'Create New Category' : `Edit Category: ${selectedCategory?.display_name}`}
                  </h2>

                  <div className="form-group">
                    <label htmlFor="name">Category Name</label>
                    <input
                      type="text"
                      id="name"
                      className="form-control"
                      placeholder="e.g., Sports Equipment"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                    <p className="form-help">A unique name for the category (will generate slug automatically)</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="display_name">Display Name</label>
                    <input
                      type="text"
                      id="display_name"
                      className="form-control"
                      placeholder="e.g., Sports & Fitness Equipment"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    />
                    <p className="form-help">The name shown to users in dropdowns</p>
                  </div>

                  <div className="form-row-category">
                    <div className="form-group">
                      <label>Icon</label>
                      <div className="icon-selector">
                        {ICON_OPTIONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className={`icon-option ${formData.icon === icon ? 'selected' : ''}`}
                            onClick={() => setFormData({ ...formData, icon })}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Color</label>
                      <div className="color-selector">
                        {COLOR_OPTIONS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`color-option ${formData.color === color ? 'selected' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setFormData({ ...formData, color })}
                          />
                        ))}
                      </div>
                      <div className="color-preview" style={{ backgroundColor: formData.color }}>
                        <span className="preview-icon">{formData.icon}</span>
                        <span className="preview-text">{formData.display_name || 'Preview'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-row-category">
                    <div className="form-group">
                      <label htmlFor="sort_order">Sort Order</label>
                      <input
                        type="number"
                        id="sort_order"
                        className="form-control"
                        value={formData.sort_order}
                        onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                      />
                      <p className="form-help">Lower numbers appear first</p>
                    </div>

                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.is_default}
                          onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                        />
                        <span>Default Category</span>
                      </label>
                      <p className="form-help">Items are moved here when their category is deleted</p>
                    </div>
                  </div>

                  <div className="settings-actions">
                    {message && (
                      <div className={`message ${message.includes('success') ? 'message-success' : 'message-error'}`}>
                        {message}
                      </div>
                    )}
                    <div className="button-group">
                      <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || !formData.name || !formData.display_name}
                      >
                        {saving ? 'Saving...' : 'Save Category'}
                      </button>
                      <button className="btn btn-secondary" onClick={handleCancel}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : isMerging ? (
              <div className="settings-container">
                <div className="settings-section">
                  <h2 className="settings-section-title">Merge Categories</h2>
                  <p className="merge-description">
                    Merge one category into another. All items from the source category will be moved
                    to the target category, and the source category will be deleted.
                  </p>

                  <div className="form-group">
                    <label htmlFor="sourceId">Source Category (will be deleted)</label>
                    <select
                      id="sourceId"
                      className="form-control"
                      value={mergeData.sourceId}
                      onChange={(e) => setMergeData({ ...mergeData, sourceId: e.target.value })}
                    >
                      <option value="">Select source category...</option>
                      {categories
                        .filter(c => !c.is_default)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.icon} {category.display_name} ({category.item_count} items)
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="targetId">Target Category (will receive items)</label>
                    <select
                      id="targetId"
                      className="form-control"
                      value={mergeData.targetId}
                      onChange={(e) => setMergeData({ ...mergeData, targetId: e.target.value })}
                    >
                      <option value="">Select target category...</option>
                      {categories
                        .filter(c => c.id !== parseInt(mergeData.sourceId))
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.icon} {category.display_name} ({category.item_count} items)
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="settings-actions">
                    {message && (
                      <div className={`message ${message.includes('success') || message.includes('merged') ? 'message-success' : 'message-error'}`}>
                        {message}
                      </div>
                    )}
                    <div className="button-group">
                      <button
                        className="btn btn-primary"
                        onClick={handleMerge}
                        disabled={saving || !mergeData.sourceId || !mergeData.targetId}
                      >
                        {saving ? 'Merging...' : 'Merge Categories'}
                      </button>
                      <button className="btn btn-secondary" onClick={handleCancel}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="settings-actions category-actions">
                  <button className="btn btn-primary" onClick={handleCreate}>
                    Create New Category
                  </button>
                  <button className="btn btn-secondary" onClick={handleMergeStart}>
                    Merge Categories
                  </button>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Slug</th>
                        <th>Items</th>
                        <th>Order</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category) => (
                        <tr key={category.id}>
                          <td>
                            <div className="category-cell">
                              <span
                                className="category-badge"
                                style={{ backgroundColor: category.color || '#78909C' }}
                              >
                                {category.icon}
                              </span>
                              <span className="category-name">{category.display_name}</span>
                            </div>
                          </td>
                          <td><code>{category.slug}</code></td>
                          <td>{category.item_count || 0}</td>
                          <td>{category.sort_order}</td>
                          <td>
                            {category.is_default ? (
                              <span className="status-badge status-admin">Default</span>
                            ) : (
                              <span className="status-badge status-approved">Custom</span>
                            )}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-approve"
                                onClick={() => handleEdit(category)}
                              >
                                Edit
                              </button>
                              {!category.is_default && (
                                <button
                                  className="btn-delete"
                                  onClick={() => handleDelete(category)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {categories.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                            No categories found. Create one to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

export default AdminCategories;
