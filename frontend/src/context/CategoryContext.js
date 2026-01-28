import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CategoryContext = createContext();

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/categories');

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
      } else {
        setError('Failed to fetch categories');
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Network error fetching categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Get category by slug
  const getCategoryBySlug = useCallback((slug) => {
    if (!slug) return null;
    return categories.find(c => c.slug.toLowerCase() === slug.toLowerCase());
  }, [categories]);

  // Get default category
  const getDefaultCategory = useCallback(() => {
    return categories.find(c => c.is_default) || categories[categories.length - 1];
  }, [categories]);

  // Refresh categories (useful after admin changes)
  const refreshCategories = useCallback(() => {
    return fetchCategories();
  }, [fetchCategories]);

  const value = {
    categories,
    loading,
    error,
    getCategoryBySlug,
    getDefaultCategory,
    refreshCategories
  };

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoryProvider');
  }
  return context;
}

export default CategoryContext;
