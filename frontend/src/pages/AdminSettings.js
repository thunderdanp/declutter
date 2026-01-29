import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';

function AdminSettings({ setIsAuthenticated }) {
  const [settings, setSettings] = useState({
    registration_mode: 'automatic'
  });
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from_address: ''
  });
  const [apiKeyStatus, setApiKeyStatus] = useState({
    hasDbKey: false,
    dbKeyPreview: null,
    hasEnvKey: false,
    activeSource: 'none'
  });
  const [newApiKey, setNewApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [message, setMessage] = useState('');
  const [smtpMessage, setSmtpMessage] = useState('');
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchSettings();
    fetchSmtpSettings();
    fetchApiKeyStatus();
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

  const fetchSmtpSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/smtp', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSmtpSettings({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || '587',
          smtp_user: data.smtp_user || '',
          smtp_password: data.smtp_password || '',
          smtp_from_address: data.smtp_from_address || ''
        });
      }
    } catch (error) {
      console.error('Error fetching SMTP settings:', error);
    }
  };

  const fetchApiKeyStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/api-key', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeyStatus(data);
      }
    } catch (error) {
      console.error('Error fetching API key status:', error);
    }
  };

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) {
      setApiKeyMessage('Please enter an API key');
      return;
    }

    setSavingApiKey(true);
    setApiKeyMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/api-key', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ api_key: newApiKey })
      });

      if (response.ok) {
        setApiKeyMessage('API key saved successfully!');
        setNewApiKey('');
        fetchApiKeyStatus();
        setTimeout(() => setApiKeyMessage(''), 3000);
      } else {
        setApiKeyMessage('Failed to save API key');
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      setApiKeyMessage('Failed to save API key');
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!window.confirm('Remove the API key from database? Will fall back to environment variable if set.')) return;

    setSavingApiKey(true);
    setApiKeyMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/api-key', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clear_key: true })
      });

      if (response.ok) {
        setApiKeyMessage('API key removed');
        fetchApiKeyStatus();
        setTimeout(() => setApiKeyMessage(''), 3000);
      } else {
        setApiKeyMessage('Failed to remove API key');
      }
    } catch (error) {
      console.error('Error removing API key:', error);
      setApiKeyMessage('Failed to remove API key');
    } finally {
      setSavingApiKey(false);
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

  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    setSmtpMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/smtp', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(smtpSettings)
      });

      if (response.ok) {
        setSmtpMessage('SMTP settings saved successfully!');
        setTimeout(() => setSmtpMessage(''), 3000);
      } else {
        setSmtpMessage('Failed to save SMTP settings');
      }
    } catch (error) {
      console.error('Error saving SMTP settings:', error);
      setSmtpMessage('Failed to save SMTP settings');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/smtp/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        setSmtpMessage('SMTP connection successful!');
      } else {
        setSmtpMessage(`SMTP test failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error testing SMTP:', error);
      setSmtpMessage('Failed to test SMTP connection');
    } finally {
      setTestingSmtp(false);
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
          <Link to="/admin/categories" className="nav-link">Categories</Link>
          <Link to="/admin/api-usage" className="nav-link">API Usage</Link>
          <Link to="/admin/recommendations" className="nav-link">Recommendations</Link>
          <Link to="/admin/analytics" className="nav-link">Analytics</Link>
          <Link to="/admin/activity-logs" className="nav-link">Activity Logs</Link>
          <Link to="/admin/email-templates" className="nav-link">Email Templates</Link>
          <Link to="/admin/announcements" className="nav-link">Announcements</Link>
          <Link to="/admin/settings" className="nav-link active">Settings</Link>
          <Link to="/dashboard" className="nav-link">User View</Link>
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
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
                    'Users can create accounts and start using the app right away.'}
                  {settings.registration_mode === 'approval' &&
                    'New users must wait for admin approval before they can login.'}
                  {settings.registration_mode === 'disallowed' &&
                    'No new users can register. Existing users can still login.'}
                </p>
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
                  {saving ? 'Saving...' : 'Save Registration Settings'}
                </button>
              </div>
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">SMTP Configuration</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Configure your email server settings to enable email notifications, password resets, and announcements.
              </p>

              <div className="form-group">
                <label htmlFor="smtp_host">SMTP Server</label>
                <input
                  type="text"
                  id="smtp_host"
                  className="form-control"
                  placeholder="e.g., smtp.gmail.com"
                  value={smtpSettings.smtp_host}
                  onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_host: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="smtp_port">SMTP Port</label>
                <input
                  type="text"
                  id="smtp_port"
                  className="form-control"
                  placeholder="587"
                  value={smtpSettings.smtp_port}
                  onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_port: e.target.value })}
                />
                <p className="form-help">Common ports: 587 (TLS), 465 (SSL), 25 (unencrypted)</p>
              </div>

              <div className="form-group">
                <label htmlFor="smtp_user">SMTP Username</label>
                <input
                  type="text"
                  id="smtp_user"
                  className="form-control"
                  placeholder="your-email@example.com"
                  value={smtpSettings.smtp_user}
                  onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_user: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="smtp_password">SMTP Password</label>
                <input
                  type="password"
                  id="smtp_password"
                  className="form-control"
                  placeholder="Enter SMTP password or app password"
                  value={smtpSettings.smtp_password}
                  onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_password: e.target.value })}
                />
                <p className="form-help">
                  For Gmail, use an app-specific password from{' '}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">
                    Google App Passwords
                  </a>
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="smtp_from_address">From Address</label>
                <input
                  type="email"
                  id="smtp_from_address"
                  className="form-control"
                  placeholder="noreply@example.com"
                  value={smtpSettings.smtp_from_address}
                  onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_from_address: e.target.value })}
                />
                <p className="form-help">The email address that will appear as the sender</p>
              </div>

              <div className="settings-actions">
                {smtpMessage && (
                  <div className={`message ${smtpMessage.includes('success') ? 'message-success' : 'message-error'}`}>
                    {smtpMessage}
                  </div>
                )}
                <div className="button-group">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveSmtp}
                    disabled={savingSmtp}
                  >
                    {savingSmtp ? 'Saving...' : 'Save SMTP Settings'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleTestSmtp}
                    disabled={testingSmtp || !smtpSettings.smtp_host}
                  >
                    {testingSmtp ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h2 className="settings-section-title">Anthropic API Key</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Configure the system API key for Claude image analysis. Database setting takes priority over environment variable.
              </p>

              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Current Status:</strong>{' '}
                  {apiKeyStatus.activeSource === 'database' && (
                    <span className="status-badge status-approved">Using Database Key ({apiKeyStatus.dbKeyPreview})</span>
                  )}
                  {apiKeyStatus.activeSource === 'environment' && (
                    <span className="status-badge status-info">Using Environment Variable ({apiKeyStatus.envKeyPreview})</span>
                  )}
                  {apiKeyStatus.activeSource === 'none' && (
                    <span className="status-badge status-pending">No API Key Configured</span>
                  )}
                </div>
                {apiKeyStatus.hasEnvKey && apiKeyStatus.hasDbKey && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    Environment variable is set but database key takes priority.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="api_key">
                  {apiKeyStatus.hasDbKey ? 'Update API Key' : 'Set API Key'}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    id="api_key"
                    className="form-control"
                    placeholder="sk-ant-..."
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveApiKey}
                    disabled={savingApiKey || !newApiKey.trim()}
                  >
                    {savingApiKey ? 'Saving...' : 'Save'}
                  </button>
                  {apiKeyStatus.hasDbKey && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleClearApiKey}
                      disabled={savingApiKey}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="form-help">
                  Get your API key from{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
                    console.anthropic.com
                  </a>
                </p>
              </div>

              {apiKeyMessage && (
                <div className={`message ${apiKeyMessage.includes('success') || apiKeyMessage.includes('removed') ? 'message-success' : 'message-error'}`}>
                  {apiKeyMessage}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSettings;
