import React from 'react';
import { useCategories } from '../context/CategoryContext';
import './CategorySelect.css';

function CategorySelect({ value, onChange, name = 'category', disabled = false, required = false }) {
  const { categories, loading, error } = useCategories();

  if (loading) {
    return (
      <select name={name} disabled className="category-select loading">
        <option value="">Loading categories...</option>
      </select>
    );
  }

  if (error) {
    return (
      <select name={name} value={value} onChange={onChange} disabled={disabled} required={required}>
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
    );
  }

  return (
    <select
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={required}
      className="category-select"
    >
      <option value="">Select category...</option>
      {categories.map((category) => (
        <option key={category.id} value={category.slug}>
          {category.icon} {category.display_name}
        </option>
      ))}
    </select>
  );
}

export default CategorySelect;
