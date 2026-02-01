import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeItem, generateReasoning, recommendationLabels, fetchRecommendationSettings } from '../utils/recommendationEngine';
import { useTheme } from '../context/ThemeContext';
import CategorySelect from '../components/CategorySelect';
import './EvaluateItem.css';

function EvaluateItem({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [profile, setProfile] = useState(null);
  const [recSettings, setRecSettings] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [selectedOwners, setSelectedOwners] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    category: '',
    used: '',
    sentimental: '',
    condition: '',
    value: '',
    replace: '',
    space: '',
    lastUsedTimeframe: '',
    itemCondition: '',
    isSentimental: false,
    userNotes: '',
    personalityMode: '',
    userGoal: '',
    duplicateCount: 0
  });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
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
    fetchHouseholdMembers();
    loadRecommendationSettings();
    fetchAIPreferences();
  }, []);

  const fetchAIPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/ai-preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          personalityMode: data.personalityMode || 'balanced',
          userGoal: data.userGoal || 'general'
        }));
      }
    } catch (error) {
      console.error('Error fetching AI preferences:', error);
    }
  };

  const fetchDuplicateCount = async (category) => {
    if (!category) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/items/duplicate-count/${encodeURIComponent(category)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, duplicateCount: data.count }));
      }
    } catch (error) {
      console.error('Error fetching duplicate count:', error);
    }
  };

  const loadRecommendationSettings = async () => {
    const settings = await fetchRecommendationSettings();
    if (settings) {
      setRecSettings(settings);
    }
  };

  const fetchHouseholdMembers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/household-members', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setHouseholdMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error fetching household members:', error);
    }
  };

  const toggleOwner = (memberId) => {
    setSelectedOwners(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (name === 'category' && value) {
      fetchDuplicateCount(value);
    }
  };

  // Resize image to target size (default 2MB max)
  const resizeImage = (file, maxSizeBytes = 2 * 1024 * 1024) => {
    return new Promise((resolve) => {
      // If file is already small enough, return as-is
      if (file.size <= maxSizeBytes) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Calculate scale factor based on file size ratio
          const scaleFactor = Math.sqrt(maxSizeBytes / file.size);
          width = Math.floor(width * scaleFactor);
          height = Math.floor(height * scaleFactor);

          // Ensure minimum dimensions
          const maxDimension = 1920;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.floor(height * (maxDimension / width));
              width = maxDimension;
            } else {
              width = Math.floor(width * (maxDimension / height));
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with quality adjustment
          canvas.toBlob(
            (blob) => {
              const resizedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              console.log(`Image resized: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(resizedFile.size / 1024 / 1024).toFixed(2)}MB`);
              resolve(resizedFile);
            },
            'image/jpeg',
            0.85
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Resize image if needed
      const resizedFile = await resizeImage(file);
      setImage(resizedFile);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(resizedFile);

      // Analyze the image with Claude
      await analyzeImage(resizedFile);
    }
  };

  const analyzeImage = async (file) => {
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();

        // Auto-populate the form fields
        setFormData(prev => ({
          ...prev,
          name: data.name || prev.name,
          description: data.description || prev.description,
          category: data.category || prev.category,
          location: data.location || prev.location
        }));
      } else {
        const errorData = await response.json();
        setAnalysisError(errorData.error || 'Failed to analyze image');
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
      setAnalysisError('Network error while analyzing image');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      alert('Please enter an item name');
      return;
    }

    const unanswered = Object.entries(formData)
      .filter(([key, value]) => key !== 'description' && key !== 'location' && key !== 'category' && !value);
    
    if (unanswered.length > 0) {
      alert('Please answer all questions');
      return;
    }

    setLoading(true);

    const recommendationType = analyzeItem(formData, profile, recSettings);
    const reasoning = generateReasoning(recommendationType, formData, profile);

    try {
      const token = localStorage.getItem('token');
      const data = new FormData();
      
      data.append('name', formData.name);
      data.append('description', formData.description);
      data.append('location', formData.location);
      data.append('category', formData.category);
      data.append('recommendation', recommendationType);
      data.append('recommendationReasoning', reasoning);
      data.append('answers', JSON.stringify(formData));
      data.append('status', 'evaluated');
      data.append('ownerIds', JSON.stringify(selectedOwners));
      if (formData.lastUsedTimeframe) data.append('lastUsedTimeframe', formData.lastUsedTimeframe);
      if (formData.itemCondition) data.append('itemCondition', formData.itemCondition);
      data.append('isSentimental', String(formData.isSentimental));
      if (formData.userNotes) data.append('userNotes', formData.userNotes);

      if (image) {
        data.append('image', image);
      }

      const response = await fetch('/api/items', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: data
      });

      if (response.ok) {
        const result = await response.json();
        setRecommendation({
          type: recommendationType,
          reasoning: reasoning,
          itemId: result.item.id
        });
      } else {
        alert('Error saving item. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(prev => ({
      name: '',
      description: '',
      location: '',
      category: '',
      used: '',
      sentimental: '',
      condition: '',
      value: '',
      replace: '',
      space: '',
      lastUsedTimeframe: '',
      itemCondition: '',
      isSentimental: false,
      userNotes: '',
      personalityMode: prev.personalityMode,
      userGoal: prev.userGoal,
      duplicateCount: 0
    }));
    setImage(null);
    setImagePreview(null);
    setRecommendation(null);
    setAnalyzing(false);
    setAnalysisError(null);
    setSelectedOwners([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (recommendation) {
    return (
      <div className="dashboard-container">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <h2>Declutter Assistant</h2>
          </div>
          <div className="nav-links">
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/profile" className="nav-link">Profile</Link>
            <Link to="/evaluate" className="nav-link active">Evaluate Item</Link>
            <Link to="/my-items" className="nav-link">My Items</Link>
            <Link to="/household" className="nav-link">Household</Link>
            <Link to="/settings" className="nav-link">Settings</Link>
            <Link to="/support" className="nav-link">Support</Link>
            {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
            <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
              {isDark ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </nav>

        <div className="container">
          <div className="card result-card">
            <div className="recommendation-display">
              <div className={`recommendation-badge badge-${recommendation.type}`}>
                {recommendationLabels[recommendation.type]}
              </div>
              <h2>Recommendation: {recommendationLabels[recommendation.type]}</h2>
            </div>

            <div className="reasoning-box">
              <h3>Why This Makes Sense</h3>
              <p>{recommendation.reasoning}</p>
            </div>

            <div className="result-actions">
              <button onClick={resetForm} className="btn btn-primary">
                Evaluate Another Item
              </button>
              <Link to={`/items/${recommendation.itemId}`} className="btn btn-secondary">
                View Item Details
              </Link>
              <Link to="/my-items" className="btn btn-secondary">
                View All Items
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant</h2>
        </Link>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/profile" className="nav-link">Profile</Link>
          <Link to="/evaluate" className="nav-link active">Evaluate Item</Link>
          <Link to="/my-items" className="nav-link">My Items</Link>
          <Link to="/household" className="nav-link">Household</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          <Link to="/support" className="nav-link">Support</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Evaluate an Item</h1>
          <p className="page-subtitle">Get personalized recommendations based on your profile</p>
        </div>

        <form onSubmit={handleSubmit} className="evaluate-form">
          <div className="card photo-card">
            <div className="form-group">
              <label>Take or Upload Photo (Optional)</label>
              <div className="image-upload-container">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageChange}
                  className="file-input"
                  id="camera-upload"
                  disabled={analyzing}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="file-input"
                  id="gallery-upload"
                  disabled={analyzing}
                />
                <div className="photo-buttons">
                  <label htmlFor="camera-upload" className="file-label photo-button">
                    {analyzing ? '🔍 Analyzing...' : '📷 Take Photo'}
                  </label>
                  <label htmlFor="gallery-upload" className="file-label photo-button photo-button-secondary">
                    {analyzing ? '🔍 Analyzing...' : '🖼️ Choose from Gallery'}
                  </label>
                </div>
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Preview" />
                  </div>
                )}
                {analyzing && (
                  <div className="analysis-status">
                    <p className="status-analyzing">
                      Analyzing image with AI... This may take a few seconds.
                    </p>
                  </div>
                )}
                {!analyzing && formData.name && imagePreview && (
                  <div className="analysis-status">
                    <p className="status-success">
                      ✓ AI has auto-filled item details! Review and edit as needed.
                    </p>
                  </div>
                )}
                {analysisError && (
                  <div className="analysis-status">
                    <p className="status-error">
                      ⚠️ {analysisError}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="form-group">
              <label>Item Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., vintage record player, winter coats, kitchen gadgets"
                required
              />
            </div>

            <div className="form-group">
              <label>Item Description (Optional)</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Add any relevant details about the item, its condition, or sentimental value..."
                rows="3"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Current Location</label>
                <select name="location" value={formData.location} onChange={handleChange}>
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
                <CategorySelect
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                />
              </div>
            </div>

            {householdMembers.length > 0 && (
              <div className="form-group">
                <label>Who owns this item? (Optional)</label>
                <div className="owner-chips">
                  {householdMembers.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      className={`owner-chip ${selectedOwners.includes(member.id) ? 'selected' : ''}`}
                      onClick={() => toggleOwner(member.id)}
                    >
                      {member.name}
                      {member.relationship && <span className="chip-relationship"> ({member.relationship})</span>}
                    </button>
                  ))}
                </div>
                <p className="form-help">Select all household members who own this item</p>
              </div>
            )}
          </div>

          <div className="card questions-card">
            <h2 className="section-heading">Evaluation Questions</h2>
            
            <div className="question-group">
              <label className="question-label">Have you used this item in the past year? *</label>
              <div className="radio-options">
                <label className="radio-option">
                  <input type="radio" name="used" value="yes" onChange={handleChange} required />
                  <span>Yes</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="used" value="no" onChange={handleChange} />
                  <span>No</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="used" value="rarely" onChange={handleChange} />
                  <span>Rarely</span>
                </label>
              </div>
            </div>

            <div className="question-group">
              <label className="question-label">Does this item have sentimental value? *</label>
              <div className="radio-options">
                <label className="radio-option">
                  <input type="radio" name="sentimental" value="high" onChange={handleChange} required />
                  <span>Very Much</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="sentimental" value="some" onChange={handleChange} />
                  <span>Somewhat</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="sentimental" value="no" onChange={handleChange} />
                  <span>No</span>
                </label>
              </div>
            </div>

            <div className="question-group">
              <label className="question-label">What is the item's condition? *</label>
              <div className="radio-options">
                <label className="radio-option">
                  <input type="radio" name="condition" value="excellent" onChange={handleChange} required />
                  <span>Excellent</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="condition" value="good" onChange={handleChange} />
                  <span>Good</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="condition" value="fair" onChange={handleChange} />
                  <span>Fair</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="condition" value="poor" onChange={handleChange} />
                  <span>Poor</span>
                </label>
              </div>
            </div>

            <div className="question-group">
              <label className="question-label">Does this item have significant monetary value? *</label>
              <div className="radio-options">
                <label className="radio-option">
                  <input type="radio" name="value" value="high" onChange={handleChange} required />
                  <span>Yes ($100+)</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="value" value="medium" onChange={handleChange} />
                  <span>Some ($20-100)</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="value" value="low" onChange={handleChange} />
                  <span>Minimal (&lt;$20)</span>
                </label>
              </div>
            </div>

            <div className="question-group">
              <label className="question-label">If you needed this item, how easy would it be to replace? *</label>
              <div className="radio-options">
                <label className="radio-option">
                  <input type="radio" name="replace" value="easy" onChange={handleChange} required />
                  <span>Very Easy</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="replace" value="moderate" onChange={handleChange} />
                  <span>Moderate</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="replace" value="difficult" onChange={handleChange} />
                  <span>Difficult</span>
                </label>
              </div>
            </div>

            <div className="question-group">
              <label className="question-label">Do you have space to easily access this item if kept? *</label>
              <div className="radio-options">
                <label className="radio-option">
                  <input type="radio" name="space" value="yes" onChange={handleChange} required />
                  <span>Yes</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="space" value="no" onChange={handleChange} />
                  <span>No</span>
                </label>
                <label className="radio-option">
                  <input type="radio" name="space" value="limited" onChange={handleChange} />
                  <span>Limited</span>
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-heading">Additional Context</h2>

            <div className="form-row">
              <div className="form-group">
                <label>When did you last use this item?</label>
                <select name="lastUsedTimeframe" value={formData.lastUsedTimeframe} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="last_month">Last month</option>
                  <option value="last_6_months">Last 6 months</option>
                  <option value="last_year">Last year</option>
                  <option value="1-2_years">1-2 years ago</option>
                  <option value="2+_years">2+ years ago</option>
                  <option value="never_used">Never used</option>
                </select>
              </div>

              <div className="form-group">
                <label>Item condition</label>
                <select name="itemCondition" value={formData.itemCondition} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                  <option value="broken">Broken</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="isSentimental"
                  checked={formData.isSentimental}
                  onChange={handleChange}
                />
                <span>This item has sentimental value</span>
              </label>
            </div>

            <div className="form-group">
              <label>Notes about this item (helps AI personalize)</label>
              <textarea
                name="userNotes"
                value={formData.userNotes}
                onChange={handleChange}
                placeholder="e.g., 'Grandmother gave this to me', 'Never got around to using it', 'My favorite kitchen tool'..."
                rows="3"
              />
            </div>

            {formData.duplicateCount > 1 && (
              <div className="duplicate-badge">
                You have {formData.duplicateCount} items in this category
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? 'Analyzing...' : 'Get Recommendation'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EvaluateItem;
