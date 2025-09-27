# URL Shortener Application

## Overview

This is a modern URL shortener web application built with React and Express.js. The application allows users to input long URLs and receive shortened versions for easier sharing. It features a clean, responsive interface built with shadcn/ui components and Tailwind CSS styling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Form Handling**: React Hook Form with Zod validation for robust form management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming support
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Framework**: Express.js with TypeScript for the REST API server
- **Database ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **Validation**: Zod schemas shared between frontend and backend for consistent validation
- **Storage Strategy**: Currently uses in-memory storage (MemStorage) with interface for easy database migration
- **Short Code Generation**: Custom algorithm for generating unique short codes with collision detection

### Data Storage Solutions
- **Database**: PostgreSQL configured via Drizzle ORM
- **Schema Design**: 
  - `urls` table with id, originalUrl, shortCode, and createdAt fields
  - `users` table prepared for future authentication features
- **Migration System**: Drizzle Kit for database schema migrations
- **Connection**: Neon Database serverless driver for PostgreSQL connectivity

### API Design
- **POST /api/shorten**: Creates shortened URLs with validation and collision handling
- **GET /api/urls**: Retrieves all URLs (for administrative purposes)
- **GET /:shortCode**: Redirects to original URL based on short code
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Request Logging**: Custom middleware for API request logging and performance monitoring

### Development Experience
- **Hot Reload**: Vite dev server with React Fast Refresh
- **Type Safety**: Full TypeScript coverage across frontend, backend, and shared schemas
- **Code Quality**: ESLint and Prettier configuration for consistent code style
- **Path Aliases**: Configured for clean imports (@/, @shared/, @assets/)

## External Dependencies

### Database & ORM
- **Neon Database**: Serverless PostgreSQL database hosting
- **Drizzle ORM**: Type-safe database toolkit with PostgreSQL support
- **Drizzle Kit**: Database migration and schema management tool

### UI & Styling
- **shadcn/ui**: Comprehensive component library with accessibility features
- **Radix UI**: Headless UI primitives for complex components
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library for consistent iconography

### Development Tools
- **Vite**: Build tool with HMR and optimized bundling
- **TypeScript**: Static type checking across the entire stack
- **React Hook Form**: Performant form library with validation
- **TanStack Query**: Server state management with caching and synchronization
- **Wouter**: Minimalist routing library for React applications

### Validation & Utilities
- **Zod**: Schema validation library shared between frontend and backend
- **date-fns**: Date manipulation and formatting utilities
- **clsx & class-variance-authority**: Dynamic className utilities for component variants

## Development Tools

### GitHub Integration
- **Automated Updates**: Use `./git-update.sh` script to quickly commit and push changes to GitHub
- **Manual Updates**: Use Replit's Version Control panel (left sidebar) for visual git management
- **Backup Strategy**: All code changes are automatically synced to GitHub repository for version control

## Recent Changes - September 2025

### Email Verification System Implementation
- **Complete Email Verification Flow**: New users must verify email before login
- **Automatic Login After Verification**: Users are logged in automatically after email verification
- **Professional Verification Emails**: Welcome-themed emails with clear instructions and branding
- **Database Schema Updates**: Added `verified` field and `emailVerificationTokens` table
- **Enhanced Registration UI**: Shows verification success message instead of immediate login redirect
- **Verification Page**: Dedicated page for handling email verification links with auto-login
- **Login Protection**: Users must verify email before being allowed to log in

### Email System & Authentication Improvements
- **Professional Email Deliverability**: Set up admin@turls.us sender with SendGrid domain authentication
- **Password Reset System**: Complete email-based password reset with professional styling
- **Email Design**: Improved button visibility with white text on blue background for better UX
- **Route Handling**: Fixed frontend route conflicts with short URL system (auth, reset-password, verify-email routes)
- **DNS & DKIM**: Configured turls.us domain with proper authentication for inbox delivery
- **Email Templates**: Professional HTML emails with trust indicators and security messaging

### Current System Status
- ✅ **Email verification flow**: Complete end-to-end email verification with auto-login
- ✅ **Email deliverability**: Emails from admin@turls.us landing in inbox (not spam)
- ✅ **Password reset flow**: Complete end-to-end functionality working
- ✅ **Authentication system**: Login, register, password reset, email verification all operational
- ✅ **Short URL routing**: Fixed conflicts with frontend routes
- ✅ **Professional design**: Clean, trustworthy email templates with proper branding
- ✅ **User verification**: Only verified users can log in and access the platform
