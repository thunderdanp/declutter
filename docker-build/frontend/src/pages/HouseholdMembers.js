import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './HouseholdMembers.css';

function HouseholdMembers({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [formData, setFormData] = useState({ name: '', relationship: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const relationshipOptions = [
    { value: '', label: 'Select relationship...' },
    { value: 'spouse', label: 'Spouse/Partner' },
    { value: 'child', label: 'Child' },
    { value: 'parent', label: 'Parent' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'roommate', label: 'Roommate' },
    { value: 'other', label: 'Other' }
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/household-members', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMembers(data.members);
      }
    } catch (error) {
      console.error('Error fetching household members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const url = editingMember
        ? `/api/household-members/${editingMember.id}`
        : '/api/household-members';

      const response = await fetch(url, {
        method: editingMember ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchMembers();
        resetForm();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save member');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (member) => {
    setEditingMember(member);
    setFormData({ name: member.name, relationship: member.relationship || '' });
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Are you sure you want to remove ${member.name} from your household? They will be removed from all item associations.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/household-members/${member.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await fetchMembers();
      } else {
        alert('Failed to delete member');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', relationship: '' });
    setEditingMember(null);
    setShowForm(false);
    setError('');
  };

  const getRelationshipLabel = (value) => {
    const option = relationshipOptions.find(opt => opt.value === value);
    return option ? option.label : value;
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
          <Link to="/my_items" className="nav-link">My Items</Link>
          <Link to="/household" className="nav-link active">Household</Link>
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
          <h1 className="page-title">Household Members</h1>
          <p className="page-subtitle">Manage people in your household to associate items with them</p>
        </div>

        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary add-member-btn">
            + Add Household Member
          </button>
        )}

        {showForm && (
          <div className="card member-form-card">
            <h2 className="section-heading">
              {editingMember ? 'Edit Member' : 'Add New Member'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter name"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>Relationship</label>
                <select
                  value={formData.relationship}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                >
                  {relationshipOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : (editingMember ? 'Update Member' : 'Add Member')}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading household members...</div>
        ) : members.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👨‍👩‍👧‍👦</div>
            <h2>No Household Members Yet</h2>
            <p>Add people to your household to track who owns which items</p>
          </div>
        ) : (
          <div className="members-grid">
            {members.map(member => (
              <div key={member.id} className="member-card">
                <div className="member-info">
                  <div className="member-avatar">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="member-details">
                    <h3>{member.name}</h3>
                    {member.relationship && (
                      <span className="member-relationship">
                        {getRelationshipLabel(member.relationship)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="member-actions">
                  <button onClick={() => handleEdit(member)} className="btn-icon btn-edit-member">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(member)} className="btn-icon btn-delete-member">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default HouseholdMembers;
