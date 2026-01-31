import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import './Auth.css';

function VerifyEmail() {
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const { token } = useParams();

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const response = await fetch(`/api/auth/verify-email/${token}`);
        const data = await response.json();

        if (response.ok) {
          setSuccess(true);
        } else {
          setError(data.error || 'Verification failed');
        }
      } catch (err) {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Email Verification</h1>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <p>Verifying your email...</p>
          </div>
        )}

        {!loading && success && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="message message-success" style={{ marginBottom: '1.5rem' }}>
              Email verified successfully! You can now log in.
            </div>
            <Link to="/login" className="btn btn-primary btn-block">
              Go to Login
            </Link>
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="message message-error" style={{ marginBottom: '1.5rem' }}>
              {error}
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              The verification link may have expired. Try logging in to request a new one.
            </p>
            <Link to="/login" className="btn btn-primary btn-block">
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
