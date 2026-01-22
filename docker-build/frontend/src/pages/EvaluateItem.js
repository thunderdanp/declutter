import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './EvaluateItem.css';

function EvaluateItem() {
  const [profile, setProfile] = useState(null);
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
    space: ''
  });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const navigate = useNavigate();

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
        setProfile(data.profile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);

      // Analyze the image with Claude
      await analyzeImage(file);
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
          category: data.category || prev.category
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

  const analyzeItem = () => {
    let scores = {
      keep: 0,
      storage: 0,
      accessible: 0,
      sell: 0,
      donate: 0,
      discard: 0
    };

    // Usage analysis
    if (formData.used === 'yes') {
      scores.keep += 3;
      scores.accessible += 2;
    } else if (formData.used === 'rarely') {
      scores.storage += 2;
      scores.accessible += 1;
    } else {
      scores.donate += 2;
      scores.sell += 1;
      scores.discard += 1;
    }

    // Sentimental value
    if (formData.sentimental === 'high') {
      scores.keep += 3;
      scores.storage += 2;
    } else if (formData.sentimental === 'some') {
      scores.keep += 1;
      scores.storage += 2;
    } else {
      scores.sell += 1;
      scores.donate += 1;
    }

    // Condition
    if (formData.condition === 'excellent' || formData.condition === 'good') {
      scores.keep += 1;
      scores.sell += 2;
      scores.donate += 1;
    } else if (formData.condition === 'fair') {
      scores.donate += 2;
      scores.discard += 1;
    } else {
      scores.discard += 3;
    }

    // Monetary value
    if (formData.value === 'high') {
      scores.keep += 2;
      scores.sell += 3;
    } else if (formData.value === 'medium') {
      scores.sell += 2;
      scores.donate += 1;
    } else {
      scores.donate += 2;
      scores.discard += 1;
    }

    // Replaceability
    if (formData.replace === 'difficult') {
      scores.keep += 2;
      scores.storage += 2;
    } else if (formData.replace === 'moderate') {
      scores.storage += 1;
    } else {
      scores.donate += 1;
      scores.discard += 1;
    }

    // Space availability
    if (formData.space === 'yes') {
      scores.keep += 2;
      scores.accessible += 3;
    } else if (formData.space === 'limited') {
      scores.storage += 2;
    } else {
      scores.storage += 1;
      scores.sell += 1;
      scores.donate += 1;
    }

    // Apply personality profile adjustments
    if (profile) {
      if (profile.minimalistLevel === 'extreme') {
        scores.discard += 2;
        scores.donate += 2;
        scores.keep -= 1;
      } else if (profile.minimalistLevel === 'maximalist') {
        scores.keep += 2;
        scores.storage += 1;
      }

      if (profile.budgetPriority === 'very-important' && formData.value !== 'low') {
        scores.sell += 2;
      } else if (profile.budgetPriority === 'not-important') {
        scores.donate += 2;
      }

      if (profile.sentimentalValue === 'very-sentimental') {
        scores.keep += 1;
        scores.storage += 1;
      }

      if (profile.livingSpace === 'small-apartment' || profile.livingSpace === 'studio') {
        scores.storage -= 1;
        scores.donate += 1;
      }
    }

    const maxScore = Math.max(...Object.values(scores));
    return Object.keys(scores).find(key => scores[key] === maxScore);
  };

  const generateReasoning = (recommendation) => {
    const reasons = [];
    const itemName = formData.name || 'This item';

    if (recommendation === 'keep') {
      reasons.push(`${itemName} appears to be something you should keep in your home.`);
      if (formData.used === 'yes') {
        reasons.push('You use this item regularly, which shows it serves an active purpose in your life.');
      }
      if (formData.sentimental === 'high') {
        reasons.push('Its strong sentimental value makes it worth holding onto.');
      }
      if (profile?.minimalistLevel === 'maximalist') {
        reasons.push('Based on your personality profile, you appreciate having variety and enjoy collecting meaningful items.');
      }
    } else if (recommendation === 'storage') {
      reasons.push(`${itemName} would be best placed in storage.`);
      if (formData.used === 'rarely' || formData.used === 'no') {
        reasons.push("You don't use this frequently enough to warrant prime real estate in your living space.");
      }
      if (formData.replace === 'difficult') {
        reasons.push("This item would be hard to replace, so it's worth keeping, just not in your main living areas.");
      }
    } else if (recommendation === 'accessible') {
      reasons.push(`${itemName} should be kept in an easily accessible location.`);
      if (formData.used === 'yes') {
        reasons.push('You use this item enough that it should be easy to reach when needed.');
      }
    } else if (recommendation === 'sell') {
      reasons.push(`${itemName} is a good candidate for selling.`);
      if (formData.value === 'high' || formData.value === 'medium') {
        reasons.push('This item has monetary value that you could recoup through selling.');
      }
      if (profile?.budgetPriority === 'very-important') {
        reasons.push('Based on your profile, recouping money from items is important to you.');
      }
    } else if (recommendation === 'donate') {
      reasons.push(`${itemName} would make a wonderful donation.`);
      if (formData.condition === 'good' || formData.condition === 'fair') {
        reasons.push("It's in decent enough condition for someone else to use and appreciate.");
      }
      if (profile?.budgetPriority === 'not-important') {
        reasons.push('Based on your profile, you prefer donating over selling, which is a generous choice.');
      }
    } else if (recommendation === 'discard') {
      reasons.push(`${itemName} can be discarded.`);
      if (formData.condition === 'poor') {
        reasons.push("Its poor condition means it's not suitable for donation or resale.");
      }
      if (profile?.minimalistLevel === 'extreme') {
        reasons.push('As someone who values minimalism, letting go of items like this will help you achieve your goals.');
      }
    }

    return reasons.join(' ');
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

    const recommendationType = analyzeItem();
    const reasoning = generateReasoning(recommendationType);

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
    setFormData({
      name: '',
      description: '',
      location: '',
      category: '',
      used: '',
      sentimental: '',
      condition: '',
      value: '',
      replace: '',
      space: ''
    });
    setImage(null);
    setImagePreview(null);
    setRecommendation(null);
    setAnalyzing(false);
    setAnalysisError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const recommendationTitles = {
    keep: 'Keep It',
    storage: 'Put in Storage',
    accessible: 'Keep Accessible',
    sell: 'Sell It',
    donate: 'Donate It',
    discard: 'Discard It'
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
            <Link to="/history" className="nav-link">History</Link>
          </div>
        </nav>

        <div className="container">
          <div className="card result-card">
            <div className="recommendation-display">
              <div className={`recommendation-badge badge-${recommendation.type}`}>
                {recommendationTitles[recommendation.type]}
              </div>
              <h2>Recommendation: {recommendationTitles[recommendation.type]}</h2>
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
              <Link to="/history" className="btn btn-secondary">
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
        <div className="nav-brand">
          <h2>Declutter Assistant</h2>
        </div>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/profile" className="nav-link">Profile</Link>
          <Link to="/evaluate" className="nav-link active">Evaluate Item</Link>
          <Link to="/history" className="nav-link">History</Link>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Evaluate an Item</h1>
          <p className="page-subtitle">Get personalized recommendations based on your profile</p>
        </div>

        <form onSubmit={handleSubmit} className="evaluate-form">
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
                <select name="category" value={formData.category} onChange={handleChange}>
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

            <div className="form-group">
              <label>Upload Photo (Optional)</label>
              <div className="image-upload-container">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="file-input"
                  id="image-upload"
                  disabled={analyzing}
                />
                <label htmlFor="image-upload" className="file-label">
                  {analyzing ? 'Analyzing...' : imagePreview ? 'Change Photo' : 'Choose Photo'}
                </label>
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Preview" />
                  </div>
                )}
                {analyzing && (
                  <div className="analysis-status">
                    <p style={{ color: '#007bff', marginTop: '10px' }}>
                      🔍 Analyzing image with AI... This may take a few seconds.
                    </p>
                  </div>
                )}
                {!analyzing && formData.name && imagePreview && (
                  <div className="analysis-status">
                    <p style={{ color: '#28a745', marginTop: '10px' }}>
                      ✓ AI has auto-filled item details! Review and edit as needed.
                    </p>
                  </div>
                )}
                {analysisError && (
                  <div className="analysis-status">
                    <p style={{ color: '#dc3545', marginTop: '10px' }}>
                      ⚠️ {analysisError}
                    </p>
                  </div>
                )}
              </div>
            </div>
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

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? 'Analyzing...' : 'Get Recommendation'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EvaluateItem;
