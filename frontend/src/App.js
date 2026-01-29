import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { CategoryProvider } from './context/CategoryContext';
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
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminSettings from './pages/AdminSettings';
import AdminEmailTemplates from './pages/AdminEmailTemplates';
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminCategories from './pages/AdminCategories';
import AdminApiUsage from './pages/AdminApiUsage';
import AdminRecommendations from './pages/AdminRecommendations';
import AdminAnalytics from './pages/AdminAnalytics';
import HouseholdMembers from './pages/HouseholdMembers';
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

  // Handle scroll to shrink header on mobile
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        document.body.classList.add('scrolled');
      } else {
        document.body.classList.remove('scrolled');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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
      <CategoryProvider>
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
        <Route path="/my-items" element={
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
        <Route path="/admin/email-templates" element={
          isAuthenticated ? <AdminEmailTemplates setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/announcements" element={
          isAuthenticated ? <AdminAnnouncements setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/categories" element={
          isAuthenticated ? <AdminCategories setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/api-usage" element={
          isAuthenticated ? <AdminApiUsage setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/recommendations" element={
          isAuthenticated ? <AdminRecommendations setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/admin/analytics" element={
          isAuthenticated ? <AdminAnalytics setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/" />
        } />
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Landing />} />
          </Routes>
        </Router>
      </CategoryProvider>
    </ThemeProvider>
  );
}

export default App;
