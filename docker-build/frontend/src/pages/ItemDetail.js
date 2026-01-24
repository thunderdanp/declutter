import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import './ItemDetail.css';

function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchItem();
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

  const recommendationLabels = {
    keep: 'Keep It',
    storage: 'Put in Storage',
    accessible: 'Keep Accessible',
    sell: 'Sell It',
    donate: 'Donate It',
    discard: 'Discard It'
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
          <Link to="/history" className="nav-link">History</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
        </div>
      </nav>

      <div className="container">
        <div className="back-link">
          <Link to="/history">← Back to History</Link>
        </div>

        <div className="detail-header">
          <h1 className="page-title">{item.name}</h1>
          <div className="header-actions">
            <button onClick={handleDelete} className="btn-delete" disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Item'}
            </button>
          </div>
        </div>

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
      </div>
    </div>
  );
}

export default ItemDetail;
