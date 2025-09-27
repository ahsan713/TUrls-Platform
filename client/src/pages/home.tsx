import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUrlSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Link, Zap, Infinity, UserX, Check, ExternalLink, QrCode, Download, LogIn, User as UserIcon, Crown, BarChart3, Shield, Smartphone, FileText, Globe, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveAdBanner } from "@/components/AdSenseBanner";
import SEO from "@/components/SEO";

interface ShortenResponse {
  id: string;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  createdAt: string;
}

export default function Home() {
  const [shortenedResult, setShortenedResult] = useState<ShortenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();

  // QR Code dialog state  
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [currentShortCode, setCurrentShortCode] = useState<string>("");

  const form = useForm({
    resolver: zodResolver(insertUrlSchema),
    defaultValues: {
      originalUrl: "",
      customCode: "",
    },
  });

  const shortenMutation = useMutation({
    mutationFn: async (data: { originalUrl: string; customCode?: string }) => {
      try {
        const response = await apiRequest("/api/shorten", "POST", data);
        const contentType = response.headers.get("content-type");
        
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text();
          throw new Error(`Server returned ${response.status}: Expected JSON but got ${contentType || 'unknown content type'}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error("API request failed:", error);
        throw error;
      }
    },
    onSuccess: (data: ShortenResponse) => {
      setShortenedResult(data);
      toast({
        title: "URL shortened successfully!",
        description: "Your shortened URL is ready to use.",
      });
    },
    onError: (error: any) => {
      console.error("Shorten URL error:", error);
      const errorMessage = error.message || "Failed to shorten URL";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: { originalUrl: string; customCode?: string }) => {
    // Only send customCode if it's not empty
    const submitData = {
      originalUrl: data.originalUrl,
      ...(data.customCode?.trim() && { customCode: data.customCode.trim() })
    };
    shortenMutation.mutate(submitData);
  };

  const handleCopy = async () => {
    if (!shortenedResult) return;
    
    try {
      await navigator.clipboard.writeText(shortenedResult.shortUrl);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "URL copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Please copy the URL manually",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setShortenedResult(null);
    form.reset();
    setCopied(false);
  };

  const handleShowQR = async () => {
    if (!shortenedResult) return;
    
    try {
      const response = await fetch(`/api/qr/${shortenedResult.shortCode}`);
      
      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setQrImageUrl(url);
      setCurrentShortCode(shortenedResult.shortCode);
      setQrDialogOpen(true);
    } catch (error) {
      console.error('Error loading QR code:', error);
      toast({
        title: "Error",
        description: "Could not load QR code. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadQR = async (shortCode: string) => {
    try {
      const response = await fetch(`/api/qr/${shortCode}`);
      
      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr-${shortCode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "QR Code downloaded!",
        description: "QR code saved to your downloads folder",
      });
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast({
        title: "Download failed",
        description: "Could not download QR code. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Clean up QR image URL when dialog closes
  useEffect(() => {
    if (!qrDialogOpen && qrImageUrl) {
      window.URL.revokeObjectURL(qrImageUrl);
      setQrImageUrl("");
    }
  }, [qrDialogOpen, qrImageUrl]);

  // Structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "TUrls",
    "description": "Professional URL shortener with advanced analytics, custom links, and QR code generation",
    "url": "https://turls.us",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free URL shortening with premium features available"
    },
    "featureList": [
      "URL Shortening",
      "Custom Short Codes",
      "Click Analytics",
      "QR Code Generation", 
      "Link Management",
      "Geographic Analytics"
    ],
    "publisher": {
      "@type": "Organization",
      "name": "TUrls",
      "url": "https://turls.us",
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "info@turls.us",
        "contactType": "Customer Service"
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="Free URL Shortener - Create Short Links with Analytics | TUrls"
        description="Shorten long URLs instantly with TUrls. Get detailed analytics, custom short codes, QR codes, and branded links. Free URL shortener trusted by thousands worldwide."
        keywords="URL shortener, link shortener, short URL, shorten links, custom short links, link analytics, click tracking, QR code generator, branded links, marketing links, free URL shortener"
        structuredData={structuredData}
      />
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Link className="w-4 h-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">TUrls</h1>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                Professional
              </Badge>
            </div>
            <div className="flex items-center space-x-4">
              {!isLoading && (
                <>
                  {isAuthenticated && user ? (
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        {(user as any).profileImageUrl ? (
                          <img 
                            src={(user as any).profileImageUrl} 
                            alt="Profile" 
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <UserIcon className="w-8 h-8 text-gray-400" />
                        )}
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {(user as any).firstName || (user as any).email}
                        </span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.href = "/"}
                        data-testid="button-dashboard"
                      >
                        Dashboard
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.href = "/api/logout"}
                        data-testid="button-logout"
                      >
                        <LogIn className="w-4 h-4 mr-2" />
                        Logout
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-4">
                      <nav className="hidden sm:flex items-center space-x-6">
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = "/subscription"}
                          className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300 hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/40 dark:hover:to-pink-900/40 transition-all duration-200"
                          data-testid="button-premium-features"
                        >
                          <Crown className="w-4 h-4 mr-2" />
                          Premium Features
                        </Button>
                      </nav>
                      <Button 
                        onClick={() => window.location.href = "/auth"}
                        size="sm"
                        data-testid="button-login"
                      >
                        <LogIn className="w-4 h-4 mr-2" />
                        Login
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 sm:py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="mb-8">
              <h2 className="text-3xl sm:text-5xl font-bold text-foreground mb-4">
                Shorten URLs instantly
              </h2>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
                Create short, memorable links in seconds. No registration required, links never expire.
              </p>
            </div>

            {/* Top Banner Ad */}
            <ResponsiveAdBanner className="mb-8" slot="1479341159" />

            {/* URL Shortener Form */}
            <div className="max-w-2xl mx-auto">
              <Card className="shadow-sm">
                <CardContent className="p-6 sm:p-8 space-y-6">
                  {!shortenedResult ? (
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="url-input" className="block text-sm font-medium text-foreground text-left">
                          Enter your long URL
                        </Label>
                        <div className="relative">
                          <Input
                            id="url-input"
                            type="url"
                            placeholder="https://example.com/very/long/url/path..."
                            {...form.register("originalUrl")}
                            className="w-full"
                            data-testid="input-url"
                          />
                          {form.watch("originalUrl") && !form.formState.errors.originalUrl && (
                            <div className="absolute right-3 top-3">
                              <Check className="w-4 h-4 text-green-500" />
                            </div>
                          )}
                        </div>
                        {form.formState.errors.originalUrl && (
                          <p className="text-sm text-destructive" data-testid="text-url-error">
                            {form.formState.errors.originalUrl.message}
                          </p>
                        )}
                      </div>

                      {/* Custom Code Input (Optional) */}
                      <div className="space-y-2">
                        <Label htmlFor="custom-code" className="block text-sm font-medium text-foreground text-left">
                          Custom short code (optional)
                        </Label>
                        <div className="relative">
                          <Input
                            id="custom-code"
                            type="text"
                            placeholder="my-custom-link (3-20 characters)"
                            {...form.register("customCode")}
                            className="w-full"
                            data-testid="input-custom-code"
                          />
                          {form.watch("customCode") && !form.formState.errors.customCode && (
                            <div className="absolute right-3 top-3">
                              <Check className="w-4 h-4 text-green-500" />
                            </div>
                          )}
                        </div>
                        {form.formState.errors.customCode && (
                          <p className="text-sm text-destructive" data-testid="text-custom-code-error">
                            {form.formState.errors.customCode.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Leave blank for random code. Only letters, numbers, hyphens, and underscores allowed.
                        </p>
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={shortenMutation.isPending}
                        data-testid="button-shorten"
                      >
                        {shortenMutation.isPending ? (
                          <>
                            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                            Shortening...
                          </>
                        ) : (
                          <>
                            Shorten URL
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </form>
                  ) : (
                    <div className="space-y-4" data-testid="result-success">
                      <div className="flex items-center space-x-2 text-green-600">
                        <Check className="w-5 h-5" />
                        <span className="font-medium">URL shortened successfully!</span>
                      </div>
                      
                      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-4">
                        {/* Short Code Display */}
                        <div className="text-center bg-primary/10 border border-primary/20 rounded-lg p-3">
                          <Label className="block text-sm font-medium text-muted-foreground mb-2">Short Code Generated:</Label>
                          <div className="text-2xl font-mono font-bold text-primary" data-testid="text-short-code">
                            {shortenedResult.shortCode}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            turls.us/{shortenedResult.shortCode}
                          </p>
                        </div>

                        {/* Original URL */}
                        <div className="space-y-2">
                          <Label className="block text-sm font-medium text-muted-foreground">Original URL:</Label>
                          <div className="space-y-2">
                            <div className="bg-background border border-border rounded-md p-3 break-all font-mono text-sm">
                              {shortenedResult.originalUrl}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                if (shortenedResult) {
                                  await navigator.clipboard.writeText(shortenedResult.originalUrl);
                                  toast({ title: "Original URL copied!", description: "Original URL copied to clipboard" });
                                }
                              }}
                              className="w-full"
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              Copy Original URL
                            </Button>
                          </div>
                        </div>
                        
                        {/* Shortened URL */}
                        <div className="space-y-3">
                          <Label className="block text-sm font-medium text-muted-foreground">Your Short URL:</Label>
                          
                          {/* Professional Domain */}
                          <div className="bg-gradient-to-r from-green-100 to-blue-100 dark:from-green-900/30 dark:to-blue-900/30 border-2 border-green-300 dark:border-green-600 rounded p-4">
                            <div className="text-center">
                              <div className="font-mono text-lg text-green-700 dark:text-green-300 font-bold">
                                turls.us/{shortenedResult.shortCode}
                              </div>
                              <div className="text-green-600 dark:text-green-400 mt-1 text-sm">
                                Only {8 + shortenedResult.shortCode.length} characters total!
                              </div>
                            </div>
                          </div>
                          
                          <Button
                            type="button"
                            variant="default"
                            onClick={async () => {
                              if (shortenedResult) {
                                const shortUrl = `turls.us/${shortenedResult.shortCode}`;
                                await navigator.clipboard.writeText(shortUrl);
                                toast({ title: "URL copied!", description: "turls.us URL copied to clipboard" });
                              }
                            }}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Short URL
                          </Button>
                        </div>

                        {/* Development Testing URL */}
                        <details className="space-y-2">
                          <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                            Development Testing URL (Click to expand)
                          </summary>
                          <div className="space-y-2 mt-2">
                            <div className="bg-muted border border-border rounded-md p-3 break-all font-mono text-xs" data-testid="text-full-url">
                              {shortenedResult.shortUrl}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleCopy}
                              className="w-full"
                              data-testid="button-copy"
                            >
                              {copied ? (
                                <Check className="w-4 h-4 mr-2" />
                              ) : (
                                <Copy className="w-4 h-4 mr-2" />
                              )}
                              {copied ? "Copied!" : "Copy Development URL"}
                            </Button>
                          </div>
                        </details>
                      </div>
                        
                        {copied && (
                          <div className="flex items-center space-x-2 text-green-600 text-sm" data-testid="text-copy-success">
                            <Check className="w-4 h-4" />
                            <span>Copied to clipboard!</span>
                          </div>
                        )}

                      {/* URL Stats */}
                      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                        <div className="text-center">
                          <div className="font-medium text-foreground" data-testid="text-original-length">
                            {shortenedResult?.originalUrl.length || 0} characters
                          </div>
                          <div>Original length</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-foreground" data-testid="text-shortened-length">
                            {shortenedResult?.shortUrl.length || 0} characters
                          </div>
                          <div>Shortened length</div>
                        </div>
                      </div>

                      {/* QR Code Download */}
                      <div className="space-y-2">
                        <Label className="block text-sm font-medium text-muted-foreground">QR Code:</Label>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleShowQR}
                          className="w-full"
                          data-testid="button-view-qr"
                        >
                          <QrCode className="w-4 h-4 mr-2" />
                          View QR Code
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          QR code points to your shortened URL
                        </p>
                      </div>

                      {/* Results Banner Ad */}
                      <ResponsiveAdBanner className="my-6" slot="9032845199" />

                      <Button 
                        type="button"
                        variant="ghost"
                        onClick={handleReset}
                        className="w-full"
                        data-testid="button-shorten-another"
                      >
                        Shorten another URL
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                Simple, fast, reliable
              </h3>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Everything you need in a URL shortener, without the complexity.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">Instant Shortening</h4>
                <p className="text-muted-foreground">
                  Get your shortened URL in milliseconds. No waiting, no delays.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Infinity className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">Never Expires</h4>
                <p className="text-muted-foreground">
                  Your shortened links work forever. No expiration dates or broken links.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <UserX className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">No Registration</h4>
                <p className="text-muted-foreground">
                  Start shortening URLs immediately. No accounts, no sign-ups required.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
              Trusted by thousands
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="space-y-2">
                <div className="text-3xl sm:text-4xl font-bold text-primary">125K+</div>
                <div className="text-sm text-muted-foreground">URLs shortened</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl sm:text-4xl font-bold text-primary">2.1M+</div>
                <div className="text-sm text-muted-foreground">Total clicks</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl sm:text-4xl font-bold text-primary">99.9%</div>
                <div className="text-sm text-muted-foreground">Uptime</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl sm:text-4xl font-bold text-primary">&lt;100ms</div>
                <div className="text-sm text-muted-foreground">Avg response</div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Comparison & Pricing Section */}
        <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
                Choose the Right Plan for You
              </h3>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Start for free and upgrade when you need more power and insights
              </p>
            </div>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Free Plan */}
              <Card className="relative border-2 border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <h4 className="text-2xl font-bold text-foreground mb-2">Free</h4>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                      $0<span className="text-lg font-normal text-muted-foreground">/month</span>
                    </div>
                    <p className="text-muted-foreground">Perfect for getting started</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span className="text-sm">Up to 10 shortened URLs</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span className="text-sm">Basic click tracking</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span className="text-sm">Custom short codes</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span className="text-sm">QR code generation</span>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => window.location.href = "/auth"}
                    data-testid="button-get-started-free"
                  >
                    Get Started Free
                  </Button>
                </CardContent>
              </Card>

              {/* Premium Plan */}
              <Card className="relative border-2 border-purple-500 shadow-xl hover:shadow-2xl transition-shadow duration-300 bg-gradient-to-br from-white to-purple-50 dark:from-gray-900 dark:to-purple-900/20">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-1 text-sm font-semibold">
                    Most Popular
                  </Badge>
                </div>
                
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Crown className="w-6 h-6 text-purple-600" />
                      <h4 className="text-2xl font-bold text-foreground">Premium</h4>
                    </div>
                    <div className="mb-4">
                      <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        $5.99<span className="text-lg font-normal text-muted-foreground">/month</span>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground mt-1">
                        or $49.99<span className="text-base font-normal">/year</span>
                      </div>
                      <p className="text-sm text-green-600 font-medium mt-1">Save $20 with yearly billing</p>
                    </div>
                    <p className="text-muted-foreground">For professionals & businesses</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">Up to 10,000 URLs (1000x more!)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">Advanced analytics & insights</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">Bulk URL creation (CSV upload)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Download className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">Bulk QR code export</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">Branded custom domains</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">Priority support</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Star className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold">No ads or branding</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg"
                    onClick={() => window.location.href = "/subscription"}
                    data-testid="button-upgrade-premium"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Premium
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Value Proposition */}
            <div className="mt-16 text-center">
              <div className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl p-8 max-w-4xl mx-auto">
                <h4 className="text-2xl font-bold text-foreground mb-6">Why Choose Premium?</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                  <div>
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="w-8 h-8 text-white" />
                    </div>
                    <h5 className="font-semibold text-foreground mb-2">Advanced Analytics</h5>
                    <p className="text-sm text-muted-foreground">
                      Track clicks, locations, devices, and referrers with detailed charts and real-time insights
                    </p>
                  </div>
                  <div>
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Zap className="w-8 h-8 text-white" />
                    </div>
                    <h5 className="font-semibold text-foreground mb-2">Scale Your Business</h5>
                    <p className="text-sm text-muted-foreground">
                      Create thousands of URLs with bulk operations, perfect for marketing campaigns and business growth
                    </p>
                  </div>
                  <div>
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h5 className="font-semibold text-foreground mb-2">Professional Experience</h5>
                    <p className="text-sm text-muted-foreground">
                      Custom branding, priority support, and enterprise-grade features for your business needs
                    </p>
                  </div>
                </div>
                
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FAQ Section */}
      <section className="py-16 bg-white/50 dark:bg-gray-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about TUrls URL shortening service
            </p>
          </div>

          <div className="space-y-6">
            {/* FAQ Item 1 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  How does TUrls URL shortening work?
                </h3>
                <p className="text-muted-foreground">
                  TUrls takes your long URLs and creates short, memorable links that redirect to your original content. 
                  Simply paste your long URL, optionally customize the short code, and get an instant shortened link. 
                  Our platform handles millions of redirects reliably with enterprise-grade infrastructure.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 2 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Do I need to create an account to use TUrls?
                </h3>
                <p className="text-muted-foreground">
                  No account is required for basic URL shortening. You can create shortened links instantly without registration. 
                  However, creating a free account gives you access to click analytics, link management, custom codes, 
                  and the ability to edit or delete your links later.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 3 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  How long do shortened links last?
                </h3>
                <p className="text-muted-foreground">
                  All TUrls shortened links are permanent and never expire. Once created, your links will continue 
                  working indefinitely, ensuring your shared content remains accessible to your audience. 
                  This makes TUrls perfect for important documents, marketing campaigns, and long-term content sharing.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 4 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  What analytics and insights does TUrls provide?
                </h3>
                <p className="text-muted-foreground">
                  TUrls provides comprehensive analytics including total clicks, geographic location data, 
                  device and browser information, referrer sources, and click patterns over time. Premium users 
                  get advanced features like real-time analytics, detailed charts, export capabilities, 
                  and bulk link management tools.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 5 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Can I customize my shortened URLs?
                </h3>
                <p className="text-muted-foreground">
                  Yes! TUrls allows you to create custom short codes that are meaningful to your brand or content. 
                  Instead of random characters, you can create links like turls.us/summer-sale or turls.us/newsletter2025. 
                  Premium users get access to branded domains and advanced customization options.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 6 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Is TUrls safe and secure?
                </h3>
                <p className="text-muted-foreground">
                  Absolutely. TUrls uses enterprise-grade security measures including SSL encryption, 
                  malware scanning, and fraud detection. We protect both link creators and visitors by 
                  monitoring for malicious content and providing safe, reliable redirects. Your data privacy 
                  is protected with industry-standard security practices.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 7 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  What's included in the Premium subscription?
                </h3>
                <p className="text-muted-foreground">
                  Premium subscribers get advanced analytics with real-time data, bulk link operations, 
                  QR code generation, custom branded domains, API access, priority support, and an 
                  ad-free experience. Premium plans start at $5.99/month or save with our annual plan at $49.99/year. 
                  All plans include unlimited link creation and permanent storage.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 8 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Can I use TUrls for business or commercial purposes?
                </h3>
                <p className="text-muted-foreground">
                  Yes, TUrls is designed for both personal and commercial use. Many businesses, marketers, 
                  content creators, and organizations use TUrls for email campaigns, social media marketing, 
                  QR codes, and tracking marketing performance. Our Premium features are specifically designed 
                  for professional and commercial applications.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 9 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  How do I get support if I need help?
                </h3>
                <p className="text-muted-foreground">
                  Our support team is here to help! You can reach us at info@turls.us for any questions, 
                  technical issues, or feature requests. Premium subscribers receive priority support with 
                  faster response times. We also maintain comprehensive documentation and tutorials to help 
                  you get the most out of TUrls.
                </p>
              </CardContent>
            </Card>

            {/* FAQ Item 10 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  What makes TUrls different from other URL shorteners?
                </h3>
                <p className="text-muted-foreground">
                  TUrls combines reliability, advanced analytics, and premium features in one platform. 
                  Unlike other services, we guarantee permanent links, provide detailed insights, offer 
                  extensive customization, and maintain enterprise-grade security. Our focus on user experience, 
                  data privacy, and professional features sets us apart in the URL shortening space.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">
              Still have questions? We'd love to help!
            </p>
            <Button 
              onClick={() => window.location.href = "mailto:info@turls.us"}
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-contact-support"
            >
              Contact Support
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How TUrls Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Our simple three-step process makes URL shortening fast and effective for everyone
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl text-center">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white font-bold text-xl">1</span>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">Paste Your URL</h3>
                <p className="text-muted-foreground">
                  Simply copy and paste your long URL into our shortener. Works with any valid web address, 
                  from simple web pages to complex URLs with parameters and tracking codes.
                </p>
              </CardContent>
            </Card>

            {/* Step 2 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl text-center">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white font-bold text-xl">2</span>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">Customize (Optional)</h3>
                <p className="text-muted-foreground">
                  Add a custom short code to make your link memorable and branded. Perfect for marketing 
                  campaigns, business cards, or any situation where you want a meaningful short URL.
                </p>
              </CardContent>
            </Card>

            {/* Step 3 */}
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl text-center">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white font-bold text-xl">3</span>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">Share & Track</h3>
                <p className="text-muted-foreground">
                  Get your shortened link instantly and start sharing. Track clicks, analyze traffic, 
                  and gain insights into how your audience engages with your content across all platforms.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Bottom Banner Ad */}
      <section className="py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ResponsiveAdBanner className="mb-8" slot="9032845199" />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                  <Link className="w-3 h-3 text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground">TUrls</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Professional URL shortening service with advanced analytics and premium features.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Support</h4>
              <div className="space-y-2 text-sm">
                <a href="mailto:info@turls.us" className="block text-muted-foreground hover:text-foreground transition-colors">Contact Support</a>
                <a href="/subscription" className="block text-muted-foreground hover:text-foreground transition-colors">Premium Features</a>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Legal</h4>
              <div className="space-y-2 text-sm">
                <a href="/privacy-policy" className="block text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
                <a href="/terms-of-service" className="block text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a>
                <a href="/cookie-policy" className="block text-muted-foreground hover:text-foreground transition-colors">Cookie Policy</a>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Company</h4>
              <div className="space-y-2 text-sm">
                <a href="/about" className="block text-muted-foreground hover:text-foreground transition-colors">About TUrls</a>
                <p className="text-muted-foreground text-xs">
                  TUrls is a US-based company providing professional URL shortening services with advanced analytics and premium features.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <div className="text-center sm:text-left">
              <p className="text-sm text-muted-foreground">
                © 2025 TUrls. All rights reserved.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Operated in compliance with US federal and state laws.
              </p>
            </div>
            <div className="flex items-center space-x-4 mt-4 sm:mt-0">
              <a href="mailto:info@turls.us" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                info@turls.us
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* QR Code Preview Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code for turls.us/{currentShortCode}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {qrImageUrl && (
              <div className="flex justify-center">
                <img 
                  src={qrImageUrl} 
                  alt={`QR Code for ${currentShortCode}`}
                  className="w-64 h-64 border border-gray-200 rounded-lg"
                />
              </div>
            )}
            <div className="flex justify-center space-x-3">
              <Button 
                variant="outline" 
                onClick={() => setQrDialogOpen(false)}
              >
                Close
              </Button>
              <Button 
                onClick={() => handleDownloadQR(currentShortCode)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-download-qr"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
