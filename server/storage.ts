import { type User, type UpsertUser, type Url, type InsertUrl, type UrlClick, type InsertUrlClick } from "@shared/schema";
import { users, urls, urlClicks, passwordResetTokens, emailVerificationTokens, loginAttempts } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Traditional authentication operations
  getUserByEmail(email: string): Promise<(User & { password?: string }) | undefined>;
  createUser(userData: { email: string; firstName: string; lastName: string; password: string; profileImageUrl: string | null }): Promise<User & { password: string }>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<boolean>;
  
  // Subscription operations
  updateUserSubscription(userId: string, subscriptionData: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionEndDate?: Date;
  }): Promise<User | undefined>;
  getUserSubscriptionStatus(userId: string): Promise<{ subscriptionStatus: string; subscriptionEndDate?: Date } | undefined>;
  
  // Password reset operations
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  
  // Email verification operations
  createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getEmailVerificationToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined>;
  deleteEmailVerificationToken(token: string): Promise<void>;
  markUserAsVerified(userId: string): Promise<boolean>;
  
  // Login attempt tracking operations
  recordFailedLogin(email: string, ipAddress: string): Promise<void>;
  checkLoginAttempts(email: string, ipAddress: string): Promise<{ 
    attempts: number; 
    lockedUntil?: Date; 
    isLocked: boolean;
    minutesRemaining?: number;
  }>;
  clearLoginAttempts(email: string, ipAddress: string): Promise<void>;
  
  // URL operations
  getUrlByShortCode(shortCode: string): Promise<Url | undefined>;
  getUrlById(id: string): Promise<Url | undefined>;
  createUrl(url: InsertUrl, userId?: string): Promise<Url>;
  getAllUrls(): Promise<Url[]>;
  getUserUrls(userId: string): Promise<Url[]>;
  updateUrl(id: string, updates: Partial<Url>): Promise<Url | undefined>;
  deleteUrl(id: string, userId?: string): Promise<boolean>;
  
  // Click tracking
  recordClick(click: InsertUrlClick): Promise<void>;
  getUrlStats(urlId: string): Promise<{ totalClicks: number; recentClicks: UrlClick[] }>;
  getDetailedAnalytics(urlId: string): Promise<{
    totalClicks: number;
    clicksByDay: { date: string; clicks: number }[];
    clicksByCountry: { country: string; clicks: number }[];
    clicksByDevice: { device: string; clicks: number }[];
    clicksByReferrer: { referrer: string; clicks: number }[];
    recentClicks: UrlClick[];
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User & { password?: string; verified?: boolean }>;
  private urls: Map<string, Url>;
  private shortCodes: Set<string>;
  private clicks: Map<string, UrlClick>;
  private passwordResetTokens: Map<string, { userId: string; expiresAt: Date }>;
  private emailVerificationTokens: Map<string, { userId: string; expiresAt: Date }>;
  private loginAttempts: Map<string, { attempts: number; lockedUntil?: Date; lastAttempt: Date }>;

  constructor() {
    this.users = new Map();
    this.urls = new Map();
    this.shortCodes = new Set();
    this.clicks = new Map();
    this.passwordResetTokens = new Map();
    this.emailVerificationTokens = new Map();
    this.loginAttempts = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    // Remove password from returned user
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  async getUserByEmail(email: string): Promise<(User & { password?: string }) | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(userData: { email: string; firstName: string; lastName: string; password: string; profileImageUrl: string | null }): Promise<User & { password: string }> {
    const id = randomUUID();
    const user: User & { password: string } = {
      id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      profileImageUrl: userData.profileImageUrl,
      password: userData.password,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.users.set(id, user);
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existing = this.users.get(userData.id!);
    if (existing) {
      const updated: User & { password?: string } = {
        ...existing,
        ...userData,
        password: existing.password || undefined,
        updatedAt: new Date(),
      };
      this.users.set(userData.id!, updated);
      return updated;
    } else {
      const user: User & { password?: string } = {
        id: userData.id || randomUUID(),
        email: userData.email || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.set(user.id, user);
      return user;
    }
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    
    user.password = hashedPassword;
    user.updatedAt = new Date();
    this.users.set(userId, user);
    return true;
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    this.passwordResetTokens.set(token, { userId, expiresAt });
  }

  async getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const tokenData = this.passwordResetTokens.get(token);
    if (!tokenData) return undefined;
    
    // Check if token has expired
    if (new Date() > tokenData.expiresAt) {
      this.passwordResetTokens.delete(token);
      return undefined;
    }
    
    return tokenData;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    this.passwordResetTokens.delete(token);
  }

  async createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    this.emailVerificationTokens.set(token, { userId, expiresAt });
  }

  async getEmailVerificationToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const tokenData = this.emailVerificationTokens.get(token);
    if (!tokenData) return undefined;
    
    // Check if token has expired
    if (new Date() > tokenData.expiresAt) {
      this.emailVerificationTokens.delete(token);
      return undefined;
    }
    
    return tokenData;
  }

  async deleteEmailVerificationToken(token: string): Promise<void> {
    this.emailVerificationTokens.delete(token);
  }

  async markUserAsVerified(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    
    user.verified = true;
    user.updatedAt = new Date();
    this.users.set(userId, user);
    return true;
  }

  async getUserUrls(userId: string): Promise<Url[]> {
    return Array.from(this.urls.values()).filter(
      (url) => url.userId === userId
    );
  }

  async updateUrl(id: string, updates: Partial<Url>): Promise<Url | undefined> {
    const existing = this.urls.get(id);
    if (!existing) return undefined;
    
    const updated: Url = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.urls.set(id, updated);
    return updated;
  }

  async deleteUrl(id: string, userId?: string): Promise<boolean> {
    const url = this.urls.get(id);
    if (!url) return false;
    
    // If userId provided, ensure ownership
    if (userId && url.userId !== userId) return false;
    
    this.urls.delete(id);
    this.shortCodes.delete(url.shortCode.toLowerCase());
    return true;
  }

  async getUrlByShortCode(shortCode: string): Promise<Url | undefined> {
    return Array.from(this.urls.values()).find(
      (url) => url.shortCode === shortCode
    );
  }

  async getUrlById(id: string): Promise<Url | undefined> {
    return this.urls.get(id);
  }

  async createUrl(insertUrl: InsertUrl, userId?: string): Promise<Url> {
    const id = randomUUID();
    let shortCode: string;
    
    // Use custom code if provided, otherwise generate random code
    if (insertUrl.customCode) {
      // Check if custom code already exists
      if (this.shortCodes.has(insertUrl.customCode.toLowerCase())) {
        throw new Error(`Custom code "${insertUrl.customCode}" is already taken. Please choose another.`);
      }
      shortCode = insertUrl.customCode;
    } else {
      // Generate unique random short code
      do {
        shortCode = this.generateShortCode();
      } while (this.shortCodes.has(shortCode));
    }
    
    this.shortCodes.add(shortCode.toLowerCase());
    
    const url: Url = {
      originalUrl: insertUrl.originalUrl,
      id,
      shortCode,
      userId: userId || null,
      title: insertUrl.title || null,
      description: insertUrl.description || null,
      clicks: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.urls.set(id, url);
    return url;
  }

  async getAllUrls(): Promise<Url[]> {
    return Array.from(this.urls.values());
  }

  async recordClick(click: InsertUrlClick): Promise<void> {
    const id = randomUUID();
    const urlClick: UrlClick = {
      id,
      urlId: click.urlId,
      ipAddress: click.ipAddress || null,
      userAgent: click.userAgent || null,
      referer: click.referer || null,
      country: click.country || null,
      city: click.city || null,
      clickedAt: new Date(),
    };
    this.clicks.set(id, urlClick);
    
    // Update URL click count
    const url = this.urls.get(click.urlId);
    if (url) {
      url.clicks = (url.clicks || 0) + 1;
      this.urls.set(url.id, url);
    }
  }

  async getUrlStats(urlId: string): Promise<{ totalClicks: number; recentClicks: UrlClick[] }> {
    const url = this.urls.get(urlId);
    const totalClicks = url?.clicks || 0;
    
    const recentClicks = Array.from(this.clicks.values())
      .filter(click => click.urlId === urlId)
      .sort((a, b) => new Date(b.clickedAt).getTime() - new Date(a.clickedAt).getTime())
      .slice(0, 50); // Last 50 clicks
    
    return { totalClicks, recentClicks };
  }

  // Login attempt tracking methods
  async recordFailedLogin(email: string, ipAddress: string): Promise<void> {
    const key = `${email}:${ipAddress}`;
    const existing = this.loginAttempts.get(key);
    
    if (existing) {
      const now = new Date();
      let attempts = existing.attempts + 1;
      let lockedUntil: Date | undefined;
      
      // Lock for 10 minutes if 5 or more attempts
      if (attempts >= 5) {
        lockedUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
      }
      
      this.loginAttempts.set(key, {
        attempts,
        lockedUntil,
        lastAttempt: now
      });
    } else {
      this.loginAttempts.set(key, {
        attempts: 1,
        lastAttempt: new Date()
      });
    }
  }

  async checkLoginAttempts(email: string, ipAddress: string): Promise<{
    attempts: number;
    lockedUntil?: Date;
    isLocked: boolean;
    minutesRemaining?: number;
  }> {
    const key = `${email}:${ipAddress}`;
    const attempt = this.loginAttempts.get(key);
    
    if (!attempt) {
      return { attempts: 0, isLocked: false };
    }
    
    const now = new Date();
    
    // Check if lockout has expired
    if (attempt.lockedUntil && now > attempt.lockedUntil) {
      this.loginAttempts.delete(key);
      return { attempts: 0, isLocked: false };
    }
    
    // Calculate remaining minutes if locked
    let minutesRemaining: number | undefined;
    if (attempt.lockedUntil && now <= attempt.lockedUntil) {
      minutesRemaining = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / (60 * 1000));
    }
    
    return {
      attempts: attempt.attempts,
      lockedUntil: attempt.lockedUntil,
      isLocked: !!attempt.lockedUntil && now <= attempt.lockedUntil,
      minutesRemaining
    };
  }

  async clearLoginAttempts(email: string, ipAddress: string): Promise<void> {
    const key = `${email}:${ipAddress}`;
    this.loginAttempts.delete(key);
  }

  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;
    // Remove password from returned user
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  async getUserByEmail(email: string): Promise<(User & { password?: string }) | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user as (User & { password?: string }) || undefined;
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<boolean> {
    try {
      await db
        .update(users)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return true;
    } catch (error) {
      console.error('Error updating password:', error);
      return false;
    }
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({
      userId,
      token,
      expiresAt,
    });
  }

  async getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    
    if (!resetToken) return undefined;
    
    // Check if token has expired
    if (new Date() > resetToken.expiresAt) {
      await this.deletePasswordResetToken(token);
      return undefined;
    }
    
    return {
      userId: resetToken.userId,
      expiresAt: resetToken.expiresAt,
    };
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }

  async createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(emailVerificationTokens).values({
      userId,
      token,
      expiresAt,
    });
  }

  async getEmailVerificationToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const [verificationToken] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token));
    
    if (!verificationToken) return undefined;
    
    // Check if token has expired
    if (new Date() > verificationToken.expiresAt) {
      await this.deleteEmailVerificationToken(token);
      return undefined;
    }
    
    return {
      userId: verificationToken.userId,
      expiresAt: verificationToken.expiresAt,
    };
  }

  async deleteEmailVerificationToken(token: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
  }

  async markUserAsVerified(userId: string): Promise<boolean> {
    try {
      await db
        .update(users)
        .set({ verified: true, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return true;
    } catch (error) {
      console.error('Error marking user as verified:', error);
      return false;
    }
  }

  async updateUserSubscription(userId: string, subscriptionData: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionEndDate?: Date;
  }): Promise<User | undefined> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set({ 
          ...subscriptionData,
          updatedAt: new Date() 
        })
        .where(eq(users.id, userId))
        .returning();
      
      if (!updatedUser) return undefined;
      // Remove password from returned user
      const { password, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword as User;
    } catch (error) {
      console.error('Error updating user subscription:', error);
      return undefined;
    }
  }

  async getUserSubscriptionStatus(userId: string): Promise<{ subscriptionStatus: string; subscriptionEndDate?: Date } | undefined> {
    try {
      const [user] = await db
        .select({ 
          subscriptionStatus: users.subscriptionStatus,
          subscriptionEndDate: users.subscriptionEndDate 
        })
        .from(users)
        .where(eq(users.id, userId));
      
      return user || undefined;
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return undefined;
    }
  }

  async createUser(userData: { email: string; firstName: string; lastName: string; password: string; profileImageUrl: string | null }): Promise<User & { password: string }> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        password: userData.password,
      })
      .returning();
    return user as User & { password: string };
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // URL operations
  async getUrlByShortCode(shortCode: string): Promise<Url | undefined> {
    const [url] = await db.select().from(urls).where(eq(urls.shortCode, shortCode));
    return url || undefined;
  }

  async getUrlById(id: string): Promise<Url | undefined> {
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    return url || undefined;
  }

  async createUrl(urlData: InsertUrl, userId?: string): Promise<Url> {
    const shortCode = urlData.customCode || this.generateShortCode();
    
    const [url] = await db
      .insert(urls)
      .values({
        originalUrl: urlData.originalUrl,
        shortCode,
        userId,
        title: urlData.title,
        description: urlData.description,
      })
      .returning();
    
    return url;
  }

  async getUserUrls(userId: string): Promise<Url[]> {
    return await db
      .select()
      .from(urls)
      .where(eq(urls.userId, userId))
      .orderBy(desc(urls.createdAt));
  }

  async getAllUrls(): Promise<Url[]> {
    return await db
      .select()
      .from(urls)
      .orderBy(desc(urls.createdAt));
  }

  async updateUrl(urlId: string, updates: { title?: string; description?: string; customCode?: string }): Promise<Url | undefined> {
    if (updates.customCode) {
      // Check if custom code is already taken
      const existing = await this.getUrlByShortCode(updates.customCode);
      if (existing && existing.id !== urlId) {
        throw new Error("Custom code already taken");
      }
    }

    const [updatedUrl] = await db
      .update(urls)
      .set({ 
        ...updates, 
        shortCode: updates.customCode || undefined,
        updatedAt: new Date() 
      })
      .where(eq(urls.id, urlId))
      .returning();

    return updatedUrl || undefined;
  }

  async deleteUrl(urlId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(urls)
      .where(and(eq(urls.id, urlId), eq(urls.userId, userId)))
      .returning();
    
    return result.length > 0;
  }

  async recordClick(click: InsertUrlClick): Promise<void> {
    await db.insert(urlClicks).values(click);
    
    // Increment click count
    await db
      .update(urls)
      .set({ 
        clicks: sql`${urls.clicks} + 1`,
        updatedAt: new Date()
      })
      .where(eq(urls.id, click.urlId));
  }

  async getUrlStats(urlId: string): Promise<{ totalClicks: number; recentClicks: UrlClick[] }> {
    const [url] = await db.select({ clicks: urls.clicks }).from(urls).where(eq(urls.id, urlId));
    const recentClicks = await db
      .select()
      .from(urlClicks)
      .where(eq(urlClicks.urlId, urlId))
      .orderBy(desc(urlClicks.clickedAt))
      .limit(10);

    return {
      totalClicks: url?.clicks || 0,
      recentClicks: recentClicks || []
    };
  }

  async getGlobalAnalytics(userId: string): Promise<any> {
    // Get all user's URLs first
    const userUrls = await db
      .select()
      .from(urls)
      .where(eq(urls.userId, userId));
    
    if (userUrls.length === 0) {
      return {
        totalClicks: 0,
        clicksByDay: [],
        clicksByCountry: [],
        clicksByDevice: [],
        clicksByReferrer: [],
        topUrls: [],
        recentClicks: []
      };
    }

    const urlIds = userUrls.map(url => url.id);

    // Get all clicks for user's URLs
    const allClicks = await db
      .select()
      .from(urlClicks)
      .where(inArray(urlClicks.urlId, urlIds))
      .orderBy(desc(urlClicks.clickedAt));

    // Calculate total clicks
    const totalClicks = allClicks.length;

    // Group clicks by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const clicksByDay = allClicks
      .filter(click => {
        const clickDate = new Date(click.clickedAt);
        return clickDate >= thirtyDaysAgo;
      })
      .reduce((acc, click) => {
        const date = click.clickedAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const clicksByDayArray = Object.entries(clicksByDay)
      .map(([date, clicks]) => ({ date, clicks }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group clicks by country
    const clicksByCountry = allClicks
      .reduce((acc, click) => {
        const country = click.country || 'Unknown';
        acc[country] = (acc[country] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const clicksByCountryArray = Object.entries(clicksByCountry)
      .map(([country, clicks]) => ({ country, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Group clicks by device
    const clicksByDevice = allClicks
      .reduce((acc, click) => {
        const device = click.deviceType || 'desktop';
        acc[device] = (acc[device] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const clicksByDeviceArray = Object.entries(clicksByDevice)
      .map(([device, clicks]) => ({ device, clicks }));

    // Group clicks by referrer
    const clicksByReferrer = allClicks
      .reduce((acc, click) => {
        let referrer = click.referer || 'Direct';
        // Clean up referrer URL for better grouping
        try {
          if (referrer !== 'Direct' && referrer.startsWith('http')) {
            referrer = new URL(referrer).hostname;
          }
        } catch {
          // Keep original referrer if URL parsing fails
        }
        acc[referrer] = (acc[referrer] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const clicksByReferrerArray = Object.entries(clicksByReferrer)
      .map(([referrer, clicks]) => ({ referrer, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Top performing URLs
    const urlClicksMap = allClicks.reduce((acc, click) => {
      acc[click.urlId] = (acc[click.urlId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topUrls = userUrls
      .map(url => ({
        id: url.id,
        shortCode: url.shortCode,
        originalUrl: url.originalUrl,
        title: url.title || '',
        clicks: urlClicksMap[url.id] || 0
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Recent clicks (last 50)
    const recentClicks = allClicks.slice(0, 50).map(click => {
      const url = userUrls.find(u => u.id === click.urlId);
      return {
        ...click,
        shortCode: url?.shortCode || '',
        originalUrl: url?.originalUrl || ''
      };
    });

    return {
      totalClicks,
      clicksByDay: clicksByDayArray,
      clicksByCountry: clicksByCountryArray,
      clicksByDevice: clicksByDeviceArray,
      clicksByReferrer: clicksByReferrerArray,
      topUrls,
      recentClicks
    };
  }

  async getDetailedAnalytics(urlId: string): Promise<{
    totalClicks: number;
    clicksByDay: { date: string; clicks: number }[];
    clicksByCountry: { country: string; clicks: number }[];
    clicksByDevice: { device: string; clicks: number }[];
    clicksByReferrer: { referrer: string; clicks: number }[];
    recentClicks: UrlClick[];
  }> {
    // Get total clicks
    const [url] = await db.select({ clicks: urls.clicks }).from(urls).where(eq(urls.id, urlId));
    const totalClicks = url?.clicks || 0;

    // Get all clicks for this URL
    const allClicks = await db
      .select()
      .from(urlClicks)
      .where(eq(urlClicks.urlId, urlId))
      .orderBy(desc(urlClicks.clickedAt));

    // Get recent clicks (last 50)
    const recentClicks = allClicks.slice(0, 50);

    // Group clicks by day (last 30 days)
    const clicksByDay = allClicks
      .filter(click => {
        const clickDate = new Date(click.clickedAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return clickDate >= thirtyDaysAgo;
      })
      .reduce((acc, click) => {
        const date = click.clickedAt.toISOString().split('T')[0]; // YYYY-MM-DD
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const clicksByDayArray = Object.entries(clicksByDay)
      .map(([date, clicks]) => ({ date, clicks }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group clicks by country
    const clicksByCountry = allClicks
      .reduce((acc, click) => {
        const country = click.country || 'Unknown';
        acc[country] = (acc[country] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const clicksByCountryArray = Object.entries(clicksByCountry)
      .map(([country, clicks]) => ({ country, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10); // Top 10 countries

    // Group clicks by device type
    const clicksByDevice = allClicks
      .reduce((acc, click) => {
        const device = click.deviceType || 'desktop';
        acc[device] = (acc[device] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const clicksByDeviceArray = Object.entries(clicksByDevice)
      .map(([device, clicks]) => ({ device, clicks }))
      .sort((a, b) => b.clicks - a.clicks);

    // Group clicks by referrer
    const clicksByReferrer = allClicks
      .reduce((acc, click) => {
        let referrer = click.referer || 'Direct';
        if (referrer !== 'Direct' && referrer) {
          try {
            const url = new URL(referrer);
            referrer = url.hostname;
          } catch {
            referrer = 'Unknown';
          }
        }
        acc[referrer] = (acc[referrer] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const clicksByReferrerArray = Object.entries(clicksByReferrer)
      .map(([referrer, clicks]) => ({ referrer, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10); // Top 10 referrers

    return {
      totalClicks,
      clicksByDay: clicksByDayArray,
      clicksByCountry: clicksByCountryArray,
      clicksByDevice: clicksByDeviceArray,
      clicksByReferrer: clicksByReferrerArray,
      recentClicks
    };
  }

  // Login attempt tracking methods for DatabaseStorage
  async recordFailedLogin(email: string, ipAddress: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.ipAddress, ipAddress)
      ));

    const now = new Date();
    
    if (existing) {
      let attempts = existing.attempts + 1;
      let lockedUntil: Date | undefined;
      
      // Lock for 10 minutes if 5 or more attempts
      if (attempts >= 5) {
        lockedUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
      }
      
      await db
        .update(loginAttempts)
        .set({
          attempts,
          lockedUntil,
          lastAttempt: now
        })
        .where(eq(loginAttempts.id, existing.id));
    } else {
      await db.insert(loginAttempts).values({
        email,
        ipAddress,
        attempts: 1,
        lastAttempt: now
      });
    }
  }

  async checkLoginAttempts(email: string, ipAddress: string): Promise<{
    attempts: number;
    lockedUntil?: Date;
    isLocked: boolean;
    minutesRemaining?: number;
  }> {
    const [attempt] = await db
      .select()
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.ipAddress, ipAddress)
      ));
    
    if (!attempt) {
      return { attempts: 0, isLocked: false };
    }
    
    const now = new Date();
    
    // Check if lockout has expired
    if (attempt.lockedUntil && now > attempt.lockedUntil) {
      await db
        .delete(loginAttempts)
        .where(eq(loginAttempts.id, attempt.id));
      return { attempts: 0, isLocked: false };
    }
    
    // Calculate remaining minutes if locked
    let minutesRemaining: number | undefined;
    if (attempt.lockedUntil && now <= attempt.lockedUntil) {
      minutesRemaining = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / (60 * 1000));
    }
    
    return {
      attempts: attempt.attempts,
      lockedUntil: attempt.lockedUntil || undefined,
      isLocked: !!attempt.lockedUntil && now <= attempt.lockedUntil,
      minutesRemaining
    };
  }

  async clearLoginAttempts(email: string, ipAddress: string): Promise<void> {
    await db
      .delete(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.ipAddress, ipAddress)
      ));
  }

  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export const storage = new DatabaseStorage();
