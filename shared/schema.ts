import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Email verification tokens table
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Login attempts tracking table
export const loginAttempts = pgTable("login_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  ipAddress: varchar("ip_address").notNull(),
  attempts: integer("attempts").default(1).notNull(),
  lockedUntil: timestamp("locked_until"),
  lastAttempt: timestamp("last_attempt").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  password: varchar("password"), // For traditional authentication
  verified: boolean("verified").default(false).notNull(), // Email verification status
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: varchar("subscription_status").default("free"), // free, active, canceled, past_due
  subscriptionEndDate: timestamp("subscription_end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const urls = pgTable("urls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalUrl: text("original_url").notNull(),
  shortCode: varchar("short_code", { length: 20 }).notNull().unique(),
  userId: varchar("user_id").references(() => users.id), // Optional - allows anonymous URLs
  title: varchar("title"), // Custom title for URL
  description: text("description"), // Optional description
  clicks: integer("clicks").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Click tracking for statistics
export const urlClicks = pgTable("url_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  urlId: varchar("url_id").references(() => urls.id).notNull(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  country: varchar("country"),
  city: varchar("city"),
  deviceType: varchar("device_type"), // mobile, tablet, desktop
  browser: varchar("browser"), // Chrome 91.0, Firefox 89.0, etc.
  operatingSystem: varchar("operating_system"), // Windows 10, macOS 11.4, etc.
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
});

export const insertUrlSchema = createInsertSchema(urls).pick({
  originalUrl: true,
}).extend({
  originalUrl: z.string().url("Please enter a valid URL"),
  customCode: z.string()
    .transform(val => val.trim() || undefined) // Convert empty strings to undefined
    .optional()
    .refine(val => !val || val.length >= 3, "Custom code must be at least 3 characters")
    .refine(val => !val || val.length <= 20, "Custom code must be less than 20 characters")
    .refine(val => !val || /^[a-zA-Z0-9-_]+$/.test(val), "Custom code can only contain letters, numbers, hyphens, and underscores"),
  title: z.string().transform(val => val.trim() || undefined).optional(),
  description: z.string().transform(val => val.trim() || undefined).optional(),
});

export type InsertUrl = z.infer<typeof insertUrlSchema>;
export type Url = typeof urls.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  urls: many(urls),
}));

export const urlsRelations = relations(urls, ({ one, many }) => ({
  user: one(users, {
    fields: [urls.userId],
    references: [users.id],
  }),
  clicks: many(urlClicks),
}));

export const urlClicksRelations = relations(urlClicks, ({ one }) => ({
  url: one(urls, {
    fields: [urlClicks.urlId],
    references: [urls.id],
  }),
}));

// Replit Auth user upsert schema
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Bulk URL shortening schema
export const bulkUrlSchema = z.object({
  urls: z.array(z.object({
    originalUrl: z.string().url("Please enter a valid URL"),
    customCode: z.string()
      .transform(val => val.trim() || undefined)
      .optional()
      .refine(val => !val || val.length >= 3, "Custom code must be at least 3 characters")
      .refine(val => !val || val.length <= 20, "Custom code must be less than 20 characters")
      .refine(val => !val || /^[a-zA-Z0-9-_]+$/.test(val), "Custom code can only contain letters, numbers, hyphens, and underscores"),
    title: z.string().transform(val => val.trim() || undefined).optional(),
    description: z.string().transform(val => val.trim() || undefined).optional(),
  })).min(1, "At least one URL is required").max(100, "Maximum 100 URLs at once")
});

// URL update schema
export const updateUrlSchema = z.object({
  title: z.string().transform(val => val.trim() || undefined).optional(),
  description: z.string().transform(val => val.trim() || undefined).optional(),
  customCode: z.string()
    .transform(val => val.trim() || undefined)
    .optional()
    .refine(val => !val || val.length >= 3, "Custom code must be at least 3 characters")
    .refine(val => !val || val.length <= 20, "Custom code must be less than 20 characters")
    .refine(val => !val || /^[a-zA-Z0-9-_]+$/.test(val), "Custom code can only contain letters, numbers, hyphens, and underscores"),
});

export type BulkUrl = z.infer<typeof bulkUrlSchema>;
export type UpdateUrl = z.infer<typeof updateUrlSchema>;
export type UrlClick = typeof urlClicks.$inferSelect;
export type InsertUrlClick = typeof urlClicks.$inferInsert;
