import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';

function AdminAnnouncements({ setIsAuthenticated }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: ''
  });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/announcements', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data.announcements);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedAnnouncement(null);
    setFormData({
      title: '',
      content: ''
    });
  };

  const handleEdit = (announcement) => {
    setSelectedAnnouncement(announcement);
    setIsEditing(true);
    setIsCreating(false);
    setFormData({
      title: announcement.title,
      content: announcement.content
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setSelectedAnnouncement(null);
    setFormData({
      title: '',
      content: ''
    });
    setMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const url = isCreating
        ? '/api/admin/announcements'
        : `/api/admin/announcements/${selectedAnnouncement.id}`;
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
        setMessage(isCreating ? 'Announcement created successfully!' : 'Announcement updated successfully!');
        fetchAnnouncements();
        setTimeout(() => {
          handleCancel();
        }, 1500);
      } else {
        const data = await response.json();
        setMessage(data.error || 'Failed to save announcement');
      }
    } catch (error) {
      console.error('Error saving announcement:', error);
      setMessage('Failed to save announcement');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (announcement) => {
    if (!window.confirm(`Are you sure you want to send this announcement to all users?\n\nTitle: ${announcement.title}\n\nThis action cannot be undone.`)) {
      return;
    }

    setSending(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/announcements/${announcement.id}/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (response.ok) {
        alert(`Announcement sent successfully to ${data.sentCount} users!`);
        fetchAnnouncements();
      } else {
        alert(data.error || 'Failed to send announcement');
      }
    } catch (error) {
      console.error('Error sending announcement:', error);
      alert('Failed to send announcement');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (announcement) => {
    if (!window.confirm(`Are you sure you want to delete the announcement "${announcement.title}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/announcements/${announcement.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        fetchAnnouncements();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete announcement');
      }
    } catch (error) {
      console.error('Error deleting announcement:', error);
      alert('Failed to delete announcement');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
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
          <Link to="/admin/categories" className="nav-link">Categories</Link>
          <Link to="/admin/api-usage" className="nav-link">API Usage</Link>
          <Link to="/admin/ai-config" className="nav-link">AI Config</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link">Activity Logs</Link>
          <Link to="/admin/email-templates" className="nav-link">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link active">Announcements</Link>
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
          <h1 className="page-title">Announcements</h1>
          <p className="page-subtitle">Send announcements to all users via email</p>
        </div>

        {loading ? (
          <div className="loading">Loading announcements...</div>
        ) : (
          <>
            {(isEditing || isCreating) ? (
              <div className="settings-container">
                <div className="settings-section">
                  <h2 className="settings-section-title">
                    {isCreating ? 'Create New Announcement' : 'Edit Announcement'}
                  </h2>

                  <div className="form-group">
                    <label htmlFor="title">Title</label>
                    <input
                      type="text"
                      id="title"
                      className="form-control"
                      placeholder="e.g., New Feature: Item Categories"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="content">Content</label>
                    <textarea
                      id="content"
                      className="form-control"
                      rows="10"
                      placeholder="Write your announcement content here..."
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    />
                    <p className="form-help">
                      This content will be sent to all users who have opted in to receive announcements.
                    </p>
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
                        disabled={saving || !formData.title || !formData.content}
                      >
                        {saving ? 'Saving...' : 'Save Announcement'}
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
                    Create New Announcement
                  </button>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Created</th>
                        <th>Created By</th>
                        <th>Status</th>
                        <th>Recipients</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcements.map((announcement) => (
                        <tr key={announcement.id}>
                          <td>
                            <strong>{announcement.title}</strong>
                            <br />
                            <small style={{ color: '#7f8c8d' }}>
                              {announcement.content.substring(0, 80)}
                              {announcement.content.length > 80 ? '...' : ''}
                            </small>
                          </td>
                          <td>{formatDate(announcement.created_at)}</td>
                          <td>
                            {announcement.first_name
                              ? `${announcement.first_name} ${announcement.last_name}`
                              : '-'}
                          </td>
                          <td>
                            {announcement.sent_at ? (
                              <span className="status-badge status-approved">
                                Sent {formatDate(announcement.sent_at)}
                              </span>
                            ) : (
                              <span className="status-badge status-pending">Draft</span>
                            )}
                          </td>
                          <td>
                            {announcement.sent_at ? announcement.recipient_count : '-'}
                          </td>
                          <td>
                            <div className="action-buttons">
                              {!announcement.sent_at && (
                                <>
                                  <button
                                    className="btn-approve"
                                    onClick={() => handleEdit(announcement)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn-approve"
                                    onClick={() => handleSend(announcement)}
                                    disabled={sending}
                                    style={{ background: '#D46F4D' }}
                                  >
                                    {sending ? 'Sending...' : 'Send'}
                                  </button>
                                </>
                              )}
                              <button
                                className="btn-delete"
                                onClick={() => handleDelete(announcement)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {announcements.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                            No announcements yet. Create one to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="info-box" style={{ marginTop: '2rem' }}>
                  <p><strong>About Announcements</strong></p>
                  <p>
                    Announcements are sent via email to all users who have opted in to receive them.
                    Make sure your SMTP settings are configured in the Settings page before sending.
                  </p>
                  <p>
                    Once an announcement is sent, it cannot be edited. You can still delete it for record-keeping purposes.
                  </p>
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

export default AdminAnnouncements;
