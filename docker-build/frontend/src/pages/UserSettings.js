import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';

function UserSettings({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomMessage, setRoomMessage] = useState('');
  const [roomError, setRoomError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/rooms', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRooms(data.rooms);
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setRoomLoading(true);
    setRoomError('');
    setRoomMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newRoomName.trim() })
      });

      const data = await response.json();

      if (response.ok) {
        setRooms([...rooms, data.room].sort((a, b) => a.name.localeCompare(b.name)));
        setNewRoomName('');
        setRoomMessage('Room added successfully');
        setTimeout(() => setRoomMessage(''), 3000);
      } else {
        setRoomError(data.error || 'Failed to add room');
      }
    } catch (err) {
      setRoomError('Network error. Please try again.');
    } finally {
      setRoomLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId, roomName) => {
    if (!window.confirm(`Delete "${roomName}"? Items in this room will keep their current location.`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setRooms(rooms.filter(r => r.id !== roomId));
        setRoomMessage('Room deleted');
        setTimeout(() => setRoomMessage(''), 3000);
      } else {
        const data = await response.json();
        setRoomError(data.error || 'Failed to delete room');
      }
    } catch (err) {
      setRoomError('Network error. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
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

        <div className="settings-section">
          <h2 className="section-title">Manage Rooms</h2>
          <p className="section-description">Add custom rooms/locations for organizing your items.</p>

          {roomMessage && <div className="message message-success">{roomMessage}</div>}
          {roomError && <div className="message message-error">{roomError}</div>}

          <form onSubmit={handleAddRoom} className="room-form">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Enter room name..."
              maxLength="100"
            />
            <button type="submit" className="btn btn-primary" disabled={roomLoading || !newRoomName.trim()}>
              {roomLoading ? 'Adding...' : 'Add Room'}
            </button>
          </form>

          <div className="rooms-list">
            {rooms.length === 0 ? (
              <p className="no-rooms">No custom rooms yet. Add some above!</p>
            ) : (
              rooms.map(room => (
                <div key={room.id} className="room-item">
                  <span className="room-name">{room.name}</span>
                  <button
                    onClick={() => handleDeleteRoom(room.id, room.name)}
                    className="btn-delete-room"
                    title="Delete room"
                  >
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserSettings;
