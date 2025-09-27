import type { Express } from "express";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { insertUrlSchema, bulkUrlSchema, updateUrlSchema } from "@shared/schema";
import { z } from "zod";
import QRCode from "qrcode";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { sendPasswordResetEmail, sendEmailVerificationEmail } from "./emailService";
import { randomBytes } from "crypto";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import Stripe from "stripe";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Strong password validation schema
const strongPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: strongPasswordSchema,
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: strongPasswordSchema,
});

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function registerRoutes(app: Express): Promise<void> {
  // Configure for production deployment
  app.set('trust proxy', 1); // Trust first proxy (required for secure cookies behind Replit proxy)
  
  // Use custom email/password authentication system consistently
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-fallback-only-for-development';
  
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: isProduction, // Use secure cookies in production (HTTPS)
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isProduction ? 'lax' : 'lax', // Use lax for better cross-origin compatibility
      domain: isProduction ? undefined : undefined // Don't set domain to allow proper cookie sharing
    }
  }));

  // Custom logout route
  app.get('/api/logout', (req: any, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });

  // Demo route for development
  app.get('/api/demo-login', async (req: any, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    
    try {
      // Create a demo user
      const demoUser = await storage.upsertUser({
        id: 'demo-user-123',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
      });

      // Set session
      (req.session as any).user = {
        claims: { sub: 'demo-user-123' },
        access_token: 'demo-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      // Save session before redirect
      req.session.save((err: any) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        res.redirect('/');
      });
    } catch (error) {
      console.error('Demo login error:', error);
      res.status(500).json({ error: 'Demo login failed' });
    }
  });

  // Check email availability endpoint
  app.post('/api/check-email', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Validate email format
      const emailSchema = z.string().email();
      try {
        emailSchema.parse(email);
      } catch {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      
      res.json({ 
        available: !existingUser,
        message: existingUser ? 'Email is already registered' : 'Email is available'
      });
    } catch (error) {
      console.error("Email check error:", error);
      res.status(500).json({ error: "Failed to check email" });
    }
  });

  // Registration endpoint
  app.post('/api/register', async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ 
          error: 'This email is already registered. Please try logging in instead or use a different email address.',
          suggestion: 'login'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      // Create user (not verified yet)
      const user = await storage.createUser({
        email: validatedData.email,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        password: hashedPassword,
        profileImageUrl: null,
      });

      // Generate verification token
      const verificationToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store verification token
      await storage.createEmailVerificationToken(user.id, verificationToken, expiresAt);

      // Send verification email
      console.log(`📧 Sending verification email to ${user.email} for user ${user.firstName}`);
      const emailSent = await sendEmailVerificationEmail(
        user.email!,
        user.firstName!,
        verificationToken
      );

      if (!emailSent) {
        console.error('❌ Failed to send verification email to:', user.email);
        // Don't fail registration if email fails, just log it
      } else {
        console.log('✅ Verification email sent successfully to:', user.email);
      }

      res.status(201).json({ 
        message: 'Registration successful! Please check your email to verify your account.',
        requiresVerification: true,
        user: { 
          id: user.id, 
          email: user.email, 
          firstName: user.firstName, 
          lastName: user.lastName 
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please check your input"
        });
      } else {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  // Login endpoint with attempt tracking
  app.post('/api/login', async (req: any, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      // Get client IP address
      const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
      
      // Check login attempts first
      const attemptStatus = await storage.checkLoginAttempts(validatedData.email, ipAddress);
      if (attemptStatus.isLocked) {
        return res.status(423).json({ 
          error: "Account temporarily locked",
          details: `Too many failed login attempts. Please try again in ${attemptStatus.minutesRemaining} minutes or use "Forgot your password?" to reset your password.`,
          lockedUntil: attemptStatus.lockedUntil,
          attempts: attemptStatus.attempts,
          maxAttempts: 5
        });
      }
      
      // Find user
      const user = await storage.getUserByEmail(validatedData.email);
      
      if (!user || !user.password) {
        await storage.recordFailedLogin(validatedData.email, ipAddress);
        const newAttemptStatus = await storage.checkLoginAttempts(validatedData.email, ipAddress);
        
        return res.status(401).json({ 
          error: "Invalid credentials",
          details: "The email or password you entered is incorrect. Please check your credentials and try again.",
          attempts: newAttemptStatus.attempts,
          maxAttempts: 5,
          remainingAttempts: Math.max(0, 5 - newAttemptStatus.attempts)
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(validatedData.password, user.password);
      if (!isValidPassword) {
        await storage.recordFailedLogin(validatedData.email, ipAddress);
        const newAttemptStatus = await storage.checkLoginAttempts(validatedData.email, ipAddress);
        
        const remainingAttempts = Math.max(0, 5 - newAttemptStatus.attempts);
        let details = `The password you entered is incorrect. You have ${remainingAttempts} attempts remaining.`;
        
        if (remainingAttempts <= 1) {
          details += " After your next failed attempt, your account will be locked for 10 minutes.";
        }
        
        return res.status(401).json({ 
          error: "Invalid credentials",
          details,
          attempts: newAttemptStatus.attempts,
          maxAttempts: 5,
          remainingAttempts
        });
      }

      // Check if user is verified
      if (!user.verified) {
        return res.status(401).json({ 
          error: 'Email verification required',
          details: 'Please verify your email address before logging in. Check your email for a verification link.',
          requiresVerification: true
        });
      }

      // Login successful - clear any failed attempts
      await storage.clearLoginAttempts(validatedData.email, ipAddress);

      // Set session
      (req.session as any).user = {
        claims: { sub: user.id },
        access_token: 'user-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      // Save session
      req.session.save((err: any) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        res.json({ 
          message: 'Login successful', 
          user: { 
            id: user.id, 
            email: user.email, 
            firstName: user.firstName, 
            lastName: user.lastName 
          } 
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please check your input"
        });
      } else {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
      }
    }
  });

  // Password Reset Routes
  
  // Request password reset
  app.post('/api/forgot-password', async (req, res) => {
    try {
      const validatedData = forgotPasswordSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(validatedData.email);
      
      if (!user) {
        // Don't reveal whether email exists for security
        return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      }

      // Generate secure reset token
      const resetToken = randomBytes(32).toString('hex');
      
      // Set token expiration to 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      // Store reset token
      await storage.createPasswordResetToken(user.id, resetToken, expiresAt);
      
      // Send reset email
      const emailSent = await sendPasswordResetEmail(
        user.email!,
        user.firstName || 'User',
        resetToken
      );
      
      if (!emailSent) {
        console.error('Failed to send password reset email to:', user.email);
        return res.status(500).json({ error: 'Failed to send reset email' });
      }
      
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please enter a valid email address"
        });
      } else {
        console.error("Password reset request error:", error);
        res.status(500).json({ error: "Failed to process password reset request" });
      }
    }
  });

  // Reset password with token
  app.post('/api/reset-password', async (req, res) => {
    try {
      const validatedData = resetPasswordSchema.parse(req.body);
      
      // Verify reset token
      const tokenData = await storage.getPasswordResetToken(validatedData.token);
      
      if (!tokenData) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(validatedData.password, saltRounds);
      
      // Update user's password
      const updateSuccess = await storage.updateUserPassword(tokenData.userId, hashedPassword);
      
      if (!updateSuccess) {
        return res.status(500).json({ error: 'Failed to update password' });
      }
      
      // Get the user to check verification status
      const user = await storage.getUser(tokenData.userId);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Delete the used reset token
      await storage.deletePasswordResetToken(validatedData.token);
      
      // If user is not verified, automatically send verification email
      if (!user.verified) {
        // Generate verification token
        const verificationToken = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Store verification token
        await storage.createEmailVerificationToken(user.id, verificationToken, expiresAt);
        
        // Send verification email
        const emailSent = await sendEmailVerificationEmail(
          user.email!,
          user.firstName || 'User',
          verificationToken
        );
        
        if (emailSent) {
          return res.json({ 
            message: 'Password successfully reset! A verification email has been sent to your email address. Please verify your email to complete the process.',
            requiresVerification: true 
          });
        } else {
          console.error('Failed to send verification email to:', user.email);
          return res.json({ 
            message: 'Password successfully reset, but failed to send verification email. Please try logging in or contact support.',
            requiresVerification: true 
          });
        }
      }
      
      res.json({ message: 'Password successfully reset. You can now log in with your new password.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please check your input"
        });
      } else {
        console.error("Password reset error:", error);
        res.status(500).json({ error: "Failed to reset password" });
      }
    }
  });

  // Email Verification Routes
  
  // Handle email verification
  app.get('/api/verify-email', async (req: any, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      // Get and validate verification token
      const tokenData = await storage.getEmailVerificationToken(token);
      if (!tokenData) {
        return res.status(400).json({ 
          error: 'Invalid or expired verification token. Please request a new verification email.',
          expired: true
        });
      }

      // Get user
      const user = await storage.getUser(tokenData.userId);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Mark user as verified
      await storage.markUserAsVerified(user.id);
      
      // Delete the verification token
      await storage.deleteEmailVerificationToken(token);

      // Auto-login the user by setting session
      (req.session as any).user = {
        claims: { sub: user.id },
        access_token: 'user-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      // Save session
      req.session.save((err: any) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Verification succeeded but login failed' });
        }
        
        res.json({ 
          message: 'Email verified successfully! You are now logged in.',
          verified: true,
          user: { 
            id: user.id, 
            email: user.email, 
            firstName: user.firstName, 
            lastName: user.lastName 
          } 
        });
      });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Email verification failed' });
    }
  });

  // Resend email verification
  app.post('/api/resend-verification', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email address is required' });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether email exists for security
        return res.json({ message: 'If an account with that email exists and is unverified, a verification email has been sent.' });
      }
      
      // Check if user is already verified
      if (user.verified) {
        return res.json({ message: 'This email address is already verified. You can log in now.' });
      }
      
      // Generate new verification token
      const verificationToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Store new verification token
      await storage.createEmailVerificationToken(user.id, verificationToken, expiresAt);
      
      // Send verification email
      const emailSent = await sendEmailVerificationEmail(
        user.email!,
        user.firstName || 'User',
        verificationToken
      );
      
      if (!emailSent) {
        console.error('Failed to send verification email to:', user.email);
        return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
      }
      
      res.json({ message: 'Verification email sent successfully! Please check your email and click the verification link.' });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: 'Failed to resend verification email. Please try again later.' });
    }
  });

  // Custom authentication middleware - always use session-based auth
  const devIsAuthenticated = (req: any, res: any, next: any) => {
    // Always use session-based authentication for consistency
    if ((req.session as any)?.user) {
      req.user = (req.session as any).user;
      req.isAuthenticated = () => true;
      return next();
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  // Auth routes
  app.get('/api/auth/user', devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Shorten URL endpoint (supports both authenticated and anonymous users)
  app.post("/api/shorten", async (req, res) => {
    try {
      console.log('📝 Received URL shortening request:', JSON.stringify(req.body, null, 2));
      
      // Clean the data before validation
      const cleanedBody = {
        ...req.body,
        customCode: req.body.customCode?.trim() || undefined, // Convert empty strings to undefined
        title: req.body.title?.trim() || undefined,
        description: req.body.description?.trim() || undefined,
      };
      
      console.log('📝 Cleaned request data:', JSON.stringify(cleanedBody, null, 2));
      
      const validatedData = insertUrlSchema.parse(cleanedBody);
      console.log('✅ Validated data:', JSON.stringify(validatedData, null, 2));
      
      // Check if user is authenticated
      const sessionUser = (req.session as any)?.user;
      const userId = (sessionUser || req.user) ? (sessionUser?.claims?.sub || req.user?.claims?.sub) : undefined;

      // For authenticated users, check subscription limits
      if (userId) {
        const subscription = await storage.getUserSubscriptionStatus(userId);
        const isPremium = subscription?.subscriptionStatus === 'active' || subscription?.subscriptionStatus === 'trialing';
        
        // Count user's existing URLs
        const userUrls = await storage.getUserUrls(userId);
        const urlCount = userUrls.length;
        
        // Apply limits based on subscription
        const limit = isPremium ? 10000 : 10;
        if (urlCount >= limit) {
          return res.status(403).json({ 
            error: `URL limit reached. ${isPremium ? 'Premium' : 'Free'} users can create up to ${limit} URLs.`,
            isPremium,
            currentCount: urlCount,
            limit
          });
        }
      }
      const url = await storage.createUrl(validatedData, userId);
      
      // Use the request's actual host for the shortened URL
      const host = req.get('host') || 'localhost:5000';
      const shortUrl = `${req.protocol}://${host}/${url.shortCode}`;
      
      res.json({
        id: url.id,
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: shortUrl,
        createdAt: url.createdAt
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please check your input"
        });
      } else if (error instanceof Error && error.message.includes("already taken")) {
        res.status(409).json({ 
          error: "Custom code unavailable", 
          details: error.message
        });
      } else {
        console.error("Error shortening URL:", error);
        res.status(500).json({ error: "Failed to shorten URL" });
      }
    }
  });

  // User dashboard - get user's URLs
  app.get("/api/urls", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const urls = await storage.getUserUrls(userId);
      res.json(urls);
    } catch (error) {
      console.error("Error fetching user URLs:", error);
      res.status(500).json({ error: "Failed to fetch URLs" });
    }
  });

  // Bulk URL shortening
  app.post("/api/bulk-shorten", devIsAuthenticated, async (req: any, res) => {
    try {
      const validatedData = bulkUrlSchema.parse(req.body);
      const userId = req.user.claims.sub;
      const results = [];
      const errors = [];

      for (let i = 0; i < validatedData.urls.length; i++) {
        const urlData = validatedData.urls[i];
        try {
          const url = await storage.createUrl(urlData, userId);
          const host = req.get('host') || 'localhost:5000';
          const shortUrl = `${req.protocol}://${host}/${url.shortCode}`;
          
          results.push({
            ...url,
            shortUrl,
            index: i
          });
        } catch (error) {
          errors.push({
            index: i,
            originalUrl: urlData.originalUrl,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({ results, errors });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please check your input"
        });
      } else {
        console.error("Error bulk shortening URLs:", error);
        res.status(500).json({ error: "Failed to process bulk URLs" });
      }
    }
  });

  // Update URL (edit alias, title, description)
  app.patch("/api/urls/:id", devIsAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const validatedData = updateUrlSchema.parse(req.body);

      // Check ownership - try to get URL by ID first, then by short code
      const existingUrl = await storage.getUrlById(id);
      
      if (!existingUrl || existingUrl.userId !== userId) {
        return res.status(404).json({ error: "URL not found or access denied" });
      }

      const updatedUrl = await storage.updateUrl(id, validatedData);
      if (!updatedUrl) {
        return res.status(404).json({ error: "URL not found" });
      }

      res.json(updatedUrl);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input", 
          details: error.errors[0]?.message || "Please check your input"
        });
      } else {
        console.error("Error updating URL:", error);
        res.status(500).json({ error: "Failed to update URL" });
      }
    }
  });

  // Delete URL
  app.delete("/api/urls/:id", devIsAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      const deleted = await storage.deleteUrl(id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "URL not found or access denied" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting URL:", error);
      res.status(500).json({ error: "Failed to delete URL" });
    }
  });

  // Get URL statistics
  app.get("/api/urls/:id/stats", devIsAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      // Check ownership
      const url = Array.from((storage as any).urls.values()).find((url: any) => url.id === id);
      if (!url || url.userId !== userId) {
        return res.status(404).json({ error: "URL not found or access denied" });
      }

      const stats = await storage.getUrlStats(id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching URL stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // Get detailed analytics for a URL with charts data
  app.get("/api/urls/:id/analytics", devIsAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;

      // Check ownership
      const url = await storage.getUrlById(id);
      if (!url || url.userId !== userId) {
        return res.status(404).json({ error: "URL not found or access denied" });
      }

      const analytics = await storage.getDetailedAnalytics(id);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching detailed analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Get global analytics for all user's URLs (Premium feature)
  app.get("/api/global-analytics", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user has premium subscription
      const subscriptionStatus = await storage.getUserSubscriptionStatus(userId);
      const isPremium = subscriptionStatus && (
        subscriptionStatus.subscriptionStatus === 'active' || 
        (subscriptionStatus.subscriptionStatus === 'canceled' && 
         subscriptionStatus.subscriptionEndDate && 
         new Date() < subscriptionStatus.subscriptionEndDate)
      );

      if (!isPremium) {
        return res.status(403).json({ 
          error: "Premium subscription required",
          message: "Global analytics are available with Premium subscription only"
        });
      }
      
      const analytics = await storage.getGlobalAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching global analytics:", error);
      res.status(500).json({ error: "Failed to fetch global analytics" });
    }
  });

  // QR Code generation endpoint
  app.get("/api/qr/:shortCode", async (req, res) => {
    try {
      const { shortCode } = req.params;
      const url = await storage.getUrlByShortCode(shortCode);
      
      if (!url) {
        return res.status(404).json({ error: "Short URL not found" });
      }
      
      // Use the request's actual host for the QR code URL
      const host = req.get('host') || 'localhost:5000';
      const shortUrl = `${req.protocol}://${host}/${url.shortCode}`;
      
      // Generate QR code as PNG buffer
      const qrCodeBuffer = await QRCode.toBuffer(shortUrl, {
        type: 'png',
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      
      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="qr-${shortCode}.png"`
      });
      res.send(qrCodeBuffer);
    } catch (error) {
      console.error("Error generating QR code:", error);
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  });

  // Redirect endpoint for shortened URLs - only alphanumeric characters, no hyphens or underscores
  app.get("/:shortCode([a-zA-Z0-9]{3,12})", (req, res, next) => {
    const shortCode = req.params.shortCode.toLowerCase();
    
    // Skip if this is a frontend route
    const frontendRoutes = ['auth', 'dashboard', 'login', 'register', 'about', 'contact', 'help', 'docs', 'subscription', 'reset-password', 'verify-email'];
    if (frontendRoutes.includes(shortCode)) {
      return next();
    }
    
    handleShortCodeRedirect(req, res, next);
  });

  async function handleShortCodeRedirect(req: any, res: any, next: any) {
    try {
      const { shortCode } = req.params;
      
      const url = await storage.getUrlByShortCode(shortCode);
      
      if (!url) {
        return res.status(404).json({ error: "Short URL not found" });
      }
      
      // Enhanced analytics collection
      const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      const userAgent = req.get('User-Agent') || '';
      const referer = req.get('Referer') || '';
      
      // Geographic information from IP
      const geo = geoip.lookup(clientIp);
      const country = geo?.country || 'Unknown';
      const city = geo?.city || 'Unknown';
      
      // Device information from User Agent
      const parser = new UAParser(userAgent);
      const deviceInfo = parser.getResult();
      const deviceType = deviceInfo.device.type || 'desktop';
      const browser = `${deviceInfo.browser.name || 'Unknown'} ${deviceInfo.browser.version || ''}`.trim();
      const os = `${deviceInfo.os.name || 'Unknown'} ${deviceInfo.os.version || ''}`.trim();
      
      // Track the click with enhanced data
      await storage.recordClick({
        urlId: url.id,
        ipAddress: clientIp,
        userAgent: userAgent,
        referer: referer,
        country: country,
        city: city,
        deviceType: deviceType,
        browser: browser,
        operatingSystem: os,
      });
      
      // Permanent redirect (301) for SEO benefits
      res.redirect(301, url.originalUrl);
    } catch (error) {
      console.error("Error redirecting:", error);
      res.status(500).json({ error: "Redirect failed" });
    }
  }

  // Stripe subscription endpoints
  app.post("/api/create-subscription", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.email) {
        return res.status(400).json({ error: "User not found or email missing" });
      }

      let customerId = (user as any).stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: user.id }
        });
        customerId = customer.id;
        
        await storage.updateUserSubscription(userId, {
          stripeCustomerId: customerId
        });
      }

      // Create subscription with 7-day trial
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'TUrls Premium',
              description: 'Advanced analytics, branded links, bulk features, and more!'
            },
            recurring: { interval: 'month' },
            unit_amount: 999 // $9.99/month
          }
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      await storage.updateUserSubscription(userId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: 'trialing'
      });

      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
        status: subscription.status
      });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/create-checkout-session", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { planType } = req.body;
      
      if (!user || !user.email) {
        return res.status(400).json({ error: "User not found or email missing" });
      }

      // Get the proper origin URL for redirect
      const origin = req.headers.origin || 
        (req.get('host') ? `${req.protocol || 'http'}://${req.get('host')}` : 'http://localhost:5000');
      
      // Configure pricing based on plan type
      const isYearly = planType === 'yearly';
      const priceData = {
        currency: 'usd',
        product_data: {
          name: 'TUrls Premium',
          description: 'Advanced analytics, branded links, bulk features, and higher limits!'
        },
        recurring: { interval: isYearly ? 'year' : 'month' },
        unit_amount: isYearly ? 4999 : 599 // $49.99/year or $5.99/month
      };

      const session = await stripe.checkout.sessions.create({
        customer_email: user.email,
        payment_method_types: ['card'],
        line_items: [{
          price_data: priceData,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${origin}/dashboard?subscription=success`,
        cancel_url: `${origin}/dashboard?subscription=cancelled`,
        subscription_data: {
          metadata: { 
            userId: user.id,
            planType: planType || 'monthly'
          }
        }
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/subscription-status", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const subscription = await storage.getUserSubscriptionStatus(userId);
      
      const currentDate = new Date();
      const endDate = subscription?.subscriptionEndDate ? new Date(subscription.subscriptionEndDate) : null;
      
      // User is premium if they have active/trialing status, or canceled but not expired yet
      const isPremium = subscription?.subscriptionStatus === 'active' || 
                       subscription?.subscriptionStatus === 'trialing' ||
                       (subscription?.subscriptionStatus === 'canceled' && endDate && endDate > currentDate);
      
      res.json({
        subscriptionStatus: subscription?.subscriptionStatus || 'free',
        subscriptionEndDate: subscription?.subscriptionEndDate,
        isPremium
      });
    } catch (error: any) {
      console.error("Error getting subscription status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cancel-subscription", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !(user as any).stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      const subscriptionId = (user as any).stripeSubscriptionId;
      
      // Handle test subscription IDs (for demo/testing purposes)
      if (subscriptionId.startsWith('sub_test') || subscriptionId.startsWith('sub_premium')) {
        console.log('Canceling test subscription:', subscriptionId);
        await storage.updateUserSubscription(userId, {
          subscriptionStatus: 'canceled',
          subscriptionEndDate: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)) // 7 days from now
        });
        res.json({ message: "Test subscription canceled successfully. You'll keep premium features for 7 more days." });
        return;
      }

      // Handle real Stripe subscriptions
      try {
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });

        await storage.updateUserSubscription(userId, {
          subscriptionStatus: 'canceled'
        });

        res.json({ message: "Subscription will be canceled at the end of the billing period" });
      } catch (stripeError: any) {
        if (stripeError.code === 'resource_missing') {
          // Subscription not found in Stripe, update local status
          await storage.updateUserSubscription(userId, {
            subscriptionStatus: 'canceled'
          });
          res.json({ message: "Subscription status updated successfully" });
        } else {
          throw stripeError;
        }
      }
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe webhook handler moved to index.ts to handle raw body data properly

  // Manual subscription fix endpoint (temporary)
  app.post("/api/manual-subscription-fix", async (req, res) => {
    try {
      const { userId, subscriptionId, status } = req.body;
      
      if (!userId || !subscriptionId || !status) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Set correct trial end date based on status
      let subscriptionEndDate;
      if (status === 'trialing') {
        subscriptionEndDate = new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)); // 3 days for trial
      } else {
        subscriptionEndDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days for active
      }

      const result = await storage.updateUserSubscription(userId, {
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: status,
        subscriptionEndDate: subscriptionEndDate
      });
      
      console.log('🔧 Manual subscription fix applied:', userId, 'status:', status);
      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Manual subscription fix error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk QR code export endpoint (Premium feature)
  app.post("/api/bulk-qr-export", devIsAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user has premium subscription
      const subscription = await storage.getUserSubscriptionStatus(userId);
      const isPremium = subscription?.subscriptionStatus === 'active' || 
                       subscription?.subscriptionStatus === 'trialing' ||
                       (subscription?.subscriptionStatus === 'canceled' && 
                        subscription?.subscriptionEndDate && 
                        new Date(subscription.subscriptionEndDate) > new Date());
      
      if (!isPremium) {
        return res.status(403).json({ 
          error: "Premium subscription required for bulk QR code export" 
        });
      }

      // Get all user's URLs
      const userUrls = await storage.getUserUrls(userId);
      
      if (userUrls.length === 0) {
        return res.status(400).json({ error: "No URLs found to export" });
      }

      const qrCodes = [];
      
      // Generate QR codes for all URLs
      for (const url of userUrls) {
        try {
          const host = req.get('host') || 'localhost:5000';
          const shortUrl = `${req.protocol}://${host}/${url.shortCode}`;
          
          const qrCodeDataUrl = await QRCode.toDataURL(shortUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            width: 200
          });

          qrCodes.push({
            id: url.id,
            shortCode: url.shortCode,
            originalUrl: url.originalUrl,
            title: url.title || '',
            qrCodeDataUrl,
            createdAt: url.createdAt
          });
        } catch (qrError) {
          console.error(`Error generating QR code for ${url.shortCode}:`, qrError);
        }
      }

      res.json({
        qrCodes,
        totalCount: qrCodes.length,
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error generating bulk QR codes:", error);
      res.status(500).json({ error: "Failed to generate QR codes" });
    }
  });

  // Routes registered on the existing app
}
