import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Landing.css';

function Landing() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="landing-container">
      <nav className="landing-nav">
        <div className="nav-brand">
          <h2>Declutter Assistant</h2>
        </div>
        <div className="nav-actions">
          <button onClick={toggleTheme} className="btn-theme-toggle" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <Link to="/login" className="btn btn-secondary btn-nav">Sign In</Link>
          <Link to="/register" className="btn btn-primary btn-nav">Get Started</Link>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Declutter Assistant</h1>
          <p className="hero-tagline">AI-powered decluttering that understands your unique relationship with your belongings</p>
          <p className="hero-description">
            Get personalized recommendations on what to keep, donate, sell, or discard based on your personality, goals, and lifestyle.
          </p>
          <div className="hero-cta">
            <Link to="/register" className="btn btn-primary btn-large">Get Started</Link>
            <Link to="/login" className="btn btn-secondary btn-large">Sign In</Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <h2 className="section-title">How It Works</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI-Powered Evaluation</h3>
            <p>Smart analysis considers your item's condition, usage frequency, sentimental value, and more to provide thoughtful recommendations.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">👤</div>
            <h3>Personality-Based Advice</h3>
            <p>Your unique preferences and decluttering style shape every recommendation. No one-size-fits-all approach here.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📋</div>
            <h3>Item Tracking</h3>
            <p>Keep a complete history of evaluated items. Track progress, revisit decisions, and see your decluttering journey unfold.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">👨‍👩‍👧‍👦</div>
            <h3>Household Sharing</h3>
            <p>Work together with family members. Share items, coordinate decisions, and declutter as a team.</p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Ready to Simplify Your Space?</h2>
        <p>Join thousands of people who have transformed their homes with mindful decluttering.</p>
        <Link to="/register" className="btn btn-primary btn-large">Start Your Journey</Link>
      </section>

      <footer className="landing-footer">
        <p>Declutter Assistant - Mindful organization for a simpler life</p>
      </footer>
    </div>
  );
}

export default Landing;
