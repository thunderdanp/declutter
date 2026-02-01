import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Admin.css';

function AdminAIConfig({ setIsAuthenticated }) {
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
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [defaultAnalysisPrompt, setDefaultAnalysisPrompt] = useState('');
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchApiKeyStatus();
    fetchAnalysisPrompt();
  }, []);

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
      } else if (response.status === 403) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching API key status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysisPrompt = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/analysis-prompt', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysisPrompt(data.prompt || '');
        setDefaultAnalysisPrompt(data.defaultPrompt || '');
        setIsCustomPrompt(data.isCustom || false);
      }
    } catch (error) {
      console.error('Error fetching analysis prompt:', error);
    }
  };

  const handleSavePrompt = async () => {
    if (!analysisPrompt.includes('{{categories}}')) {
      setPromptMessage('Error: Prompt must contain the {{categories}} placeholder');
      return;
    }

    setSavingPrompt(true);
    setPromptMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/analysis-prompt', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: analysisPrompt })
      });

      if (response.ok) {
        setPromptMessage('Analysis prompt saved successfully!');
        setIsCustomPrompt(true);
        setTimeout(() => setPromptMessage(''), 3000);
      } else {
        const data = await response.json();
        setPromptMessage(data.error || 'Failed to save analysis prompt');
      }
    } catch (error) {
      console.error('Error saving analysis prompt:', error);
      setPromptMessage('Failed to save analysis prompt');
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleResetPrompt = async () => {
    if (!window.confirm('Reset the analysis prompt to the default? Your custom prompt will be removed.')) return;

    setSavingPrompt(true);
    setPromptMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/analysis-prompt', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysisPrompt(data.defaultPrompt || defaultAnalysisPrompt);
        setIsCustomPrompt(false);
        setPromptMessage('Prompt reset to default');
        setTimeout(() => setPromptMessage(''), 3000);
      } else {
        setPromptMessage('Failed to reset analysis prompt');
      }
    } catch (error) {
      console.error('Error resetting analysis prompt:', error);
      setPromptMessage('Failed to reset analysis prompt');
    } finally {
      setSavingPrompt(false);
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
          <Link to="/admin/ai-config" className="nav-link active">AI Config</Link>
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
          <h1 className="page-title">AI Configuration</h1>
          <p className="page-subtitle">Configure AI providers and analysis prompt</p>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="settings-container">
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

            <div className="settings-section">
              <h2 className="settings-section-title">
                AI Analysis Prompt
                {isCustomPrompt ? (
                  <span className="status-badge status-approved" style={{ marginLeft: '0.75rem', fontSize: '0.75rem' }}>Custom</span>
                ) : (
                  <span className="status-badge status-info" style={{ marginLeft: '0.75rem', fontSize: '0.75rem' }}>Default</span>
                )}
              </h2>

              <div style={{ padding: '0.75rem 1rem', background: 'var(--warning-bg, #fff3cd)', border: '1px solid var(--warning-border, #ffc107)', borderRadius: '8px', marginBottom: '1.5rem', color: 'var(--warning-text, #856404)' }}>
                <strong>Warning:</strong> The AI response must be valid JSON containing <code>name</code>, <code>description</code>, <code>category</code>, and <code>location</code> fields. Modifying the prompt may break image analysis if the AI no longer returns the expected format.
              </div>

              <div className="form-group">
                <label htmlFor="analysis_prompt">Prompt Template</label>
                <textarea
                  id="analysis_prompt"
                  className="form-control"
                  rows={12}
                  value={analysisPrompt}
                  onChange={(e) => setAnalysisPrompt(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
                <p className="form-help">
                  Use <code>{'{{categories}}'}</code> as a placeholder — it will be replaced with the list of category slugs from your database at analysis time.
                </p>
              </div>

              <div className="settings-actions">
                {promptMessage && (
                  <div className={`message ${promptMessage.includes('success') || promptMessage.includes('reset to default') ? 'message-success' : 'message-error'}`}>
                    {promptMessage}
                  </div>
                )}
                <div className="button-group">
                  <button
                    className="btn btn-primary"
                    onClick={handleSavePrompt}
                    disabled={savingPrompt}
                  >
                    {savingPrompt ? 'Saving...' : 'Save Prompt'}
                  </button>
                  {isCustomPrompt && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleResetPrompt}
                      disabled={savingPrompt}
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default AdminAIConfig;
