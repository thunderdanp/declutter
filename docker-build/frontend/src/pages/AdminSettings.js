import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';

function AdminSettings({ setIsAuthenticated }) {
  const [settings, setSettings] = useState({
    registration_mode: 'automatic'
  });
  const [recaptchaSettings, setRecaptchaSettings] = useState({
    siteKey: '',
    hasSecretKey: false,
    secretKeyPreview: null,
    hasEnvSiteKey: false,
    hasEnvSecretKey: false,
    enabled: false,
  });
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState('');
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState('');
  const [savingRecaptcha, setSavingRecaptcha] = useState(false);
  const [recaptchaMessage, setRecaptchaMessage] = useState('');
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
    activeSource: 'none',
    systemProvider: 'anthropic',
    anthropic: { hasDbKey: false, dbKeyPreview: null, hasEnvKey: false },
    openai: { hasDbKey: false, dbKeyPreview: null, hasEnvKey: false },
    google: { hasDbKey: false, dbKeyPreview: null, hasEnvKey: false },
    ollama: { baseUrl: 'http://localhost:11434' },
  });
  const [providerKeys, setProviderKeys] = useState({ anthropic: '', openai: '', google: '' });
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
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
    fetchRecaptchaSettings();
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

  const fetchRecaptchaSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recaptcha', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setRecaptchaSettings(data);
        setRecaptchaSiteKey(data.siteKey || '');
      }
    } catch (error) {
      console.error('Error fetching reCAPTCHA settings:', error);
    }
  };

  const handleSaveRecaptcha = async () => {
    setSavingRecaptcha(true);
    setRecaptchaMessage('');

    try {
      const token = localStorage.getItem('token');
      const body = { site_key: recaptchaSiteKey };
      if (recaptchaSecretKey) {
        body.secret_key = recaptchaSecretKey;
      }

      const response = await fetch('/api/admin/recaptcha', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        setRecaptchaMessage('reCAPTCHA settings saved!');
        setRecaptchaSecretKey('');
        fetchRecaptchaSettings();
        setTimeout(() => setRecaptchaMessage(''), 3000);
      } else {
        setRecaptchaMessage('Failed to save reCAPTCHA settings');
      }
    } catch (error) {
      console.error('Error saving reCAPTCHA settings:', error);
      setRecaptchaMessage('Failed to save reCAPTCHA settings');
    } finally {
      setSavingRecaptcha(false);
    }
  };

  const handleClearRecaptchaSecret = async () => {
    if (!window.confirm('Remove the reCAPTCHA secret key from database? This will disable reCAPTCHA unless an environment variable is set.')) return;

    setSavingRecaptcha(true);
    setRecaptchaMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recaptcha', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clear_secret: true })
      });

      if (response.ok) {
        setRecaptchaMessage('reCAPTCHA secret key removed');
        fetchRecaptchaSettings();
        setTimeout(() => setRecaptchaMessage(''), 3000);
      } else {
        setRecaptchaMessage('Failed to remove reCAPTCHA secret key');
      }
    } catch (error) {
      console.error('Error removing reCAPTCHA secret key:', error);
      setRecaptchaMessage('Failed to remove reCAPTCHA secret key');
    } finally {
      setSavingRecaptcha(false);
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
        setOllamaUrl(data.ollama?.baseUrl || 'http://localhost:11434');
      }
    } catch (error) {
      console.error('Error fetching API key status:', error);
    }
  };

  const handleSaveProviderKey = async (provider) => {
    const key = providerKeys[provider];
    if (!key || !key.trim()) {
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
        body: JSON.stringify({ api_key: key, provider })
      });

      if (response.ok) {
        setApiKeyMessage(`${provider} API key saved!`);
        setProviderKeys(prev => ({ ...prev, [provider]: '' }));
        fetchApiKeyStatus();
        setTimeout(() => setApiKeyMessage(''), 3000);
      } else {
        setApiKeyMessage(`Failed to save ${provider} API key`);
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      setApiKeyMessage(`Failed to save ${provider} API key`);
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleClearProviderKey = async (provider) => {
    if (!window.confirm(`Remove the ${provider} API key from database?`)) return;

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
        body: JSON.stringify({ clear_key: true, provider })
      });

      if (response.ok) {
        setApiKeyMessage(`${provider} API key removed`);
        fetchApiKeyStatus();
        setTimeout(() => setApiKeyMessage(''), 3000);
      } else {
        setApiKeyMessage(`Failed to remove ${provider} API key`);
      }
    } catch (error) {
      console.error('Error removing API key:', error);
      setApiKeyMessage(`Failed to remove ${provider} API key`);
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleSystemProviderChange = async (newProvider) => {
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
        body: JSON.stringify({ system_provider: newProvider })
      });

      if (response.ok) {
        setApiKeyMessage('System default provider updated!');
        fetchApiKeyStatus();
        setTimeout(() => setApiKeyMessage(''), 3000);
      } else {
        setApiKeyMessage('Failed to update system provider');
      }
    } catch (error) {
      console.error('Error updating system provider:', error);
      setApiKeyMessage('Failed to update system provider');
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleSaveOllamaUrl = async () => {
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
        body: JSON.stringify({ ollama_base_url: ollamaUrl })
      });

      if (response.ok) {
        setApiKeyMessage('Ollama base URL saved!');
        fetchApiKeyStatus();
        setTimeout(() => setApiKeyMessage(''), 3000);
      } else {
        setApiKeyMessage('Failed to save Ollama URL');
      }
    } catch (error) {
      console.error('Error saving Ollama URL:', error);
      setApiKeyMessage('Failed to save Ollama URL');
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
              <h2 className="settings-section-title">
                reCAPTCHA Configuration
                {recaptchaSettings.enabled ? (
                  <span className="status-badge status-approved" style={{ marginLeft: '0.75rem', fontSize: '0.75rem' }}>Enabled</span>
                ) : (
                  <span className="status-badge status-pending" style={{ marginLeft: '0.75rem', fontSize: '0.75rem' }}>Disabled</span>
                )}
              </h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Configure Google reCAPTCHA to protect the registration form from bots. Both a site key and secret key are required to enable reCAPTCHA.
              </p>

              <div className="form-group">
                <label htmlFor="recaptcha_site_key">Site Key</label>
                <input
                  type="text"
                  id="recaptcha_site_key"
                  className="form-control"
                  placeholder="Enter reCAPTCHA site key"
                  value={recaptchaSiteKey}
                  onChange={(e) => setRecaptchaSiteKey(e.target.value)}
                />
                <p className="form-help">The public site key displayed on the registration form.</p>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="recaptcha_secret_key">Secret Key</label>
                  {recaptchaSettings.hasSecretKey ? (
                    <span className="status-badge status-approved">Configured ({recaptchaSettings.secretKeyPreview})</span>
                  ) : recaptchaSettings.hasEnvSecretKey ? (
                    <span className="status-badge status-info">Using Env Variable</span>
                  ) : (
                    <span className="status-badge status-pending">Not Set</span>
                  )}
                </div>
                <input
                  type="password"
                  id="recaptcha_secret_key"
                  className="form-control"
                  placeholder={recaptchaSettings.hasSecretKey ? 'Enter new secret key to replace' : 'Enter reCAPTCHA secret key'}
                  value={recaptchaSecretKey}
                  onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                />
                <p className="form-help">The secret key used for server-side verification. Never exposed publicly.</p>
              </div>

              <div className="settings-actions">
                {recaptchaMessage && (
                  <div className={`message ${recaptchaMessage.includes('saved') || recaptchaMessage.includes('removed') ? 'message-success' : 'message-error'}`}>
                    {recaptchaMessage}
                  </div>
                )}
                <div className="button-group">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveRecaptcha}
                    disabled={savingRecaptcha}
                  >
                    {savingRecaptcha ? 'Saving...' : 'Save reCAPTCHA Settings'}
                  </button>
                  {recaptchaSettings.hasSecretKey && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleClearRecaptchaSecret}
                      disabled={savingRecaptcha}
                    >
                      Clear Secret Key
                    </button>
                  )}
                </div>
                <p className="form-help" style={{ marginTop: '0.75rem' }}>
                  Get your keys from the{' '}
                  <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer">
                    Google reCAPTCHA Admin Console
                  </a>
                </p>
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
              <h2 className="settings-section-title">AI Provider Configuration</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Configure AI providers for image analysis. Users can choose a provider, or fall back to the system default.
              </p>

              <div className="form-group">
                <label htmlFor="system_provider">System Default Provider</label>
                <select
                  id="system_provider"
                  className="form-control"
                  value={apiKeyStatus.systemProvider || 'anthropic'}
                  onChange={(e) => handleSystemProviderChange(e.target.value)}
                  disabled={savingApiKey}
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT-4o</option>
                  <option value="google">Google Gemini</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
                <p className="form-help">The default provider when users haven't chosen one.</p>
              </div>

              {/* Anthropic */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>Anthropic Claude</strong>
                  {apiKeyStatus.anthropic?.hasDbKey ? (
                    <span className="status-badge status-approved">Configured ({apiKeyStatus.anthropic.dbKeyPreview})</span>
                  ) : apiKeyStatus.anthropic?.hasEnvKey ? (
                    <span className="status-badge status-info">Using Env Variable</span>
                  ) : (
                    <span className="status-badge status-pending">Not Configured</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="sk-ant-..."
                    value={providerKeys.anthropic}
                    onChange={(e) => setProviderKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={() => handleSaveProviderKey('anthropic')} disabled={savingApiKey || !providerKeys.anthropic.trim()}>
                    Save
                  </button>
                  {apiKeyStatus.anthropic?.hasDbKey && (
                    <button className="btn btn-secondary" onClick={() => handleClearProviderKey('anthropic')} disabled={savingApiKey}>
                      Clear
                    </button>
                  )}
                </div>
                <p className="form-help">
                  Get your key from{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
                </p>
              </div>

              {/* OpenAI */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>OpenAI GPT-4o</strong>
                  {apiKeyStatus.openai?.hasDbKey ? (
                    <span className="status-badge status-approved">Configured ({apiKeyStatus.openai.dbKeyPreview})</span>
                  ) : apiKeyStatus.openai?.hasEnvKey ? (
                    <span className="status-badge status-info">Using Env Variable</span>
                  ) : (
                    <span className="status-badge status-pending">Not Configured</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="sk-..."
                    value={providerKeys.openai}
                    onChange={(e) => setProviderKeys(prev => ({ ...prev, openai: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={() => handleSaveProviderKey('openai')} disabled={savingApiKey || !providerKeys.openai.trim()}>
                    Save
                  </button>
                  {apiKeyStatus.openai?.hasDbKey && (
                    <button className="btn btn-secondary" onClick={() => handleClearProviderKey('openai')} disabled={savingApiKey}>
                      Clear
                    </button>
                  )}
                </div>
                <p className="form-help">
                  Get your key from{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a>
                </p>
              </div>

              {/* Google Gemini */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>Google Gemini</strong>
                  {apiKeyStatus.google?.hasDbKey ? (
                    <span className="status-badge status-approved">Configured ({apiKeyStatus.google.dbKeyPreview})</span>
                  ) : apiKeyStatus.google?.hasEnvKey ? (
                    <span className="status-badge status-info">Using Env Variable</span>
                  ) : (
                    <span className="status-badge status-pending">Not Configured</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="AIza..."
                    value={providerKeys.google}
                    onChange={(e) => setProviderKeys(prev => ({ ...prev, google: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={() => handleSaveProviderKey('google')} disabled={savingApiKey || !providerKeys.google.trim()}>
                    Save
                  </button>
                  {apiKeyStatus.google?.hasDbKey && (
                    <button className="btn btn-secondary" onClick={() => handleClearProviderKey('google')} disabled={savingApiKey}>
                      Clear
                    </button>
                  )}
                </div>
                <p className="form-help">
                  Get your key from{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com</a>
                </p>
              </div>

              {/* Ollama */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Ollama (Local)</strong>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={handleSaveOllamaUrl} disabled={savingApiKey}>
                    Save
                  </button>
                </div>
                <p className="form-help">Base URL for your local Ollama instance. Requires llama3.2-vision model.</p>
              </div>

              {apiKeyMessage && (
                <div className={`message ${apiKeyMessage.includes('saved') || apiKeyMessage.includes('removed') || apiKeyMessage.includes('updated') ? 'message-success' : 'message-error'}`}>
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
