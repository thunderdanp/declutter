import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Settings.css';

function Settings({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState({
    announcements: true,
    account_updates: true,
    item_recommendations: true,
    weekly_digest: false
  });
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [apiSettings, setApiSettings] = useState({
    hasApiKey: false,
    apiKeyPreview: null,
    imageAnalysisEnabled: true
  });
  const [newApiKey, setNewApiKey] = useState('');
  const [savingApiSettings, setSavingApiSettings] = useState(false);
  const [apiMessage, setApiMessage] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchNotificationPreferences();
    fetchApiSettings();
  }, []);

  const fetchNotificationPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/notification-preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setNotificationPrefs({
          announcements: data.preferences.announcements ?? true,
          account_updates: data.preferences.account_updates ?? true,
          item_recommendations: data.preferences.item_recommendations ?? true,
          weekly_digest: data.preferences.weekly_digest ?? false
        });
      }
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    }
  };

  const fetchApiSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/api-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setApiSettings({
          hasApiKey: data.hasApiKey,
          apiKeyPreview: data.apiKeyPreview,
          imageAnalysisEnabled: data.imageAnalysisEnabled
        });
      }
    } catch (error) {
      console.error('Error fetching API settings:', error);
    }
  };

  const handleToggleImageAnalysis = async () => {
    setSavingApiSettings(true);
    setApiMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/api-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          image_analysis_enabled: !apiSettings.imageAnalysisEnabled
        })
      });

      if (response.ok) {
        const data = await response.json();
        setApiSettings(prev => ({
          ...prev,
          imageAnalysisEnabled: data.imageAnalysisEnabled
        }));
        setApiMessage('Settings updated!');
        setTimeout(() => setApiMessage(''), 3000);
      } else {
        setApiMessage('Failed to update settings');
      }
    } catch (err) {
      setApiMessage('Network error. Please try again.');
    } finally {
      setSavingApiSettings(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) {
      setApiMessage('Please enter an API key');
      return;
    }

    setSavingApiSettings(true);
    setApiMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/api-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          anthropic_api_key: newApiKey
        })
      });

      if (response.ok) {
        const data = await response.json();
        setApiSettings(prev => ({
          ...prev,
          hasApiKey: data.hasApiKey,
          apiKeyPreview: data.apiKeyPreview
        }));
        setNewApiKey('');
        setApiMessage('API key saved!');
        setTimeout(() => setApiMessage(''), 3000);
      } else {
        setApiMessage('Failed to save API key');
      }
    } catch (err) {
      setApiMessage('Network error. Please try again.');
    } finally {
      setSavingApiSettings(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!window.confirm('Are you sure you want to remove your API key?')) {
      return;
    }

    setSavingApiSettings(true);
    setApiMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/api-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clear_api_key: true
        })
      });

      if (response.ok) {
        setApiSettings(prev => ({
          ...prev,
          hasApiKey: false,
          apiKeyPreview: null
        }));
        setApiMessage('API key removed');
        setTimeout(() => setApiMessage(''), 3000);
      } else {
        setApiMessage('Failed to remove API key');
      }
    } catch (err) {
      setApiMessage('Network error. Please try again.');
    } finally {
      setSavingApiSettings(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (response.ok) {
        setMessage('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationChange = (key) => {
    setNotificationPrefs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveNotifications = async () => {
    setSavingNotifications(true);
    setNotificationMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(notificationPrefs)
      });

      if (response.ok) {
        setNotificationMessage('Notification preferences saved!');
        setTimeout(() => setNotificationMessage(''), 3000);
      } else {
        setNotificationMessage('Failed to save preferences');
      }
    } catch (err) {
      setNotificationMessage('Network error. Please try again.');
    } finally {
      setSavingNotifications(false);
    }
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
          <Link to="/my-items" className="nav-link">My Items</Link>
          <Link to="/household" className="nav-link">Household</Link>
          <Link to="/settings" className="nav-link active">Settings</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account preferences</p>
        </div>

        <div className="settings-grid">
          <div className="card">
            <h2 className="section-heading">Appearance</h2>
            <div className="setting-item">
              <div className="setting-info">
                <h3>Dark Mode</h3>
                <p>Switch between light and dark themes</p>
              </div>
              <button onClick={toggleTheme} className="btn btn-secondary">
                {isDark ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode'}
              </button>
            </div>
          </div>

          <div className="card">
            <h2 className="section-heading">Email Notifications</h2>
            <div className="setting-item">
              <div className="setting-info">
                <h3>Announcements</h3>
                <p>Receive important announcements and updates</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPrefs.announcements}
                  onChange={() => handleNotificationChange('announcements')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <h3>Account Updates</h3>
                <p>Get notified about account-related changes</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPrefs.account_updates}
                  onChange={() => handleNotificationChange('account_updates')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <h3>Item Recommendations</h3>
                <p>Receive updates when items are analyzed</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPrefs.item_recommendations}
                  onChange={() => handleNotificationChange('item_recommendations')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <h3>Weekly Digest</h3>
                <p>Get a weekly summary of your decluttering progress</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPrefs.weekly_digest}
                  onChange={() => handleNotificationChange('weekly_digest')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            {notificationMessage && (
              <div className={`${notificationMessage.includes('saved') ? 'success-message' : 'error-message'}`}>
                {notificationMessage}
              </div>
            )}
            <button
              onClick={handleSaveNotifications}
              className="btn btn-primary"
              disabled={savingNotifications}
              style={{ marginTop: '1rem' }}
            >
              {savingNotifications ? 'Saving...' : 'Save Notification Preferences'}
            </button>
          </div>

          <div className="card">
            <h2 className="section-heading">AI Image Analysis</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Configure how image analysis works for your items. You can use your own Anthropic API key or use the system default (if available).
            </p>

            <div className="setting-item">
              <div className="setting-info">
                <h3>Enable Image Analysis</h3>
                <p>Allow AI to analyze images of your items</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={apiSettings.imageAnalysisEnabled}
                  onChange={handleToggleImageAnalysis}
                  disabled={savingApiSettings}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="setting-info" style={{ marginBottom: '1rem' }}>
                <h3>Your Anthropic API Key</h3>
                <p>
                  {apiSettings.hasApiKey
                    ? `Current key: ${apiSettings.apiKeyPreview}`
                    : 'No API key configured. Using system default if available.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button
                  onClick={handleSaveApiKey}
                  className="btn btn-primary"
                  disabled={savingApiSettings || !newApiKey.trim()}
                >
                  {savingApiSettings ? 'Saving...' : 'Save Key'}
                </button>
                {apiSettings.hasApiKey && (
                  <button
                    onClick={handleClearApiKey}
                    className="btn btn-secondary"
                    disabled={savingApiSettings}
                  >
                    Remove Key
                  </button>
                )}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Get your API key from{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
                  console.anthropic.com
                </a>
              </p>
            </div>

            {apiMessage && (
              <div className={`${apiMessage.includes('saved') || apiMessage.includes('updated') || apiMessage.includes('removed') ? 'success-message' : 'error-message'}`}>
                {apiMessage}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="section-heading">Change Password</h2>
            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter current password"
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                />
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                />
              </div>

              {message && <div className="success-message">{message}</div>}
              {error && <div className="error-message">{error}</div>}

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Change Password'}
              </button>
            </form>
          </div>

          <div className="card">
            <h2 className="section-heading">Account</h2>
            <div className="account-info">
              <div className="info-row">
                <span className="info-label">Name:</span>
                <span className="info-value">{user?.firstName} {user?.lastName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email:</span>
                <span className="info-value">{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
