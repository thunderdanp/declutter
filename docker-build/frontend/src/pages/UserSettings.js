import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';

function UserSettings() {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);

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

      const data = await response.json();

      if (response.ok) {
        setMessage('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>Declutter Assistant</h2>
        </div>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/profile" className="nav-link">Profile</Link>
          <Link to="/evaluate" className="nav-link">Evaluate Item</Link>
          <Link to="/history" className="nav-link">History</Link>
          <Link to="/settings" className="nav-link active">Settings</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Account Settings</h1>
          <p className="page-subtitle">Manage your account preferences</p>
        </div>

        <div className="settings-section">
          <h2 className="section-title">Account Information</h2>
          <div className="info-card">
            <p><strong>Name:</strong> {user?.firstName} {user?.lastName}</p>
            <p><strong>Email:</strong> {user?.email}</p>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">Change Password</h2>

          <form onSubmit={handleChangePassword} className="settings-form">
            {message && <div className="message message-success">{message}</div>}
            {error && <div className="message message-error">{error}</div>}

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
                minLength="6"
                placeholder="At least 6 characters"
              />
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength="6"
                placeholder="Re-enter new password"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>

          <div className="forgot-password-link">
            <p>Forgot your current password? <Link to="/forgot-password">Reset it via email</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserSettings;
