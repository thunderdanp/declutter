import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { analyzeItem, generateReasoning, recommendationLabels } from '../utils/recommendationEngine';
import { useTheme } from '../context/ThemeContext';
import './ItemDetail.css';

function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  useEffect(() => {
    fetchItem();
    fetchProfile();
  }, [id]);

  const fetchItem = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/items/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setItem(data.item);
      } else {
        navigate('/history');
      }
    } catch (error) {
      console.error('Error fetching item:', error);
      navigate('/history');
    } finally {
      setLoading(false);
    }
  };

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
        setProfile(data.profile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this item?')) {
      return;
    }

    setDeleting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/items/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        navigate('/history');
      } else {
        alert('Error deleting item');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleEdit = () => {
    const answers = item.answers || {};
    setEditData({
      name: item.name || '',
      description: item.description || '',
      location: item.location || '',
      category: item.category || '',
      used: answers.used || '',
      sentimental: answers.sentimental || '',
      condition: answers.condition || '',
      value: answers.value || '',
      replace: answers.replace || '',
      space: answers.space || ''
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData(null);
  };

  const handleInputChange = (e) => {
    setEditData({
      ...editData,
      [e.target.name]: e.target.value
    });
  };

  const handleSave = async () => {
    if (!editData.name) {
      alert('Please enter an item name');
      return;
    }

    const unanswered = ['used', 'sentimental', 'condition', 'value', 'replace', 'space']
      .filter(key => !editData[key]);

    if (unanswered.length > 0) {
      alert('Please answer all evaluation questions');
      return;
    }

    setSaving(true);

    try {
      const recommendationType = analyzeItem(editData, profile);
      const reasoning = generateReasoning(recommendationType, editData, profile);

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/items/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editData.name,
          description: editData.description,
          location: editData.location,
          category: editData.category,
          recommendation: recommendationType,
          recommendationReasoning: reasoning,
          answers: JSON.stringify(editData)
        })
      });

      if (response.ok) {
        const data = await response.json();
        setItem(data.item);
        setIsEditing(false);
        setEditData(null);
      } else {
        alert('Error saving changes. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading item...</div>;
  }

  if (!item) {
    return null;
  }

  const answers = item.answers || {};

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
          <Link to="/history" className="nav-link">My Items</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="back-link">
          <Link to="/history">← Back to My Items</Link>
        </div>

        <div className="detail-header">
          <h1 className="page-title">{item.name}</h1>
          <div className="header-actions">
            {!isEditing && (
              <button onClick={handleEdit} className="btn-edit">
                Edit Item
              </button>
            )}
            <button onClick={handleDelete} className="btn-delete" disabled={deleting || isEditing}>
              {deleting ? 'Deleting...' : 'Delete Item'}
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="edit-form">
            <div className="card">
              <h3 className="card-title">Item Details</h3>
              <div className="form-group">
                <label>Item Name *</label>
                <input
                  type="text"
                  name="name"
                  value={editData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={editData.description}
                  onChange={handleInputChange}
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Location</label>
                  <select name="location" value={editData.location} onChange={handleInputChange}>
                    <option value="">Select location...</option>
                    <option value="bedroom">Bedroom</option>
                    <option value="living-room">Living Room</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="bathroom">Bathroom</option>
                    <option value="garage">Garage</option>
                    <option value="attic">Attic</option>
                    <option value="basement">Basement</option>
                    <option value="closet">Closet</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select name="category" value={editData.category} onChange={handleInputChange}>
                    <option value="">Select category...</option>
                    <option value="clothing">Clothing</option>
                    <option value="books">Books</option>
                    <option value="electronics">Electronics</option>
                    <option value="kitchen">Kitchen Items</option>
                    <option value="decor">Decor</option>
                    <option value="furniture">Furniture</option>
                    <option value="toys">Toys</option>
                    <option value="tools">Tools</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Evaluation Questions</h3>

              <div className="question-group">
                <label className="question-label">Have you used this item in the past year? *</label>
                <div className="radio-options">
                  <label className="radio-option">
                    <input type="radio" name="used" value="yes" checked={editData.used === 'yes'} onChange={handleInputChange} />
                    <span>Yes</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="used" value="no" checked={editData.used === 'no'} onChange={handleInputChange} />
                    <span>No</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="used" value="rarely" checked={editData.used === 'rarely'} onChange={handleInputChange} />
                    <span>Rarely</span>
                  </label>
                </div>
              </div>

              <div className="question-group">
                <label className="question-label">Does this item have sentimental value? *</label>
                <div className="radio-options">
                  <label className="radio-option">
                    <input type="radio" name="sentimental" value="high" checked={editData.sentimental === 'high'} onChange={handleInputChange} />
                    <span>Very Much</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="sentimental" value="some" checked={editData.sentimental === 'some'} onChange={handleInputChange} />
                    <span>Somewhat</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="sentimental" value="no" checked={editData.sentimental === 'no'} onChange={handleInputChange} />
                    <span>No</span>
                  </label>
                </div>
              </div>

              <div className="question-group">
                <label className="question-label">What is the item's condition? *</label>
                <div className="radio-options">
                  <label className="radio-option">
                    <input type="radio" name="condition" value="excellent" checked={editData.condition === 'excellent'} onChange={handleInputChange} />
                    <span>Excellent</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="condition" value="good" checked={editData.condition === 'good'} onChange={handleInputChange} />
                    <span>Good</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="condition" value="fair" checked={editData.condition === 'fair'} onChange={handleInputChange} />
                    <span>Fair</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="condition" value="poor" checked={editData.condition === 'poor'} onChange={handleInputChange} />
                    <span>Poor</span>
                  </label>
                </div>
              </div>

              <div className="question-group">
                <label className="question-label">Does this item have significant monetary value? *</label>
                <div className="radio-options">
                  <label className="radio-option">
                    <input type="radio" name="value" value="high" checked={editData.value === 'high'} onChange={handleInputChange} />
                    <span>Yes ($100+)</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="value" value="medium" checked={editData.value === 'medium'} onChange={handleInputChange} />
                    <span>Some ($20-100)</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="value" value="low" checked={editData.value === 'low'} onChange={handleInputChange} />
                    <span>Minimal (&lt;$20)</span>
                  </label>
                </div>
              </div>

              <div className="question-group">
                <label className="question-label">If you needed this item, how easy would it be to replace? *</label>
                <div className="radio-options">
                  <label className="radio-option">
                    <input type="radio" name="replace" value="easy" checked={editData.replace === 'easy'} onChange={handleInputChange} />
                    <span>Very Easy</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="replace" value="moderate" checked={editData.replace === 'moderate'} onChange={handleInputChange} />
                    <span>Moderate</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="replace" value="difficult" checked={editData.replace === 'difficult'} onChange={handleInputChange} />
                    <span>Difficult</span>
                  </label>
                </div>
              </div>

              <div className="question-group">
                <label className="question-label">Do you have space to easily access this item if kept? *</label>
                <div className="radio-options">
                  <label className="radio-option">
                    <input type="radio" name="space" value="yes" checked={editData.space === 'yes'} onChange={handleInputChange} />
                    <span>Yes</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="space" value="no" checked={editData.space === 'no'} onChange={handleInputChange} />
                    <span>No</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="space" value="limited" checked={editData.space === 'limited'} onChange={handleInputChange} />
                    <span>Limited</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="edit-actions">
              <button onClick={handleSave} className="btn-save" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={handleCancel} className="btn-cancel" disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="detail-grid">
            {item.image_url && (
              <div className="detail-image-section">
                <img src={item.image_url} alt={item.name} />
              </div>
            )}

            <div className="detail-info-section">
              <div className="card">
                <div className="recommendation-display">
                  <div className={`recommendation-badge badge-${item.recommendation}`}>
                    {recommendationLabels[item.recommendation]}
                  </div>
                  <h2>Recommendation</h2>
                </div>

                {item.recommendation_reasoning && (
                  <div className="reasoning-box">
                    <h3>Why This Makes Sense</h3>
                    <p>{item.recommendation_reasoning}</p>
                  </div>
                )}
              </div>

              {item.description && (
                <div className="card">
                  <h3 className="card-title">Description</h3>
                  <p>{item.description}</p>
                </div>
              )}

              <div className="card">
                <h3 className="card-title">Details</h3>
                <div className="details-list">
                  {item.location && (
                    <div className="detail-row">
                      <span className="detail-label">Location:</span>
                      <span className="detail-value">{item.location}</span>
                    </div>
                  )}
                  {item.category && (
                    <div className="detail-row">
                      <span className="detail-label">Category:</span>
                      <span className="detail-value">{item.category}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Evaluated:</span>
                    <span className="detail-value">{formatDate(item.created_at)}</span>
                  </div>
                </div>
              </div>

              {Object.keys(answers).length > 0 && (
                <div className="card">
                  <h3 className="card-title">Your Answers</h3>
                  <div className="answers-list">
                    {answers.used && (
                      <div className="answer-item">
                        <span className="answer-question">Used in past year?</span>
                        <span className="answer-value">{answers.used}</span>
                      </div>
                    )}
                    {answers.sentimental && (
                      <div className="answer-item">
                        <span className="answer-question">Sentimental value?</span>
                        <span className="answer-value">{answers.sentimental}</span>
                      </div>
                    )}
                    {answers.condition && (
                      <div className="answer-item">
                        <span className="answer-question">Condition?</span>
                        <span className="answer-value">{answers.condition}</span>
                      </div>
                    )}
                    {answers.value && (
                      <div className="answer-item">
                        <span className="answer-question">Monetary value?</span>
                        <span className="answer-value">{answers.value}</span>
                      </div>
                    )}
                    {answers.replace && (
                      <div className="answer-item">
                        <span className="answer-question">Ease to replace?</span>
                        <span className="answer-value">{answers.replace}</span>
                      </div>
                    )}
                    {answers.space && (
                      <div className="answer-item">
                        <span className="answer-question">Space available?</span>
                        <span className="answer-value">{answers.space}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ItemDetail;
