import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    is_system: false
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

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
      is_system: false
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
      is_system: template.is_system || false
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
      is_system: false
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
          <Link to="/admin/email-templates" className="nav-link active">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link">Announcements</Link>
          <Link to="/admin/settings" className="nav-link">Settings</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
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
                    <label htmlFor="is_system">Template Type</label>
                    <select
                      id="is_system"
                      className="form-control"
                      value={formData.is_system ? 'system' : 'custom'}
                      onChange={(e) => setFormData({ ...formData, is_system: e.target.value === 'system' })}
                    >
                      <option value="custom">Custom</option>
                      <option value="system">System</option>
                    </select>
                    <p className="form-help">System templates cannot be deleted</p>
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
                        <th>Description</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map((template) => (
                        <tr key={template.id}>
                          <td>
                            <strong>{template.name}</strong>
                          </td>
                          <td>{template.subject}</td>
                          <td>{template.description || '-'}</td>
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
                          <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>
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
