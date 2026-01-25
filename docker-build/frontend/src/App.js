import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import PersonalityProfile from './pages/PersonalityProfile';
import EvaluateItem from './pages/EvaluateItem';
import ItemHistory from './pages/ItemHistory';
import ItemDetail from './pages/ItemDetail';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminSettings from './pages/AdminSettings';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token is valid
      fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => {
          if (res.ok) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('token');
          }
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <Router>
        <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : <Login setIsAuthenticated={setIsAuthenticated} />
        } />
        <Route path="/register" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : <Register setIsAuthenticated={setIsAuthenticated} />
        } />
        <Route path="/forgot-password" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : <ForgotPassword />
        } />
        <Route path="/dashboard" element={
          isAuthenticated ? <Dashboard /> : <Navigate to="/login" />
        } />
        <Route path="/profile" element={
          isAuthenticated ? <PersonalityProfile /> : <Navigate to="/login" />
        } />
        <Route path="/evaluate" element={
          isAuthenticated ? <EvaluateItem /> : <Navigate to="/login" />
        } />
        <Route path="/history" element={
          isAuthenticated ? <ItemHistory /> : <Navigate to="/login" />
        } />
        <Route path="/settings" element={
          isAuthenticated ? <Settings /> : <Navigate to="/login" />
        } />
        <Route path="/items/:id" element={
          isAuthenticated ? <ItemDetail /> : <Navigate to="/login" />
        } />
        <Route path="/admin" element={
          isAuthenticated ? <AdminDashboard /> : <Navigate to="/login" />
        } />
        <Route path="/admin/users" element={
          isAuthenticated ? <AdminUsers /> : <Navigate to="/login" />
        } />
        <Route path="/admin/settings" element={
          isAuthenticated ? <AdminSettings /> : <Navigate to="/login" />
        } />
        <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
