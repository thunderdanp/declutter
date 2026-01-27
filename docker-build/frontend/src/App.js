import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import PersonalityProfile from './pages/PersonalityProfile';
import EvaluateItem from './pages/EvaluateItem';
import ItemHistory from './pages/ItemHistory';
import ItemDetail from './pages/ItemDetail';
import HouseholdMembers from './pages/HouseholdMembers';
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
        <Route path="/reset-password/:token" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : <ResetPassword />
        } />
        <Route path="/dashboard" element={
          isAuthenticated ? <Dashboard setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/profile" element={
          isAuthenticated ? <PersonalityProfile setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/evaluate" element={
          isAuthenticated ? <EvaluateItem setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/my_items" element={
          isAuthenticated ? <ItemHistory setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/settings" element={
          isAuthenticated ? <Settings setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/household" element={
          isAuthenticated ? <HouseholdMembers setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/items/:id" element={
          isAuthenticated ? <ItemDetail setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin" element={
          isAuthenticated ? <AdminDashboard setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/users" element={
          isAuthenticated ? <AdminUsers setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/settings" element={
          isAuthenticated ? <AdminSettings setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Landing />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
