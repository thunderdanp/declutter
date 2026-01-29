import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './PersonalityProfile.css';

function PersonalityProfile({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [profile, setProfile] = useState({
    declutterGoal: '',
    sentimentalValue: '',
    minimalistLevel: '',
    budgetPriority: '',
    timeCommitment: '',
    livingSpace: '',
    futureGoals: '',
    keepingStyle: '',
    likes: '',
    dislikes: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          setProfile(data.profile);
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ profileData: profile })
      });

      if (response.ok) {
        setMessage('Profile saved successfully!');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        setMessage('Error saving profile');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant</h2>
        </Link>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/profile" className="nav-link active">Profile</Link>
          <Link to="/evaluate" className="nav-link">Evaluate Item</Link>
          <Link to="/my-items" className="nav-link">My Items</Link>
          <Link to="/household" className="nav-link">Household</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Your Personality Profile</h1>
          <p className="page-subtitle">Help us understand your decluttering style and goals</p>
        </div>

        <form onSubmit={handleSubmit} className="profile-form">
          <div className="card">
            <h2 className="section-heading">Goals & Motivation</h2>
            
            <div className="form-group">
              <label>What is your main decluttering goal?</label>
              <select name="declutterGoal" value={profile.declutterGoal} onChange={handleChange} required>
                <option value="">Select your goal...</option>
                <option value="minimalism">Embrace minimalism</option>
                <option value="organize">Better organization</option>
                <option value="space">Create more space</option>
                <option value="move">Preparing to move</option>
                <option value="simplify">Simplify life</option>
                <option value="sell">Make money from unused items</option>
              </select>
            </div>

            <div className="form-group">
              <label>How would you describe your relationship with sentimental items?</label>
              <select name="sentimentalValue" value={profile.sentimentalValue} onChange={handleChange} required>
                <option value="">Select...</option>
                <option value="very-sentimental">I keep almost everything with memories</option>
                <option value="moderately-sentimental">I keep some meaningful items</option>
                <option value="selectively-sentimental">I'm selective about what I keep</option>
                <option value="not-sentimental">I don't attach much sentiment to objects</option>
              </select>
            </div>

            <div className="form-group">
              <label>Where do you fall on the minimalist spectrum?</label>
              <select name="minimalistLevel" value={profile.minimalistLevel} onChange={handleChange} required>
                <option value="">Select...</option>
                <option value="extreme">Extreme minimalist - own very little</option>
                <option value="moderate">Moderate - keep what's useful and meaningful</option>
                <option value="casual">Casual - like having options and variety</option>
                <option value="maximalist">Maximalist - love collecting and displaying</option>
              </select>
            </div>
          </div>

          <div className="card">
            <h2 className="section-heading">Practical Considerations</h2>

            <div className="form-group">
              <label>How important is recouping money from your items?</label>
              <select name="budgetPriority" value={profile.budgetPriority} onChange={handleChange} required>
                <option value="">Select...</option>
                <option value="very-important">Very important - I want to sell what I can</option>
                <option value="somewhat-important">Somewhat important - if it's easy</option>
                <option value="not-important">Not important - I'd rather donate</option>
              </select>
            </div>

            <div className="form-group">
              <label>How much time can you dedicate to decluttering?</label>
              <select name="timeCommitment" value={profile.timeCommitment} onChange={handleChange} required>
                <option value="">Select...</option>
                <option value="intensive">Ready for an intensive purge</option>
                <option value="steady">Steady progress over time</option>
                <option value="gradual">Slow and gradual</option>
              </select>
            </div>

            <div className="form-group">
              <label>What's your current living situation?</label>
              <select name="livingSpace" value={profile.livingSpace} onChange={handleChange} required>
                <option value="">Select...</option>
                <option value="small-apartment">Small apartment/studio</option>
                <option value="apartment">Average apartment</option>
                <option value="small-house">Small house</option>
                <option value="large-house">Large house</option>
                <option value="storage">Have external storage available</option>
              </select>
            </div>

            <div className="form-group">
              <label>What are your future plans?</label>
              <select name="futureGoals" value={profile.futureGoals} onChange={handleChange}>
                <option value="">Select...</option>
                <option value="moving-soon">Moving within a year</option>
                <option value="downsizing">Planning to downsize</option>
                <option value="expanding">Expanding family/space</option>
                <option value="staying-put">Staying in current space</option>
              </select>
            </div>
          </div>

          <div className="card">
            <h2 className="section-heading">Personal Style</h2>

            <div className="form-group">
              <label>How do you prefer to keep items you use regularly?</label>
              <select name="keepingStyle" value={profile.keepingStyle} onChange={handleChange}>
                <option value="">Select...</option>
                <option value="visible">Out and visible</option>
                <option value="organized">Organized in designated spots</option>
                <option value="hidden">Hidden away but accessible</option>
                <option value="minimal">Keep only absolute essentials visible</option>
              </select>
            </div>

            <div className="form-group">
              <label>What types of items do you enjoy keeping? (Optional)</label>
              <textarea
                name="likes"
                value={profile.likes}
                onChange={handleChange}
                placeholder="e.g., books, art supplies, vintage clothing, tech gadgets..."
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>What types of items do you want to reduce? (Optional)</label>
              <textarea
                name="dislikes"
                value={profile.dislikes}
                onChange={handleChange}
                placeholder="e.g., clothes I never wear, kitchen gadgets, paperwork..."
                rows="3"
              />
            </div>
          </div>

          {message && (
            <div className={message.includes('success') ? 'success-message' : 'error-message'}>
              {message}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-large" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PersonalityProfile;
