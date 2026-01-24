import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Admin.css';

function AdminSettings({ setIsAuthenticated }) {
  const [settings, setSettings] = useState({
    registration_mode: 'automatic'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/settings/registration_mode', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: settings.registration_mode })
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
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>Declutter Assistant - Admin</h2>
        </div>
        <div className="nav-links">
          <Link to="/admin" className="nav-link">Admin Dashboard</Link>
          <Link to="/admin/users" className="nav-link">Users</Link>
          <Link to="/admin/settings" className="nav-link active">Settings</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Configure application behavior</p>
        </div>

        {loading ? (
          <div className="loading">Loading settings...</div>
        ) : (
          <div className="settings-container">
            <div className="settings-section">
              <h2 className="settings-section-title">Registration Settings</h2>
              
              <div className="form-group">
                <label htmlFor="registration_mode">Registration Mode</label>
                <select
                  id="registration_mode"
                  className="form-control"
                  value={settings.registration_mode}
                  onChange={(e) => setSettings({ ...settings, registration_mode: e.target.value })}
                >
                  <option value="automatic">Automatic - Users can register and login immediately</option>
                  <option value="approval">Approval Required - Admin must approve each new user</option>
                  <option value="disallowed">Disallowed - Registration is disabled</option>
                </select>
                <p className="form-help">
                  {settings.registration_mode === 'automatic' && 
                    '✅ Users can create accounts and start using the app right away.'}
                  {settings.registration_mode === 'approval' && 
                    '⏳ New users must wait for admin approval before they can login.'}
                  {settings.registration_mode === 'disallowed' && 
                    '🚫 No new users can register. Existing users can still login.'}
                </p>
              </div>
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">Email Configuration</h2>
              <div className="info-box">
                <p><strong>📧 Email Settings</strong></p>
                <p>Email configuration is managed through environment variables in your docker-compose.yml:</p>
                <ul>
                  <li><code>SMTP_HOST</code> - SMTP server address</li>
                  <li><code>SMTP_PORT</code> - SMTP port (usually 587)</li>
                  <li><code>SMTP_USER</code> - Your email address</li>
                  <li><code>SMTP_PASS</code> - SMTP password or app password</li>
                  <li><code>APP_URL</code> - Your application URL</li>
                </ul>
                <p>For Gmail: Create an app-specific password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Google App Passwords</a></p>
              </div>
            </div>

            <div className="settings-actions">
              {message && (
                <div className={`message ${message.includes('success') ? 'message-success' : 'message-error'}`}>
                  {message}
                </div>
              )}
              <button 
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSettings;
