import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Url, User } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Plus, Edit2, Trash2, BarChart3, Download, Copy, ExternalLink, User as UserIcon, LogOut, QrCode, Link2, MousePointer, TrendingUp, Activity, Crown, Settings, FileDown, Home } from "lucide-react";
import { AnalyticsModal } from "@/components/AnalyticsModal";
import { GlobalAnalyticsModal } from "@/components/GlobalAnalyticsModal";
import { ResponsiveAdBanner } from "@/components/AdSenseBanner";
import SEO from "@/components/SEO";
import JSZip from 'jszip';

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  // Enable auto-logout functionality (temporarily disabled due to auth loop)
  // useAutoLogout();

  // Check for subscription success/cancel query parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subscriptionStatus = urlParams.get('subscription');
    
    if (subscriptionStatus === 'success') {
      toast({
        title: "🎉 Welcome to TUrls Premium!",
        description: "Your subscription is now active. Enjoy your premium features!",
        duration: 8000,
      });
      // Clear the query parameter from URL
      window.history.replaceState({}, '', '/dashboard');
      // Invalidate subscription status to refresh premium features
      queryClient.invalidateQueries({ queryKey: ['/api/subscription-status'] });
    } else if (subscriptionStatus === 'cancelled') {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription was cancelled. You can try again anytime.",
        variant: "destructive",
        duration: 5000,
      });
      // Clear the query parameter from URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [toast, queryClient]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Get user's URLs
  const { data: urls = [], isLoading: urlsLoading } = useQuery<Url[]>({
    queryKey: ["/api/urls"],
    enabled: isAuthenticated,
  });

  // Get subscription status
  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription-status"],
    enabled: isAuthenticated,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0, // Always refetch to ensure up-to-date subscription status
  });

  const isPremium = subscription?.isPremium || 
                   (subscription?.subscriptionStatus === 'canceled' && 
                    subscription?.subscriptionEndDate && 
                    new Date(subscription.subscriptionEndDate) > new Date()) || false;

  // Tab state
  const [activeTab, setActiveTab] = useState("urls");

  // Bulk URL creation state
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkResults, setBulkResults] = useState<any>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'text' | 'csv'>('text');

  // Single URL creation state
  const [newUrl, setNewUrl] = useState({ originalUrl: "", customCode: "", title: "", description: "" });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [firstUrlDialogOpen, setFirstUrlDialogOpen] = useState(false);

  // Edit URL state
  const [editingUrl, setEditingUrl] = useState<Url | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", customCode: "" });

  // QR Code dialog state
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [currentShortCode, setCurrentShortCode] = useState<string>("");

  // Analytics modal state
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [analyticsUrlId, setAnalyticsUrlId] = useState<string>("");
  const [analyticsShortCode, setAnalyticsShortCode] = useState<string>("");
  
  // Global analytics modal state
  const [globalAnalyticsModalOpen, setGlobalAnalyticsModalOpen] = useState(false);

  // Bulk QR export mutation
  const bulkQrExportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/bulk-qr-export", "POST");
      return await response.json();
    },
    onSuccess: async (data: any) => {
      try {
        const zip = new JSZip();
        const qrCodes = data.qrCodes || [];
        
        // Add each QR code as a PNG file to the ZIP
        for (const qrCode of qrCodes) {
          if (qrCode.qrCodeDataUrl) {
            // Convert data URL to blob
            const base64Data = qrCode.qrCodeDataUrl.split(',')[1];
            const binaryData = atob(base64Data);
            const array = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              array[i] = binaryData.charCodeAt(i);
            }
            
            // Create filename: shortCode-title.png or just shortCode.png
            const title = qrCode.title ? `-${qrCode.title.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
            const filename = `qr-${qrCode.shortCode}${title}.png`;
            
            zip.file(filename, array);
          }
        }
        
        // Generate ZIP file and download
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qr-codes-export-${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "QR Codes Exported",
          description: `Successfully exported ${qrCodes.length} QR code images in a ZIP file`,
        });
      } catch (error) {
        console.error('Error creating ZIP file:', error);
        toast({
          title: "Export Error",
          description: "Failed to create ZIP file with QR codes",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export QR codes",
        variant: "destructive",
      });
    },
  });

  // Single URL creation mutation
  const createUrlMutation = useMutation({
    mutationFn: async (urlData: any) => {
      return await apiRequest("/api/shorten", "POST", urlData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "URL shortened successfully!" });
      setNewUrl({ originalUrl: "", customCode: "", title: "", description: "" });
      setCreateDialogOpen(false);
      setFirstUrlDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to shorten URL",
        variant: "destructive",
      });
    },
  });

  // Bulk URL creation mutation
  const bulkCreateMutation = useMutation({
    mutationFn: async (urls: string[]) => {
      const urlsArray = urls.map(url => ({ originalUrl: url.trim() })).filter(u => u.originalUrl);
      return await apiRequest("/api/bulk-shorten", "POST", { urls: urlsArray });
    },
    onSuccess: (result: any) => {
      setBulkResults(result);
      setBulkUrls("");
      setCsvFile(null);
      // Clear the file input
      const fileInput = document.getElementById('csvUpload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
      
      // Detailed success/error messaging
      const successCount = result.results?.length || 0;
      const errorCount = result.errors?.length || 0;
      const totalProcessed = successCount + errorCount;
      
      if (errorCount === 0) {
        toast({ 
          title: "🎉 All URLs Created Successfully!", 
          description: `Successfully created all ${successCount} shortened URLs. You can view them in the URLs tab.`,
        });
      } else if (successCount === 0) {
        toast({ 
          title: "⚠️ No URLs Were Created", 
          description: `All ${errorCount} URLs failed to process. Please check the format and try again.`,
          variant: "destructive"
        });
      } else {
        toast({ 
          title: "⚡ Bulk Upload Completed", 
          description: `${successCount} URLs created successfully, ${errorCount} failed. Check the results below for details.`,
          variant: "default"
        });
      }
      
      // Switch back to dashboard tab after successful bulk creation
      setActiveTab("urls");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized", 
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to process bulk URLs",
        variant: "destructive",
      });
    },
  });

  // Edit URL mutation
  const editUrlMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return await apiRequest(`/api/urls/${id}`, "PATCH", updates);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "URL updated successfully!" });
      setEditingUrl(null);
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update URL",
        variant: "destructive",
      });
    },
  });

  // Delete URL mutation
  const deleteUrlMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/urls/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({ title: "Success", description: "URL deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to delete URL",
        variant: "destructive",
      });
    },
  });

  const handleCopyUrl = (shortCode: string) => {
    const shortUrl = `${window.location.protocol}//${window.location.host}/${shortCode}`;
    navigator.clipboard.writeText(shortUrl);
    toast({ title: "Copied!", description: "Short URL copied to clipboard" });
  };

  const handleShowQR = async (shortCode: string) => {
    try {
      const response = await fetch(`/api/qr/${shortCode}`);
      
      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setQrImageUrl(url);
      setCurrentShortCode(shortCode);
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

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
      // Clear text input when CSV is selected
      setBulkUrls("");
    }
  };

  const parseCsvFile = (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          const urls: string[] = [];
          
          lines.forEach((line, index) => {
            // Handle both CSV format (with commas) and simple text format
            const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
            const url = columns[0]; // First column should be the URL
            
            if (url && url.startsWith('http')) {
              urls.push(url);
            }
          });
          
          resolve(urls);
        } catch (error) {
          reject(new Error('Failed to parse CSV file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleBulkSubmit = async () => {
    let urls: string[] = [];
    
    if (uploadMethod === 'csv' && csvFile) {
      try {
        urls = await parseCsvFile(csvFile);
        if (urls.length === 0) {
          toast({ 
            title: "Error", 
            description: "No valid URLs found in CSV file. Make sure URLs are in the first column and start with http.",
            variant: "destructive" 
          });
          return;
        }
      } catch (error) {
        toast({ title: "Error", description: "Failed to parse CSV file", variant: "destructive" });
        return;
      }
    } else {
      urls = bulkUrls.split('\n').filter(url => url.trim());
      if (urls.length === 0) {
        toast({ title: "Error", description: "Please enter at least one URL", variant: "destructive" });
        return;
      }
    }
    
    if (urls.length > 100) {
      toast({ title: "Error", description: "Maximum 100 URLs allowed per batch", variant: "destructive" });
      return;
    }
    
    bulkCreateMutation.mutate(urls);
  };

  const handleEditSubmit = () => {
    if (!editingUrl) return;
    editUrlMutation.mutate({ 
      id: editingUrl.id, 
      updates: {
        title: editForm.title || undefined,
        description: editForm.description || undefined,
        customCode: editForm.customCode || undefined,
      }
    });
  };

  const openEditDialog = (url: Url) => {
    setEditingUrl(url);
    setEditForm({
      title: url.title || "",
      description: url.description || "",
      customCode: url.shortCode,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <TooltipProvider>
      <SEO 
        title="Dashboard - Manage Your Short URLs | TUrls"
        description="Manage your shortened URLs, view analytics, and track performance with TUrls dashboard."
        robots="noindex, nofollow"
        canonical="https://turls.us/dashboard"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-lg border-b border-gray-200/50 dark:border-gray-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => window.location.href = '/'}
                  className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 cursor-pointer"
                  title="Go to Home Page"
                >
                  <Link2 className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                    TUrls Dashboard
                  </h1>
                  {user && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
                      Welcome back, {String((user as any).firstName || (user as any).email?.split('@')[0] || 'User')}! ✨
                    </p>
                  )}
                </div>
              </div>
              <Badge className={isPremium 
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0 shadow-md px-3 py-1" 
                : "bg-gray-400 text-white border-0 shadow-md px-3 py-1"
              }>
                {isPremium ? 'Premium' : 'Free'}
              </Badge>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/'}
                className="border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                title="Go to Home Page"
              >
                <Home className="w-4 h-4 mr-2" />
                Home
              </Button>
              {user && (
                <>
                  <div className="flex items-center space-x-3 bg-gray-50 dark:bg-gray-800 rounded-full px-4 py-2 border border-gray-200 dark:border-gray-700">
                    {(user as any).profileImageUrl ? (
                      <img 
                        src={(user as any).profileImageUrl} 
                        alt="Profile" 
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/20"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {String((user as any).firstName || (user as any).email || 'User')}
                    </span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = "/subscription"}
                    data-testid="button-subscription"
                    className="border-purple-300 dark:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    {isPremium ? 'Manage' : 'Upgrade'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = "/api/logout"}
                    data-testid="button-logout"
                    className="border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-0 rounded-xl p-1 shadow-lg">
            <TabsTrigger 
              value="urls" 
              data-testid="tab-urls"
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md font-medium transition-all duration-200"
            >
              📊 Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="tools" 
              data-testid="tab-tools"
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md font-medium transition-all duration-200"
            >
              🛠️ Tools & Export
            </TabsTrigger>
          </TabsList>

          {/* URLs List Tab */}
          <TabsContent value="urls" className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Total URLs */}
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        {urls.length}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                        URLs Created
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {isPremium ? 'Limit: 10,000' : `Limit: 10 ${urls.length >= 8 ? '⚠️' : ''}`}
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Link2 className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  {!isPremium && urls.length >= 8 && (
                    <div className="mt-3 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded text-xs text-orange-600 dark:text-orange-400">
                      Approaching limit. <button onClick={() => window.location.href = "/subscription"} className="underline font-medium">Upgrade now</button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Total Clicks */}
              <Card 
                className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ${
                  isPremium ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                }`}
                onClick={() => {
                  if (isPremium) {
                    setGlobalAnalyticsModalOpen(true);
                  } else {
                    toast({
                      title: "Premium Feature",
                      description: "Global analytics are available with Premium subscription. Upgrade to access detailed insights across all your URLs.",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="card-total-clicks"
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        {urls.reduce((total, url) => total + (url.clicks || 0), 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-medium flex items-center gap-2">
                        Total Clicks
                        {!isPremium && <Crown className="w-4 h-4 text-yellow-500" />}
                      </div>
                      <div className={`text-xs mt-1 font-medium ${
                        isPremium ? 'text-blue-500 dark:text-blue-400' : 'text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {isPremium ? 'Click for global analytics →' : 'Premium: Global analytics available'}
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                      <MousePointer className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Average Clicks */}
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        {urls.length > 0 ? Math.round(urls.reduce((total, url) => total + (url.clicks || 0), 0) / urls.length) : 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                        Avg Clicks
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Dashboard Top Banner Ad */}
            <ResponsiveAdBanner className="my-8" slot="6195502880" />

            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-t-lg">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl font-bold text-gray-900 dark:text-white">Your Shortened URLs</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-medium">
                      {urls.length} URLs
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg" data-testid="button-create-url">
                          <Plus className="w-4 h-4 mr-2" />
                          Create URL
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Short URL</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="url">Original URL *</Label>
                            <Input
                              id="url"
                              placeholder="https://example.com/your-long-url"
                              value={newUrl.originalUrl}
                              onChange={(e) => {
                                let url = e.target.value;
                                // Auto-prepend https:// if no protocol and it looks like a URL
                                if (url && !url.startsWith('http://') && !url.startsWith('https://') && (url.includes('.') || url.includes('localhost'))) {
                                  url = 'https://' + url;
                                }
                                setNewUrl(prev => ({ ...prev, originalUrl: url }));
                              }}
                              data-testid="input-original-url"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Must include http:// or https:// (automatically added if missing)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="title">Title (optional)</Label>
                            <Input
                              id="title"
                              placeholder="My Website"
                              value={newUrl.title}
                              onChange={(e) => setNewUrl(prev => ({ ...prev, title: e.target.value }))}
                              data-testid="input-title"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="custom">Custom Code (optional)</Label>
                            <Input
                              id="custom"
                              placeholder="my-link"
                              value={newUrl.customCode}
                              onChange={(e) => setNewUrl(prev => ({ ...prev, customCode: e.target.value }))}
                              data-testid="input-custom-code"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="description">Description (optional)</Label>
                            <Textarea
                              id="description"
                              placeholder="What is this link for?"
                              value={newUrl.description}
                              onChange={(e) => setNewUrl(prev => ({ ...prev, description: e.target.value }))}
                              data-testid="input-description"
                            />
                          </div>
                          <Button 
                            onClick={() => createUrlMutation.mutate(newUrl)}
                            disabled={!newUrl.originalUrl || createUrlMutation.isPending}
                            className="w-full"
                            data-testid="button-submit-create"
                          >
                            {createUrlMutation.isPending ? "Creating..." : "Create Short URL"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Badge variant="secondary" data-testid="text-url-count">
                      {urls.length} URLs
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {urlsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-300">Loading your URLs...</p>
                  </div>
                ) : urls.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-800/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Link2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No URLs created yet</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">Get started by creating your first shortened URL</p>
                    <Dialog open={firstUrlDialogOpen} onOpenChange={setFirstUrlDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700" data-testid="button-create-first-url">
                          <Plus className="w-4 h-4 mr-2" />
                          Create Your First URL
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Your First Short URL</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="first-url">Original URL *</Label>
                            <Input
                              id="first-url"
                              placeholder="https://example.com/your-long-url"
                              value={newUrl.originalUrl}
                              onChange={(e) => {
                                let url = e.target.value;
                                // Auto-prepend https:// if no protocol and it looks like a URL
                                if (url && !url.startsWith('http://') && !url.startsWith('https://') && (url.includes('.') || url.includes('localhost'))) {
                                  url = 'https://' + url;
                                }
                                setNewUrl(prev => ({ ...prev, originalUrl: url }));
                              }}
                              data-testid="input-first-original-url"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Must include http:// or https:// (automatically added if missing)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="first-title">Title (optional)</Label>
                            <Input
                              id="first-title"
                              placeholder="My Website"
                              value={newUrl.title}
                              onChange={(e) => setNewUrl(prev => ({ ...prev, title: e.target.value }))}
                              data-testid="input-first-title"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="first-custom">Custom Code (optional)</Label>
                            <Input
                              id="first-custom"
                              placeholder="my-link"
                              value={newUrl.customCode}
                              onChange={(e) => setNewUrl(prev => ({ ...prev, customCode: e.target.value }))}
                              data-testid="input-first-custom-code"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="first-description">Description (optional)</Label>
                            <Textarea
                              id="first-description"
                              placeholder="What is this link for?"
                              value={newUrl.description}
                              onChange={(e) => setNewUrl(prev => ({ ...prev, description: e.target.value }))}
                              data-testid="input-first-description"
                            />
                          </div>
                          <Button 
                            onClick={() => createUrlMutation.mutate(newUrl)}
                            disabled={!newUrl.originalUrl || createUrlMutation.isPending}
                            className="w-full"
                            data-testid="button-submit-first-create"
                          >
                            {createUrlMutation.isPending ? "Creating..." : "Create Short URL"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(urls as Url[]).map((url: Url) => (
                      <div key={url.id} className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-0 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1" data-testid={`card-url-${url.id}`}>
                        <div className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-3 mb-3">
                                <span className="font-mono text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-sm font-medium">
                                  turls.us/{url.shortCode}
                                </span>
                                <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 shadow-sm" data-testid={`text-clicks-${url.id}`}>
                                  <MousePointer className="w-3 h-3 mr-1" />
                                  {url.clicks} clicks
                                </Badge>
                              </div>
                              {url.title && (
                                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2" data-testid={`text-title-${url.id}`}>
                                  {url.title}
                                </h3>
                              )}
                              <p className="text-sm text-gray-600 dark:text-gray-300 break-all mb-3 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg" data-testid={`text-original-${url.id}`}>
                                {url.originalUrl}
                              </p>
                              {url.description && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 italic" data-testid={`text-description-${url.id}`}>
                                  "{url.description}"
                                </p>
                              )}
                              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                Created {new Date(url.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 ml-6">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCopyUrl(url.shortCode)}
                                    data-testid={`button-copy-${url.id}`}
                                    className="bg-white/80 hover:bg-blue-50 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Copy short URL</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleShowQR(url.shortCode)}
                                    data-testid={`button-qr-${url.id}`}
                                    className="bg-white/80 hover:bg-purple-50 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <QrCode className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>View QR Code</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(url.originalUrl, '_blank')}
                                    data-testid={`button-visit-${url.id}`}
                                    className="bg-white/80 hover:bg-green-50 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Visit original URL</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditDialog(url)}
                                    data-testid={`button-edit-${url.id}`}
                                    className="bg-white/80 hover:bg-yellow-50 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit URL details</p>
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setAnalyticsUrlId(url.id);
                                      setAnalyticsShortCode(url.shortCode);
                                      setAnalyticsModalOpen(true);
                                    }}
                                    data-testid={`button-analytics-${url.id}`}
                                    className="bg-white/80 hover:bg-purple-50 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                  >
                                    <Activity className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>View Analytics</p>
                                </TooltipContent>
                              </Tooltip>
                              <AlertDialog>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertDialogTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        data-testid={`button-delete-${url.id}`}
                                        className="bg-white/80 hover:bg-red-50 border-gray-200 shadow-sm hover:shadow-md transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Delete URL</p>
                                  </TooltipContent>
                                </Tooltip>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete URL</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this shortened URL? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => deleteUrlMutation.mutate(url.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Create Single URL Tab */}
          <TabsContent value="create" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create New Short URL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="originalUrl">URL to Shorten *</Label>
                  <Input
                    id="originalUrl"
                    placeholder="https://example.com/very-long-url"
                    value={newUrl.originalUrl}
                    onChange={(e) => setNewUrl({ ...newUrl, originalUrl: e.target.value })}
                    data-testid="input-original-url"
                  />
                </div>
                <div>
                  <Label htmlFor="customCode">Custom Short Code (optional)</Label>
                  <Input
                    id="customCode"
                    placeholder="my-custom-code"
                    value={newUrl.customCode}
                    onChange={(e) => setNewUrl({ ...newUrl, customCode: e.target.value })}
                    data-testid="input-custom-code"
                  />
                </div>
                <div>
                  <Label htmlFor="title">Title (optional)</Label>
                  <Input
                    id="title"
                    placeholder="My Website"
                    value={newUrl.title}
                    onChange={(e) => setNewUrl({ ...newUrl, title: e.target.value })}
                    data-testid="input-title"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="A brief description of this URL"
                    value={newUrl.description}
                    onChange={(e) => setNewUrl({ ...newUrl, description: e.target.value })}
                    data-testid="input-description"
                  />
                </div>
                <Button
                  onClick={() => createUrlMutation.mutate(newUrl)}
                  disabled={!newUrl.originalUrl || createUrlMutation.isPending}
                  className="w-full"
                  data-testid="button-create-url"
                >
                  {createUrlMutation.isPending ? "Creating..." : "Create Short URL"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tools & Export Tab */}
          <TabsContent value="tools" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bulk Create Card */}
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    🚀 Bulk URL Creation
                    {!isPremium && <Crown className="h-4 w-4 text-yellow-600" />}
                  </CardTitle>
                  <CardDescription>
                    Create multiple shortened URLs at once from CSV files or manual entry
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                {!isPremium ? (
                  <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-dashed border-purple-300 dark:border-purple-600 rounded-lg text-center">
                    <Crown className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-300 mb-2">
                      Premium Feature
                    </h3>
                    <p className="text-purple-600 dark:text-purple-400 mb-4">
                      Bulk URL creation allows you to upload CSV files and create hundreds of short URLs at once.
                    </p>
                    <Button 
                      onClick={() => window.location.href = "/subscription"}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    >
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade to Premium
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Upload Method Selection */}
                    <div className="flex gap-4 mb-4">
                      <Button
                        variant={uploadMethod === 'text' ? 'default' : 'outline'}
                        onClick={() => setUploadMethod('text')}
                        className="flex-1"
                      >
                        Manual Entry
                      </Button>
                      <Button
                        variant={uploadMethod === 'csv' ? 'default' : 'outline'}
                        onClick={() => setUploadMethod('csv')}
                        className="flex-1"
                      >
                        CSV Upload
                      </Button>
                    </div>

                    {uploadMethod === 'text' ? (
                      <div>
                        <Label htmlFor="bulkUrls">URLs (one per line, max 100)</Label>
                        <Textarea
                          id="bulkUrls"
                          placeholder={`https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3`}
                          value={bulkUrls}
                          onChange={(e) => setBulkUrls(e.target.value)}
                          rows={10}
                          data-testid="input-bulk-urls"
                        />
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="csvUpload" className="text-base font-medium">Upload CSV File</Label>
                        <div className="mt-3 space-y-4">
                          {/* Enhanced File Upload Area */}
                          <div className="relative">
                            <input
                              id="csvUpload"
                              type="file"
                              accept=".csv,.txt"
                              onChange={handleCsvUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              data-testid="input-csv-upload"
                            />
                            <div className={`
                              border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
                              ${csvFile 
                                ? 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700' 
                                : 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600 hover:border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                              }
                            `}>
                              {csvFile ? (
                                <div className="space-y-3">
                                  <div className="w-16 h-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mx-auto">
                                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-lg font-medium text-green-700 dark:text-green-300">
                                      File Ready to Upload
                                    </p>
                                    <p className="text-sm text-green-600 dark:text-green-400">
                                      {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCsvFile(null);
                                      const input = document.getElementById('csvUpload') as HTMLInputElement;
                                      if (input) input.value = '';
                                    }}
                                    className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 underline"
                                  >
                                    Change file
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center mx-auto">
                                    <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-lg font-medium text-blue-700 dark:text-blue-300">
                                      Click to Select CSV File
                                    </p>
                                    <p className="text-sm text-blue-600 dark:text-blue-400">
                                      or drag and drop your file here
                                    </p>
                                  </div>
                                  <div className="text-xs text-blue-500 dark:text-blue-400">
                                    Supports: .csv, .txt files (max 100 URLs)
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Format Guidelines */}
                          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-5 h-5 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                                <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-2">
                                  CSV Format Guidelines:
                                </p>
                                <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                                  <li>• URLs should be in the first column</li>
                                  <li>• One URL per row</li>
                                  <li>• Maximum 100 URLs per file</li>
                                  <li>• Example: https://example.com,Title,Description</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleBulkSubmit}
                      disabled={
                        (uploadMethod === 'text' && !bulkUrls.trim()) ||
                        (uploadMethod === 'csv' && !csvFile) ||
                        bulkCreateMutation.isPending
                      }
                      className="w-full"
                      data-testid="button-bulk-create"
                    >
                      {bulkCreateMutation.isPending ? "Processing..." : 
                       uploadMethod === 'csv' ? "Upload & Create URLs" : "Create All URLs"}
                    </Button>
                  </>
                )}

                {bulkResults && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Results</h3>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {bulkResults.results?.length || 0} successful, {bulkResults.errors?.length || 0} errors
                      </div>
                    </div>
                    
                    {bulkResults.results && bulkResults.results.length > 0 && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-5 h-5 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <h4 className="font-medium text-green-700 dark:text-green-300">
                            ✅ Successfully Created ({bulkResults.results.length})
                          </h4>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto">
                          {bulkResults.results.map((result: any, index: number) => (
                            <div key={index} className="bg-white dark:bg-green-800/30 border border-green-200 dark:border-green-700 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="font-mono text-sm font-medium text-green-700 dark:text-green-300">
                                    turls.us/{result.shortCode}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 break-all mt-1">
                                    {result.originalUrl}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleCopyUrl(result.shortCode)}
                                  className="ml-3 p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                                  title="Copy URL"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {bulkResults.errors && bulkResults.errors.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-5 h-5 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                          <h4 className="font-medium text-red-700 dark:text-red-300">
                            ❌ Failed to Process ({bulkResults.errors.length})
                          </h4>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto">
                          {bulkResults.errors.map((error: any, index: number) => (
                            <div key={index} className="bg-white dark:bg-red-800/30 border border-red-200 dark:border-red-700 rounded-lg p-3">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                  {error.error || 'Unknown error occurred'}
                                </p>
                                <div className="flex items-start gap-2">
                                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">URL:</span>
                                  <span className="text-xs text-gray-600 dark:text-gray-400 break-all flex-1">
                                    {error.originalUrl || 'No URL provided'}
                                  </span>
                                </div>
                                {error.reason && (
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs text-red-600 dark:text-red-400 font-medium">Reason:</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                      {error.reason}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 p-3 bg-red-100 dark:bg-red-800/30 border border-red-200 dark:border-red-700 rounded text-xs text-red-700 dark:text-red-300">
                          <strong>Common issues:</strong> Invalid URL format, duplicate URLs, missing http:// prefix, or server errors. Check the format and try again.
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </CardContent>
              </Card>

              {/* QR Export Card */}
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-indigo-600" />
                    Bulk QR Code Export
                    {!isPremium && <Crown className="h-4 w-4 text-yellow-600" />}
                  </CardTitle>
                  <CardDescription>
                    Generate and download QR codes for all your short URLs in one click
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                {!isPremium ? (
                  <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-dashed border-purple-300 dark:border-purple-600 rounded-lg text-center">
                    <Crown className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-300 mb-2">
                      Premium Feature
                    </h3>
                    <p className="text-purple-600 dark:text-purple-400 mb-4">
                      Generate and download QR codes for all your short URLs in one click. Perfect for marketing materials and offline sharing.
                    </p>
                    <Button 
                      onClick={() => window.location.href = "/subscription"}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    >
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade to Premium
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Export All QR Codes
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                        Generate QR codes for all {urls.length} of your shortened URLs. The export will include high-quality PNG images ready for printing or digital use.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700 dark:text-blue-300">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4" />
                          High-quality 200x200px images
                        </div>
                        <div className="flex items-center gap-2">
                          <FileDown className="h-4 w-4" />
                          JSON format with metadata
                        </div>
                      </div>
                    </div>
                    
                    {urls.length === 0 ? (
                      <div className="text-center py-8">
                        <QrCode className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">
                          No URLs to export. Create some shortened URLs first.
                        </p>
                      </div>
                    ) : (
                      <Button
                        onClick={() => bulkQrExportMutation.mutate()}
                        disabled={bulkQrExportMutation.isPending}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg"
                        data-testid="button-bulk-qr-export"
                      >
                        {bulkQrExportMutation.isPending ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Generating QR Codes...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <FileDown className="h-4 w-4" />
                            Export {urls.length} QR Codes
                          </div>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
            
            {/* Tools Section Banner Ad */}
            <ResponsiveAdBanner className="my-8" slot="6195502880" />
          </TabsContent>
        </Tabs>

        {/* Edit URL Dialog */}
        <Dialog open={!!editingUrl} onOpenChange={() => setEditingUrl(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit URL</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="editTitle">Title</Label>
                <Input
                  id="editTitle"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  data-testid="input-edit-title"
                />
              </div>
              <div>
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  data-testid="input-edit-description"
                />
              </div>
              <div>
                <Label htmlFor="editCustomCode">Custom Code</Label>
                <Input
                  id="editCustomCode"
                  value={editForm.customCode}
                  onChange={(e) => setEditForm({ ...editForm, customCode: e.target.value })}
                  data-testid="input-edit-custom-code"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingUrl(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleEditSubmit}
                  disabled={editUrlMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {editUrlMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Analytics Modal */}
        <AnalyticsModal
          urlId={analyticsUrlId}
          shortCode={analyticsShortCode}
          isOpen={analyticsModalOpen}
          onClose={() => setAnalyticsModalOpen(false)}
        />

        {/* Global Analytics Modal */}
        <GlobalAnalyticsModal
          open={globalAnalyticsModalOpen}
          onOpenChange={setGlobalAnalyticsModalOpen}
        />

        {/* Dashboard Bottom Banner Ad */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <ResponsiveAdBanner className="mt-8" slot="6195502880" />
        </div>
      </main>
    </div>
    </TooltipProvider>
  );
}
