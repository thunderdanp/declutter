import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';

function AdminEmailTemplates({ setIsAuthenticated }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
    description: '',
    trigger_event: '',
    is_enabled: true
  });

  const triggerEvents = [
    { value: '', label: 'None (Manual only)', description: 'Template must be triggered manually' },
    { value: 'user_registration', label: 'User Registration', description: 'When a new user registers' },
    { value: 'user_approved', label: 'User Approved', description: 'When admin approves a user' },
    { value: 'password_reset', label: 'Password Reset', description: 'When user requests password reset' },
    { value: 'announcement', label: 'Announcement', description: 'When admin sends an announcement' },
    { value: 'item_evaluated', label: 'Item Evaluated', description: 'When an item is evaluated' },
    { value: 'manual', label: 'Manual', description: 'Triggered manually only' }
  ];
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/email-templates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedTemplate(null);
    setFormData({
      name: '',
      subject: '',
      body: '',
      description: '',
      trigger_event: '',
      is_enabled: true
    });
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setIsEditing(true);
    setIsCreating(false);
    setFormData({
      name: template.name,
      subject: template.subject,
      body: template.body,
      description: template.description || '',
      trigger_event: template.trigger_event || '',
      is_enabled: template.is_enabled !== false
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setSelectedTemplate(null);
    setFormData({
      name: '',
      subject: '',
      body: '',
      description: '',
      trigger_event: '',
      is_enabled: true
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const url = isCreating
        ? '/api/admin/email-templates'
        : `/api/admin/email-templates/${selectedTemplate.id}`;
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
        setMessage(isCreating ? 'Template created successfully!' : 'Template updated successfully!');
        fetchTemplates();
        setTimeout(() => {
          handleCancel();
          setMessage('');
        }, 1500);
      } else {
        const data = await response.json();
        setMessage(data.error || 'Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      setMessage('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template) => {
    if (!window.confirm(`Are you sure you want to delete the "${template.name}" template?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/email-templates/${template.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        fetchTemplates();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handleToggleEnabled = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/email-templates/${template.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: template.subject,
          body: template.body,
          description: template.description,
          trigger_event: template.trigger_event,
          is_enabled: !template.is_enabled
        })
      });

      if (response.ok) {
        fetchTemplates();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update template');
      }
    } catch (error) {
      console.error('Error toggling template:', error);
      alert('Failed to update template');
    }
  };

  const getTriggerLabel = (triggerEvent) => {
    const event = triggerEvents.find(e => e.value === triggerEvent);
    return event ? event.label : triggerEvent || 'None';
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
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
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link">Activity Logs</Link>
          <Link to="/admin/email-templates" className="nav-link active">Email Templates</Link>
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
          <h1 className="page-title">Email Templates</h1>
          <p className="page-subtitle">Manage email templates for notifications</p>
        </div>

        {loading ? (
          <div className="loading">Loading templates...</div>
        ) : (
          <>
            {(isEditing || isCreating) ? (
              <div className="settings-container">
                <div className="settings-section">
                  <h2 className="settings-section-title">
                    {isCreating ? 'Create New Template' : `Edit Template: ${selectedTemplate?.name}`}
                  </h2>

                  {isCreating && (
                    <div className="form-group">
                      <label htmlFor="name">Template Name</label>
                      <input
                        type="text"
                        id="name"
                        className="form-control"
                        placeholder="e.g., order_confirmation"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                      <p className="form-help">A unique identifier for this template (lowercase, no spaces)</p>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="subject">Email Subject</label>
                    <input
                      type="text"
                      id="subject"
                      className="form-control"
                      placeholder="e.g., Welcome to Declutter Assistant!"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    />
                    <p className="form-help">Use {'{{variableName}}'} for dynamic content</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="body">Email Body</label>
                    <textarea
                      id="body"
                      className="form-control"
                      rows="12"
                      placeholder="Enter the email content..."
                      value={formData.body}
                      onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    />
                    <p className="form-help">
                      Available variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{email}}'}, {'{{title}}'}, {'{{content}}'}, {'{{resetLink}}'}
                    </p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="description">Description (Optional)</label>
                    <input
                      type="text"
                      id="description"
                      className="form-control"
                      placeholder="Brief description of when this template is used"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="trigger_event">Trigger Event</label>
                    <select
                      id="trigger_event"
                      className="form-control"
                      value={formData.trigger_event}
                      onChange={(e) => setFormData({ ...formData, trigger_event: e.target.value })}
                    >
                      {triggerEvents.map((event) => (
                        <option key={event.value} value={event.value}>
                          {event.label}
                        </option>
                      ))}
                    </select>
                    <p className="form-help">
                      {triggerEvents.find(e => e.value === formData.trigger_event)?.description || 'Select when this template should be automatically triggered'}
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.is_enabled}
                        onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
                      />
                      <span style={{ marginLeft: '0.5rem' }}>Template Enabled</span>
                    </label>
                    <p className="form-help">When disabled, this template will not send emails even if triggered</p>
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
                        disabled={saving || !formData.subject || !formData.body || (isCreating && !formData.name)}
                      >
                        {saving ? 'Saving...' : 'Save Template'}
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
                <div className="settings-actions" style={{ marginBottom: '1.5rem' }}>
                  <button className="btn btn-primary" onClick={handleCreate}>
                    Create New Template
                  </button>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Subject</th>
                        <th>Trigger</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map((template) => (
                        <tr key={template.id}>
                          <td>
                            <strong>{template.name}</strong>
                            {template.description && (
                              <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.25rem' }}>
                                {template.description}
                              </div>
                            )}
                          </td>
                          <td>{template.subject}</td>
                          <td>
                            {template.trigger_event ? (
                              <span className="status-badge status-info">
                                {getTriggerLabel(template.trigger_event)}
                              </span>
                            ) : (
                              <span style={{ color: '#999' }}>None</span>
                            )}
                          </td>
                          <td>
                            <button
                              className={`status-badge ${template.is_enabled !== false ? 'status-approved' : 'status-pending'}`}
                              onClick={() => handleToggleEnabled(template)}
                              style={{ cursor: 'pointer', border: 'none' }}
                              title={template.is_enabled !== false ? 'Click to disable' : 'Click to enable'}
                            >
                              {template.is_enabled !== false ? 'Enabled' : 'Disabled'}
                            </button>
                          </td>
                          <td>
                            {template.is_system ? (
                              <span className="status-badge status-admin">System</span>
                            ) : (
                              <span className="status-badge status-approved">Custom</span>
                            )}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-approve"
                                onClick={() => handleEdit(template)}
                              >
                                Edit
                              </button>
                              {!template.is_system && (
                                <button
                                  className="btn-delete"
                                  onClick={() => handleDelete(template)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {templates.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                            No email templates found. Create one to get started.
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
  );
}

export default AdminEmailTemplates;
