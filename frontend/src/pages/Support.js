import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Support.css';

const faqItems = [
  {
    question: 'How do I reset my password?',
    answer: 'You can reset your password by going to Settings > Change Password. If you\'re locked out, click "Forgot Password" on the login page and follow the email instructions to set a new password.'
  },
  {
    question: 'How does item evaluation work?',
    answer: 'Navigate to "Evaluate Item" from the dashboard. Upload a photo of your item, provide a description, and our AI will analyze it to suggest whether to keep, sell, donate, store, or discard the item.'
  },
  {
    question: 'How do I manage household members?',
    answer: 'Go to the "Household" page from the navigation menu. There you can add household members by clicking "Add Member", providing their name and relationship.'
  },
  {
    question: 'What is the personality profile?',
    answer: 'The personality profile helps our AI understand your decluttering style and preferences. Visit the "Profile" page to answer questions about your habits and goals.'
  },
  {
    question: 'How do I configure AI image analysis?',
    answer: 'Go to Settings > AI Image Analysis. You can enable/disable image analysis, choose your preferred AI provider, and optionally enter your own API key.'
  },
  {
    question: 'How do I manage email notifications?',
    answer: 'Visit Settings > Email Notifications to control which emails you receive. You can toggle announcements, account updates, item recommendations, and weekly digest emails.'
  },
  {
    question: 'How do I switch between dark and light mode?',
    answer: 'You can toggle dark mode from the theme button in the navigation bar (sun/moon icon) or from Settings > Appearance.'
  },
  {
    question: 'How do I delete my account?',
    answer: 'Account deletion must be requested through an administrator. Please contact your system administrator to request account removal.'
  }
];

function Support({ setIsAuthenticated }) {
  const [user] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [error, setError] = useState('');
  const [expandedFaq, setExpandedFaq] = useState(null);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/support/my-tickets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitResult(null);

    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both subject and message');
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/support/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setSubmitResult(data.ticket);
        setSubject('');
        setMessage('');
        fetchTickets();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to submit ticket');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/');
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="nav-brand">
          <h2>Declutter Assistant</h2>
        </Link>
        <div className="nav-links">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/profile" className="nav-link">Profile</Link>
          <Link to="/evaluate" className="nav-link">Evaluate Item</Link>
          <Link to="/my-items" className="nav-link">My Items</Link>
          <Link to="/household" className="nav-link">Household</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          <Link to="/support" className="nav-link active">Support</Link>
          {user?.isAdmin && <Link to="/admin" className="nav-link nav-admin">Admin</Link>}
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Support</h1>
          <p className="page-subtitle">Find answers or submit a support ticket</p>
        </div>

        {/* FAQ Section */}
        <div className="card">
          <h2 className="section-heading">Frequently Asked Questions</h2>
          <div className="faq-list">
            {faqItems.map((item, index) => (
              <div key={index} className={`faq-item ${expandedFaq === index ? 'faq-expanded' : ''}`}>
                <button
                  className="faq-question"
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                >
                  <span>{item.question}</span>
                  <span className="faq-toggle">{expandedFaq === index ? '\u2212' : '+'}</span>
                </button>
                {expandedFaq === index && (
                  <div className="faq-answer">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit Ticket Form */}
        <div className="card">
          <h2 className="section-heading">Submit a Support Ticket</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Can't find your answer above? Submit a ticket and we'll get back to you.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                required
              />
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                rows="5"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            {submitResult && (
              <div className="ai-response-box">
                {submitResult.aiMatched ? (
                  <>
                    <h3>We found an answer for you!</h3>
                    <p>{submitResult.aiResponse}</p>
                    <p className="ai-disclaimer">
                      If this doesn't resolve your issue, an admin will follow up via email.
                    </p>
                  </>
                ) : (
                  <p>Your ticket #{submitResult.id} has been submitted. An admin will review it and respond via email.</p>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </form>
        </div>

        {/* Ticket History */}
        <div className="card">
          <h2 className="section-heading">Your Tickets</h2>
          {loadingTickets ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading tickets...</p>
          ) : tickets.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No support tickets yet.</p>
          ) : (
            <div className="ticket-list">
              {tickets.map(ticket => (
                <div key={ticket.id} className="ticket-item">
                  <div className="ticket-header">
                    <h3>#{ticket.id} - {ticket.subject}</h3>
                    <span className={`ticket-status status-${ticket.status}`}>
                      {ticket.status === 'ai_resolved' ? 'AI Resolved' : ticket.status === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <p className="ticket-message">{ticket.message}</p>
                  <span className="ticket-date">{formatDate(ticket.created_at)}</span>
                  {ticket.responses && ticket.responses.length > 0 && (
                    <div className="ticket-responses">
                      {ticket.responses.map(resp => (
                        <div key={resp.id} className={`ticket-response ${resp.is_ai_response ? 'ai-response' : ''}`}>
                          <span className="response-badge">{resp.is_ai_response ? 'AI Response' : 'Admin Response'}</span>
                          <p>{resp.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Support;
