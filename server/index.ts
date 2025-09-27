import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Stripe webhook handler MUST be registered before JSON parsing middleware
app.post("/api/stripe-webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Import stripe and storage here to access them
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
    const { storage } = await import('./storage');
    
    event = stripe.webhooks.constructEvent(req.body, sig as string, process.env.STRIPE_WEBHOOK_SECRET || '');
    console.log('🎯 Webhook received:', event.type);
  } catch (err: any) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const { storage } = await import('./storage');
    
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        console.log('🔄 Subscription event:', event.type, 'for user:', userId, 'status:', subscription.status, 'cancel_at_period_end:', subscription.cancel_at_period_end);
        
        if (userId) {
          // If subscription is set to cancel at period end, preserve our "canceled" status
          // even if Stripe still shows it as "active" until the period ends
          const localStatus = subscription.cancel_at_period_end ? 'canceled' : subscription.status;
          
          const result = await storage.updateUserSubscription(userId, {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: localStatus,
            subscriptionEndDate: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null
          });
          console.log('✅ Updated user subscription:', userId, 'status:', result?.subscriptionStatus, 'subId:', subscription.id, 'cancel_at_period_end:', subscription.cancel_at_period_end);
        } else {
          console.log('❌ No userId found in subscription metadata');
        }
        break;

      case 'customer.subscription.deleted':
        const deletedSub = event.data.object;
        const deletedUserId = deletedSub.metadata?.userId;
        
        if (deletedUserId) {
          await storage.updateUserSubscription(deletedUserId, {
            subscriptionStatus: 'canceled',
            subscriptionEndDate: new Date()
          });
        }
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        if (invoice.subscription) {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
          const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const invoiceUserId = sub.metadata?.userId;
          
          if (invoiceUserId) {
            const result = await storage.updateUserSubscription(invoiceUserId, {
              stripeSubscriptionId: sub.id,
              subscriptionStatus: 'active',
              subscriptionEndDate: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
            });
            console.log('✅ Payment succeeded for user:', invoiceUserId, 'status:', result?.subscriptionStatus);
          }
        }
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        if (failedInvoice.subscription) {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
          const failedSub = await stripe.subscriptions.retrieve(failedInvoice.subscription as string);
          const failedUserId = failedSub.metadata?.userId;
          
          if (failedUserId) {
            await storage.updateUserSubscription(failedUserId, {
              subscriptionStatus: 'past_due'
            });
          }
        }
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
  } catch (error: any) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await (async () => {
    const { createServer } = await import("http");
    return createServer(app);
  })();

  // Register API routes FIRST, before Vite middleware
  await registerRoutes(app);

  // Then setup Vite middleware for everything else
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
