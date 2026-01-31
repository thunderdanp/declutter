import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { analyzeItemWithDetails, recommendationLabels, factorLabels, optionLabels } from '../utils/recommendationEngine';
import './Admin.css';

function AdminRecommendations({ setIsAuthenticated }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null); // 'strategies', 'weights', 'thresholds', or null
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('strategies');
  const [testFormData, setTestFormData] = useState({
    name: 'Test Item',
    used: 'yes',
    sentimental: 'some',
    condition: 'good',
    value: 'medium',
    replace: 'moderate',
    space: 'yes'
  });
  const [testResult, setTestResult] = useState(null);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recommendations', {
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

  const saveStrategies = async () => {
    setSaving(true);
    setMessage('');
    setSaveSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recommendations/strategies', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ strategies: settings.recommendation_strategies })
      });

      if (response.ok) {
        setSaveSuccess('strategies');
        setMessage('Strategy settings saved successfully!');
        setTimeout(() => {
          setMessage('');
          setSaveSuccess(null);
        }, 4000);
      } else {
        setMessage('Failed to save strategies');
      }
    } catch (error) {
      console.error('Error saving strategies:', error);
      setMessage('Failed to save strategies');
    } finally {
      setSaving(false);
    }
  };

  const saveWeights = async () => {
    setSaving(true);
    setMessage('');
    setSaveSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recommendations/weights', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ weights: settings.recommendation_weights })
      });

      if (response.ok) {
        setSaveSuccess('weights');
        setMessage('Scoring weights saved successfully!');
        setTimeout(() => {
          setMessage('');
          setSaveSuccess(null);
        }, 4000);
      } else {
        setMessage('Failed to save weights');
      }
    } catch (error) {
      console.error('Error saving weights:', error);
      setMessage('Failed to save weights');
    } finally {
      setSaving(false);
    }
  };

  const saveThresholds = async () => {
    setSaving(true);
    setMessage('');
    setSaveSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recommendations/thresholds', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ thresholds: settings.recommendation_thresholds })
      });

      if (response.ok) {
        setSaveSuccess('thresholds');
        setMessage('Thresholds saved successfully!');
        setTimeout(() => {
          setMessage('');
          setSaveSuccess(null);
        }, 4000);
      } else {
        setMessage('Failed to save thresholds');
      }
    } catch (error) {
      console.error('Error saving thresholds:', error);
      setMessage('Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async (settingType = null) => {
    if (!window.confirm(`Reset ${settingType || 'all settings'} to defaults?`)) return;

    setSaving(true);
    setMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/recommendations/reset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settingType })
      });

      if (response.ok) {
        setMessage('Settings reset to defaults');
        fetchSettings();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to reset settings');
      }
    } catch (error) {
      console.error('Error resetting settings:', error);
      setMessage('Failed to reset settings');
    } finally {
      setSaving(false);
    }
  };

  const updateActiveStrategy = (strategyKey) => {
    setSettings(prev => ({
      ...prev,
      recommendation_strategies: {
        ...prev.recommendation_strategies,
        active: strategyKey
      }
    }));
  };

  const updateABTest = (field, value) => {
    setSettings(prev => ({
      ...prev,
      recommendation_strategies: {
        ...prev.recommendation_strategies,
        [field]: value
      }
    }));
  };

  const updateStrategyMultiplier = (strategyKey, factor, value) => {
    setSettings(prev => ({
      ...prev,
      recommendation_strategies: {
        ...prev.recommendation_strategies,
        strategies: {
          ...prev.recommendation_strategies.strategies,
          [strategyKey]: {
            ...prev.recommendation_strategies.strategies[strategyKey],
            multipliers: {
              ...prev.recommendation_strategies.strategies[strategyKey].multipliers,
              [factor]: parseFloat(value) || 1
            }
          }
        }
      }
    }));
  };

  const updateWeight = (factor, option, recommendation, value) => {
    setSettings(prev => {
      const newWeights = { ...prev.recommendation_weights };
      if (!newWeights[factor]) newWeights[factor] = {};
      if (!newWeights[factor][option]) newWeights[factor][option] = {};
      newWeights[factor][option][recommendation] = parseInt(value) || 0;
      return { ...prev, recommendation_weights: newWeights };
    });
  };

  const runTest = () => {
    const strategies = settings?.recommendation_strategies;
    const activeStrategy = strategies?.active || 'balanced';
    const strategyConfig = strategies?.strategies?.[activeStrategy];

    const result = analyzeItemWithDetails(testFormData, null, {
      weights: settings?.recommendation_weights,
      thresholds: settings?.recommendation_thresholds,
      strategyConfig
    });

    setTestResult(result);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <div className="admin-main">
          <div className="loading-screen">
            <div className="loader"></div>
          </div>
        </div>
      </div>
    );
  }

  const strategies = settings?.recommendation_strategies?.strategies || {};
  const activeStrategy = settings?.recommendation_strategies?.active || 'balanced';

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
          <Link to="/admin/recommendations" className="nav-link active">Recommendations</Link>
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
          <h1 className="page-title">Recommendation Engine</h1>
          <p className="page-subtitle">Configure how items are analyzed and recommendations generated</p>
        </div>

        {message && (
          <div className={`message ${message.includes('success') || message.includes('defaults') ? 'message-success' : 'message-error'}`} style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px', background: message.includes('success') || message.includes('defaults') ? '#d4edda' : '#f8d7da' }}>
            {message}
          </div>
        )}

        <div className="settings-container">
          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #e9ecef', paddingBottom: '1rem' }}>
            <button
              onClick={() => setActiveTab('strategies')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: activeTab === 'strategies' ? 'var(--terracotta)' : 'transparent',
                color: activeTab === 'strategies' ? 'white' : 'var(--charcoal)',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Strategies & A/B Testing
            </button>
            <button
              onClick={() => setActiveTab('weights')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: activeTab === 'weights' ? 'var(--terracotta)' : 'transparent',
                color: activeTab === 'weights' ? 'white' : 'var(--charcoal)',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Scoring Weights
            </button>
            <button
              onClick={() => setActiveTab('thresholds')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: activeTab === 'thresholds' ? 'var(--terracotta)' : 'transparent',
                color: activeTab === 'thresholds' ? 'white' : 'var(--charcoal)',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Thresholds
            </button>
            <button
              onClick={() => setActiveTab('test')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: activeTab === 'test' ? 'var(--terracotta)' : 'transparent',
                color: activeTab === 'test' ? 'white' : 'var(--charcoal)',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Test Engine
            </button>
          </div>

          {/* Strategies & A/B Testing Tab */}
          {activeTab === 'strategies' && (
            <div className="settings-section">
              <h2 className="settings-section-title">Active Strategy</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Select the recommendation strategy to use for all users, or enable A/B testing to compare strategies.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {Object.entries(strategies).map(([key, strategy]) => (
                  <div
                    key={key}
                    onClick={() => updateActiveStrategy(key)}
                    style={{
                      padding: '1.5rem',
                      border: `2px solid ${activeStrategy === key ? 'var(--terracotta)' : '#e9ecef'}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      background: activeStrategy === key ? 'rgba(212, 115, 92, 0.1)' : 'white',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="radio"
                        checked={activeStrategy === key}
                        onChange={() => updateActiveStrategy(key)}
                        style={{ accentColor: 'var(--terracotta)' }}
                      />
                      <strong style={{ color: activeStrategy === key ? 'var(--terracotta)' : 'var(--charcoal)' }}>
                        {strategy.name}
                      </strong>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#7f8c8d', margin: 0 }}>{strategy.description}</p>
                  </div>
                ))}
              </div>

              <h3 style={{ marginBottom: '1rem', marginTop: '2rem' }}>A/B Testing</h3>
              <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings?.recommendation_strategies?.abTestEnabled || false}
                      onChange={(e) => updateABTest('abTestEnabled', e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--terracotta)' }}
                    />
                    <span style={{ fontWeight: '600' }}>Enable A/B Testing</span>
                  </label>
                </div>

                {settings?.recommendation_strategies?.abTestEnabled && (
                  <>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label>Alternate Strategy</label>
                      <select
                        className="form-control"
                        value={settings?.recommendation_strategies?.abTestAlternate || ''}
                        onChange={(e) => updateABTest('abTestAlternate', e.target.value)}
                      >
                        <option value="">Select alternate strategy...</option>
                        {Object.entries(strategies).filter(([k]) => k !== activeStrategy).map(([key, strategy]) => (
                          <option key={key} value={key}>{strategy.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Group A Percentage (Primary Strategy): {settings?.recommendation_strategies?.abTestPercentage || 50}%</label>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={settings?.recommendation_strategies?.abTestPercentage || 50}
                        onChange={(e) => updateABTest('abTestPercentage', parseInt(e.target.value))}
                        style={{ width: '100%' }}
                      />
                      <p className="form-help">
                        {settings?.recommendation_strategies?.abTestPercentage || 50}% of users will use <strong>{strategies[activeStrategy]?.name || 'Primary'}</strong>,{' '}
                        {100 - (settings?.recommendation_strategies?.abTestPercentage || 50)}% will use <strong>{strategies[settings?.recommendation_strategies?.abTestAlternate]?.name || 'Alternate'}</strong>
                      </p>
                    </div>
                  </>
                )}
              </div>

              <h3 style={{ marginBottom: '1rem', marginTop: '2rem' }}>Strategy Multipliers</h3>
              <p className="form-help" style={{ marginBottom: '1rem' }}>
                Adjust how much each factor contributes to recommendations for each strategy. Values greater than 1 increase importance, less than 1 decrease importance.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      {Object.keys(factorLabels).map(factor => (
                        <th key={factor}>{factorLabels[factor]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(strategies).map(([key, strategy]) => (
                      <tr key={key}>
                        <td><strong>{strategy.name}</strong></td>
                        {Object.keys(factorLabels).map(factor => (
                          <td key={factor}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="3"
                              value={strategy.multipliers?.[factor] || 1}
                              onChange={(e) => updateStrategyMultiplier(key, factor, e.target.value)}
                              style={{ width: '60px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #e9ecef' }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="settings-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={saveStrategies}
                  disabled={saving}
                  style={{
                    background: saveSuccess === 'strategies' ? '#28a745' : undefined,
                    borderColor: saveSuccess === 'strategies' ? '#28a745' : undefined,
                    transition: 'all 0.3s ease'
                  }}
                >
                  {saving ? 'Saving...' : saveSuccess === 'strategies' ? '✓ Saved!' : 'Save Strategy Settings'}
                </button>
                <button className="btn btn-secondary" onClick={() => resetToDefaults('recommendation_strategies')} disabled={saving}>
                  Reset to Defaults
                </button>
                {saveSuccess === 'strategies' && (
                  <span style={{
                    color: '#28a745',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    animation: 'fadeIn 0.3s ease'
                  }}>
                    ✓ Settings saved successfully
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Scoring Weights Tab */}
          {activeTab === 'weights' && (
            <div className="settings-section">
              <h2 className="settings-section-title">Scoring Weights</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Configure how much each answer contributes to each recommendation type. Higher values make that recommendation more likely.
              </p>

              {Object.entries(settings?.recommendation_weights || {}).map(([factor, options]) => (
                <div key={factor} style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h3 style={{ marginBottom: '1rem', color: 'var(--terracotta)' }}>{factorLabels[factor] || factor}</h3>

                  {Object.entries(options).map(([option, scores]) => (
                    <div key={option} style={{ marginBottom: '1rem' }}>
                      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                        {optionLabels[factor]?.[option] || option}
                      </strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {Object.keys(recommendationLabels).map(rec => (
                          <div key={rec} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.85rem', color: '#7f8c8d' }}>{recommendationLabels[rec]}:</label>
                            <input
                              type="number"
                              min="-5"
                              max="10"
                              value={scores[rec] || 0}
                              onChange={(e) => updateWeight(factor, option, rec, e.target.value)}
                              style={{ width: '50px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #e9ecef' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="settings-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={saveWeights}
                  disabled={saving}
                  style={{
                    background: saveSuccess === 'weights' ? '#28a745' : undefined,
                    borderColor: saveSuccess === 'weights' ? '#28a745' : undefined,
                    transition: 'all 0.3s ease'
                  }}
                >
                  {saving ? 'Saving...' : saveSuccess === 'weights' ? '✓ Saved!' : 'Save Weights'}
                </button>
                <button className="btn btn-secondary" onClick={() => resetToDefaults('recommendation_weights')} disabled={saving}>
                  Reset to Defaults
                </button>
                {saveSuccess === 'weights' && (
                  <span style={{
                    color: '#28a745',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    animation: 'fadeIn 0.3s ease'
                  }}>
                    ✓ Weights saved successfully
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Thresholds Tab */}
          {activeTab === 'thresholds' && (
            <div className="settings-section">
              <h2 className="settings-section-title">Recommendation Thresholds</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Configure thresholds and tie-breaking behavior for recommendations.
              </p>

              <div className="form-group">
                <label>Tie-Break Priority Order</label>
                <p className="form-help">When scores are tied, recommendations are selected in this order (drag to reorder).</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {(settings?.recommendation_thresholds?.tieBreakOrder || []).map((rec, index) => (
                    <div
                      key={rec}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--terracotta)',
                        color: 'white',
                        borderRadius: '20px',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span style={{ opacity: 0.7 }}>{index + 1}.</span>
                      {recommendationLabels[rec]}
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={saveThresholds}
                  disabled={saving}
                  style={{
                    background: saveSuccess === 'thresholds' ? '#28a745' : undefined,
                    borderColor: saveSuccess === 'thresholds' ? '#28a745' : undefined,
                    transition: 'all 0.3s ease'
                  }}
                >
                  {saving ? 'Saving...' : saveSuccess === 'thresholds' ? '✓ Saved!' : 'Save Thresholds'}
                </button>
                <button className="btn btn-secondary" onClick={() => resetToDefaults('recommendation_thresholds')} disabled={saving}>
                  Reset to Defaults
                </button>
                {saveSuccess === 'thresholds' && (
                  <span style={{
                    color: '#28a745',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    animation: 'fadeIn 0.3s ease'
                  }}>
                    ✓ Thresholds saved successfully
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Test Engine Tab */}
          {activeTab === 'test' && (
            <div className="settings-section">
              <h2 className="settings-section-title">Test Recommendation Engine</h2>
              <p className="form-help" style={{ marginBottom: '1.5rem' }}>
                Test how the engine responds to different inputs with the current settings.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {Object.entries(optionLabels).map(([factor, options]) => (
                  <div className="form-group" key={factor}>
                    <label>{factorLabels[factor]}</label>
                    <select
                      className="form-control"
                      value={testFormData[factor === 'usage' ? 'used' : factor === 'replaceability' ? 'replace' : factor]}
                      onChange={(e) => setTestFormData(prev => ({
                        ...prev,
                        [factor === 'usage' ? 'used' : factor === 'replaceability' ? 'replace' : factor]: e.target.value
                      }))}
                    >
                      {Object.entries(options).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <button className="btn btn-primary" onClick={runTest} style={{ marginBottom: '2rem' }}>
                Run Test
              </button>

              {testResult && (
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px' }}>
                  <h3 style={{ marginBottom: '1rem' }}>Test Results</h3>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <strong>Recommendation:</strong>{' '}
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      background: 'var(--terracotta)',
                      color: 'white',
                      borderRadius: '12px',
                      fontWeight: '600'
                    }}>
                      {recommendationLabels[testResult.recommendation]}
                    </span>
                    <span style={{ marginLeft: '1rem', color: '#7f8c8d' }}>
                      (using {testResult.strategyUsed} strategy)
                    </span>
                  </div>

                  {testResult.tiedRecommendations && (
                    <div style={{ marginBottom: '1rem', color: '#f39c12' }}>
                      Tie detected! Tied recommendations: {testResult.tiedRecommendations.map(r => recommendationLabels[r]).join(', ')}
                    </div>
                  )}

                  <div style={{ marginBottom: '1.5rem' }}>
                    <strong>Final Scores:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {Object.entries(testResult.scores)
                        .sort(([, a], [, b]) => b - a)
                        .map(([rec, score]) => (
                          <div
                            key={rec}
                            style={{
                              padding: '0.5rem 1rem',
                              background: rec === testResult.recommendation ? 'var(--terracotta)' : '#e9ecef',
                              color: rec === testResult.recommendation ? 'white' : 'var(--charcoal)',
                              borderRadius: '8px',
                              fontSize: '0.9rem'
                            }}
                          >
                            {recommendationLabels[rec]}: <strong>{score}</strong>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div>
                    <strong>Score Breakdown by Factor:</strong>
                    <div style={{ marginTop: '0.5rem' }}>
                      {Object.entries(testResult.breakdown)
                        .filter(([key]) => key !== 'profile')
                        .map(([factor, scores]) => (
                          <div key={factor} style={{ marginBottom: '0.5rem' }}>
                            <span style={{ color: '#7f8c8d' }}>{factorLabels[factor]}:</span>{' '}
                            {Object.entries(scores).map(([rec, score]) => (
                              <span key={rec} style={{ marginRight: '0.5rem' }}>
                                {recommendationLabels[rec]} +{score}
                              </span>
                            ))}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export default AdminRecommendations;
