# Declutter Assistant API Documentation

## Overview

The Declutter Assistant API is a RESTful API built with Node.js and Express. All endpoints return JSON responses and require JWT authentication (except for public endpoints).

**Base URL:** `/api`

**Authentication:** Bearer token in Authorization header
```
Authorization: Bearer <jwt_token>
```

---

## Table of Contents

- [Authentication](#authentication)
- [Users](#users)
- [Profile](#profile)
- [Items](#items)
- [Categories](#categories)
- [Household Members](#household-members)
- [Admin - Users](#admin---users)
- [Admin - Settings](#admin---settings)
- [Admin - Email Templates](#admin---email-templates)
- [Admin - Announcements](#admin---announcements)
- [Admin - Categories](#admin---categories)
- [Admin - Recommendations](#admin---recommendations)
- [Admin - Analytics](#admin---analytics)
- [Admin - API Usage](#admin---api-usage)

---

## Authentication

### Register User
```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:** `201 Created`
```json
{
  "message": "Registration successful",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "isAdmin": false
  }
}
```

### Login
```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `200 OK`
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "isAdmin": false
  }
}
```

### Get Current User
```http
GET /api/auth/me
```
*Requires authentication*

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "isAdmin": false
  }
}
```

### Forgot Password
```http
POST /api/auth/forgot-password
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "If an account exists, a password reset email has been sent"
}
```

### Reset Password
```http
POST /api/auth/reset-password
```

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "password": "newpassword"
}
```

---

## Profile

### Get Personality Profile
```http
GET /api/profile
```
*Requires authentication*

**Response:** `200 OK`
```json
{
  "profile": {
    "attachmentStyle": "moderate",
    "decisionSpeed": "deliberate",
    "spaceConstraints": "limited",
    "goals": ["reduce_clutter", "organize"]
  }
}
```

### Save/Update Profile
```http
POST /api/profile
```
*Requires authentication*

**Request Body:**
```json
{
  "profileData": {
    "attachmentStyle": "moderate",
    "decisionSpeed": "deliberate",
    "spaceConstraints": "limited",
    "goals": ["reduce_clutter", "organize"]
  }
}
```

---

## Items

### Get All Items
```http
GET /api/items
```
*Requires authentication*

**Query Parameters:**
- `category` - Filter by category slug
- `recommendation` - Filter by recommendation type
- `status` - Filter by status

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "name": "Old Jacket",
      "description": "Winter jacket from 2015",
      "location": "closet",
      "category": "clothing",
      "image_url": "/uploads/image.jpg",
      "recommendation": "donate",
      "recommendation_reasoning": "Not used in past year...",
      "decision": null,
      "answers": {...},
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Single Item
```http
GET /api/items/:id
```
*Requires authentication*

### Create Item
```http
POST /api/items
```
*Requires authentication*

**Request Body (multipart/form-data):**
- `name` (required) - Item name
- `description` - Item description
- `location` - Storage location
- `category` - Category slug
- `recommendation` - AI recommendation
- `recommendationReasoning` - AI explanation
- `answers` - JSON string of evaluation answers
- `image` - Image file upload
- `ownerIds` - JSON array of household member IDs

### Update Item
```http
PUT /api/items/:id
```
*Requires authentication*

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "location": "garage",
  "category": "tools",
  "recommendation": "keep",
  "recommendationReasoning": "Updated reasoning",
  "answers": "{...}",
  "ownerIds": [1, 2]
}
```

### Record Decision
```http
PUT /api/items/:id/decision
```
*Requires authentication*

Records what the user actually did with the item.

**Request Body:**
```json
{
  "decision": "donate"
}
```

**Valid decisions:** `keep`, `accessible`, `storage`, `sell`, `donate`, `discard`

### Clear Decision
```http
DELETE /api/items/:id/decision
```
*Requires authentication*

### Delete Item
```http
DELETE /api/items/:id
```
*Requires authentication*

### Get Item Owners
```http
GET /api/items/:id/owners
```
*Requires authentication*

**Response:**
```json
{
  "ownerIds": [1, 2, 3]
}
```

---

## Categories

### Get All Categories
```http
GET /api/categories
```

**Response:** `200 OK`
```json
{
  "categories": [
    {
      "id": 1,
      "name": "Clothing",
      "slug": "clothing",
      "display_name": "Clothing",
      "icon": "👕",
      "color": "#9C27B0",
      "sort_order": 1,
      "is_default": false
    }
  ]
}
```

---

## Household Members

### Get Household Members
```http
GET /api/household-members
```
*Requires authentication*

### Add Household Member
```http
POST /api/household-members
```
*Requires authentication*

**Request Body:**
```json
{
  "name": "Jane Doe",
  "relationship": "spouse"
}
```

### Update Household Member
```http
PUT /api/household-members/:id
```
*Requires authentication*

### Delete Household Member
```http
DELETE /api/household-members/:id
```
*Requires authentication*

---

## User Statistics

### Get User Stats
```http
GET /api/stats
```
*Requires authentication*

**Response:**
```json
{
  "total": 25,
  "byRecommendation": [
    {"recommendation": "keep", "count": 10},
    {"recommendation": "donate", "count": 8}
  ],
  "byStatus": [
    {"status": "pending", "count": 15},
    {"status": "completed", "count": 10}
  ]
}
```

---

## Admin Endpoints

All admin endpoints require authentication and admin privileges.

### Admin - Users

#### Get All Users
```http
GET /api/admin/users
```

#### Approve User
```http
PUT /api/admin/users/:id/approve
```

#### Delete User
```http
DELETE /api/admin/users/:id
```

#### Get Admin Stats
```http
GET /api/admin/stats
```

**Response:**
```json
{
  "totalUsers": 50,
  "pendingUsers": 3,
  "totalItems": 500,
  "recentItems": [...],
  "recentUsers": [...]
}
```

---

### Admin - Settings

#### Get Settings
```http
GET /api/admin/settings
```

**Response:**
```json
{
  "settings": {
    "registrationMode": "automatic"
  }
}
```

#### Update Settings
```http
PUT /api/admin/settings
```

**Request Body:**
```json
{
  "registrationMode": "approval"
}
```

---

### Admin - Email Templates

#### Get All Templates
```http
GET /api/admin/email-templates
```

#### Get Single Template
```http
GET /api/admin/email-templates/:id
```

#### Create Template
```http
POST /api/admin/email-templates
```

**Request Body:**
```json
{
  "name": "custom_template",
  "subject": "Subject with {{variables}}",
  "body": "Email body with {{firstName}}",
  "description": "Template description",
  "triggerEvent": "manual",
  "isEnabled": true
}
```

#### Update Template
```http
PUT /api/admin/email-templates/:id
```

#### Delete Template
```http
DELETE /api/admin/email-templates/:id
```

---

### Admin - Announcements

#### Get All Announcements
```http
GET /api/admin/announcements
```

#### Create Announcement
```http
POST /api/admin/announcements
```

**Request Body:**
```json
{
  "title": "Important Update",
  "content": "Announcement content here..."
}
```

#### Send Announcement
```http
POST /api/admin/announcements/:id/send
```

#### Delete Announcement
```http
DELETE /api/admin/announcements/:id
```

---

### Admin - Categories

#### Get All Categories (Admin)
```http
GET /api/admin/categories
```

#### Create Category
```http
POST /api/admin/categories
```

**Request Body:**
```json
{
  "name": "Sports",
  "slug": "sports",
  "displayName": "Sports Equipment",
  "icon": "⚽",
  "color": "#4CAF50",
  "sortOrder": 10
}
```

#### Update Category
```http
PUT /api/admin/categories/:id
```

#### Delete Category
```http
DELETE /api/admin/categories/:id
```

#### Reorder Categories
```http
PUT /api/admin/categories/reorder
```

**Request Body:**
```json
{
  "categoryIds": [3, 1, 2, 5, 4]
}
```

---

### Admin - Recommendations

#### Get Recommendation Settings
```http
GET /api/admin/recommendations/weights
GET /api/admin/recommendations/thresholds
GET /api/admin/recommendations/strategies
```

#### Update Recommendation Settings
```http
PUT /api/admin/recommendations/weights
PUT /api/admin/recommendations/thresholds
PUT /api/admin/recommendations/strategies
```

#### Reset to Defaults
```http
POST /api/admin/recommendations/reset
```

**Query Parameters:**
- `type` - Specific setting to reset (weights, thresholds, strategies) or omit for all

---

### Admin - Analytics

#### Get Summary
```http
GET /api/admin/analytics/summary?period=30
```

**Query Parameters:**
- `period` - Number of days (default: 30)

**Response:**
```json
{
  "itemsAdded": 150,
  "activeUsers": 25,
  "decisionsMade": 100,
  "recommendationsFollowed": 75,
  "followRate": 75.0,
  "newUsers": 5,
  "period": 30
}
```

#### Get Item Trends
```http
GET /api/admin/analytics/item-trends?period=30
```

**Response:**
```json
{
  "itemsPerDay": [
    {"date": "2024-01-15", "count": 10}
  ],
  "recommendationsByType": [...],
  "recommendationTotals": [
    {"recommendation": "keep", "count": 50}
  ],
  "period": 30
}
```

#### Get User Activity
```http
GET /api/admin/analytics/user-activity?period=30
```

**Response:**
```json
{
  "activeUsers": 25,
  "totalUsers": 50,
  "topUsers": [...],
  "averageItemsPerUser": 6.5,
  "maxItemsPerUser": 25,
  "registrations": [...],
  "period": 30
}
```

#### Get Category Distribution
```http
GET /api/admin/analytics/categories?period=30
```

#### Get Conversion Tracking
```http
GET /api/admin/analytics/conversions?period=30
```

**Response:**
```json
{
  "conversionMatrix": [...],
  "overall": {
    "followed": 75,
    "diverged": 25,
    "total": 100,
    "followRate": 75.0
  },
  "byRecommendationType": [...],
  "pendingDecisions": [...],
  "modifiedRecommendations": [...],
  "period": 30
}
```

---

### Admin - API Usage

#### Get API Usage Stats
```http
GET /api/admin/api-usage
```

**Response:**
```json
{
  "totalCalls": 1000,
  "totalCost": 5.50,
  "callsByEndpoint": [...],
  "recentCalls": [...],
  "dailyUsage": [...]
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Description of what went wrong"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Admin access required"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Server error"
}
```

---

## Rate Limiting

Currently no rate limiting is implemented. Consider adding rate limiting for production deployments.

---

## Webhooks

No webhooks are currently implemented.

---

## Changelog

- **v1.0.0** - Initial API release
- **v1.1.0** - Added Analytics Dashboard endpoints
- **v1.2.0** - Added Decision Recording endpoints
