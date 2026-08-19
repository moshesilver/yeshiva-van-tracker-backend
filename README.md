# Yeshiva Van Tracker – Backend

A REST API built with Express and TypeScript for managing van usage, trip logging, and expense tracking at a yeshiva (school). This backend powers the [Yeshiva Van Tracker Frontend](https://github.com/moshesilver/yeshiva-van-tracker-frontend).

## ⚠️ Project Status

This project is **actively under development** and not fully functional yet. The API is still evolving, and endpoints are subject to change as features are implemented and refined.

## 🎯 Overview

The backend provides the core infrastructure for managing a shared vehicle system. It handles:

- **User management** – Authentication, roles, and permissions
- **Trip management** – Creating, updating, and retrieving trip records
- **Booking system** – Managing van requests and reservations
- **Expense tracking** – Recording and categorizing trip-related costs
- **Data persistence** – Storing and querying all application data

The API is designed to be stateless and RESTful, making it easy to integrate with web, mobile, and other client applications.

## ✨ Features

### Currently Implemented
- User authentication with JWT tokens
- User registration and login endpoints
- Basic trip CRUD operations
- Database schema for trips, users, and expenses
- CORS support for frontend integration

### In Progress
- Complete trip management endpoints
- Expense tracking and categorization
- Role-based access control (RBAC)
- Input validation and error handling

### Planned Features
- Automated expense settlement calculations
- Analytics endpoints for usage reports
- Email notifications
- Booking request and approval system
- Advanced filtering and search
- Photo storage for tickets and tolls
- Strike system for users

## 🛠️ Tech Stack

- **Node.js** with **Express.js** – Web server framework
- **TypeScript** – Type-safe development
- **Prisma** – ORM for database management
- **LibSQL/Turso** – SQLite-compatible database
- **bcrypt** – Password hashing and security

## 📚 API Endpoints

### Authentication
- POST /auth/login – Login 

### Drivers
- GET /drivers - List all drivers

### Trips
- GET /trips – List all trips 
- GET /trips/:id – Get a specific trip (coming soon) 
- POST /trips – Create a new trip (and new driver if necessary) 
- PUT /trips/:id – Update a trip (coming soon) 
- DELETE /trips/:id – Delete a trip (coming soon) 

### Expenses
- GET /expenses – List all expenses
- POST /expenses – Log an expense
- PUT /expenses/:id – Update an expense

Note: Endpoints are still being finalized. Refer to the code for current implementations.

## 🔗 Frontend Integration
The frontend application communicates with this API for all data operations.

## 🔒 Security Notes
- Passwords are hashed with bcrypt before storage
- JWT tokens are used for stateless authentication
- Input validation is being implemented across endpoints
- CORS is configured to allow the frontend application

## 📝 Development Notes
- Database migrations are managed through Prisma
- TypeScript ensures type safety across the codebase
- Error handling and logging are still being implemented
