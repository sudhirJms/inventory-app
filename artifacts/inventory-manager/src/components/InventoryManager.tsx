import { useState, useRef, useEffect, useMemo, useCallback, useTransition } from "react";
import Papa from "papaparse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, Plus, Upload, Download, Trash2, Edit2, 
  Settings, X, FileSpreadsheet, AlertCircle, Image as ImageIcon, Camera,
  Shield, Megaphone, Users, MessageSquare, Moon, Sun, LayoutGrid, List,
  RefreshCw, CheckCircle2
} from "lucide-react";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogFooter, DialogTrigger, DialogClose, DialogDescription
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const API = `${BASE}/api`;

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Part {
  id: string;
  partNumber: string;
  name: string;
  quantity: string | number;
  location: string;
  price: string | number;
  images: string[];
  [key: string]: any;
}

interface LocationReport {
  id?: number;
  partId: string;
  partNumber: string;
  reportedAt: number;
}

interface InventoryState {
  parts: Part[];
  headers: string[];
  announcement: string;
  showAnnouncement: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function InventoryManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // ─── Server data ───────────────────────────────────────────────────────────
  const { data: inv, isLoading } = useQuery<InventoryState>({
    queryKey: ["inventory"],
    queryFn: () => apiFetch("/inventory"),
    staleTime: 5000,
    refetchInterval: 15000,
  });

  const { data: reports = [], refetch: refetchReports } = useQuery<LocationReport[]>({
    queryKey: ["reports"],
    queryFn: () => apiFetch("/inventory/reports"),
    staleTime: 10000,
  });

  const parts: Part[] = inv?.parts ?? [];
  const csvHeaders: string[] = inv?.headers ?? ["partNumber","name","quantity","location","price"];
  const announcement: string = inv?.announcement ?? "";
  const showAnnouncementGlobal: boolean = inv?.showAnnouncement ?? true;

  // ─── Local UI state ────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // only set on SEARCH click/Enter
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchSuffixMode, setSearchSuffixMode] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState(false);

  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [adminPasswords] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("inventory_passwords") || '["AS0511"]'); }
    catch { return ["AS0511"]; }
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
  const [isMasterDashboardOpen, setIsMasterDashboardOpen] = useState(false);
  const [currentEditPart, setCurrentEditPart] = useState<Part | null>(null);
  const [activeImageGallery, setActiveImageGallery] = useState<{id: string, partId: string, images: string[]}>({id:'',partId:'',images:[]});
  const [galleryIndex, setGalleryIndex] = useState(0);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formImages, setFormImages] = useState<string[]>([]);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("inventory_darkmode");
      if (saved !== null) return saved === "true";
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [isGridView, setIsGridView] = useState(true);
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");
  const [editAnnouncement, setEditAnnouncement] = useState("");
  const [editShowAnnouncement, setEditShowAnnouncement] = useState(true);

  // ─── Dark mode effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("inventory_darkmode", String(isDarkMode));
  }, [isDarkMode]);

  // ─── Sync dashboard edit state when inv loads ──────────────────────────────
  useEffect(() => {
    if (inv) {
      setEditAnnouncement(inv.announcement);
      setEditShowAnnouncement(inv.showAnnouncement);
    }
  }, [inv?.announcement, inv?.showAnnouncement]);

  // ─── Suggestions (instant, just part numbers, no rendering lag) ───────────
  const suggestions = useMemo(() => {
    const q = searchInput.toLowerCase().trim();
    if (!q || parts.length === 0) return [];
    const matches: string[] = [];
    for (const part of parts) {
      const pn = (part.partNumber || "").toLowerCase();
      if (searchSuffixMode) {
        if (pn.endsWith(q)) matches.push(part.partNumber);
      } else {
        if (pn.includes(q)) matches.push(part.partNumber);
      }
      if (matches.length >= 8) break;
    }
    return matches;
  }, [searchInput, parts, searchSuffixMode]);

  const doSearch = useCallback(() => {
    if (!searchInput.trim()) return;
    setShowSuggestions(false);
    startTransition(() => setSearchQuery(searchInput.trim()));
  }, [searchInput]);

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const bulkMutation = useMutation({
    mutationFn: (data: { parts: Part[]; headers: string[] }) =>
      apiFetch("/inventory/parts/bulk", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const addPartMutation = useMutation({
    mutationFn: (part: Part) =>
      apiFetch("/inventory/parts", { method: "POST", body: JSON.stringify(part) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const updatePartMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiFetch(`/inventory/parts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const deletePartMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/inventory/parts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const announcementMutation = useMutation({
    mutationFn: (data: { announcement: string; showAnnouncement: boolean }) =>
      apiFetch("/inventory/announcement", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const addReportMutation = useMutation({
    mutationFn: (data: { partId: string; partNumber: string; reportedAt: number }) =>
      apiFetch("/inventory/reports", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const clearReportsMutation = useMutation({
    mutationFn: () => apiFetch("/inventory/reports", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  // ─── Filtered parts (only computed after SEARCH click) ────────────────────
  const filteredParts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return parts.filter(part => {
      const partNum = (part.partNumber || "").toLowerCase().trim();
      if (searchSuffixMode) {
        const last3 = partNum.slice(-3);
        const last4 = partNum.slice(-4);
        return last3 === query || last4 === query || partNum.endsWith(query);
      }
      return partNum.includes(query) || 
        (part.name || "").toLowerCase().includes(query);
    });
  }, [parts, searchQuery, searchSuffixMode]);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const handleDevModeToggle = (checked: boolean) => {
    if (checked) setShowPasswordPrompt(true);
    else setDevMode(false);
  };

  const handlePasswordSubmit = () => {
    if (adminPasswords.includes(passwordInput) || passwordInput === "skyadavjsr45@gmail.com") {
      setDevMode(true);
      setShowPasswordPrompt(false);
      setPasswordInput("");
      toast({ title: "Developer Mode Enabled", description: "You now have admin access." });
    } else {
      toast({ title: "Access Denied", description: "Incorrect password.", variant: "destructive" });
      setPasswordInput("");
    }
  };

  // ─── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0] as object);
          const cleanHeaders = headers.filter(h => h !== 'id' && h !== 'images');
          const partNumKey = cleanHeaders.find(h => 
            h.toLowerCase() === 'partnumber' || 
            h.toLowerCase() === 'part_number' || 
            h.toLowerCase() === 'part no' || 
            h.toLowerCase() === 'partno'
          ) || cleanHeaders[0];

          const parsedParts: Part[] = (results.data as any[]).map((row, index) => ({
            ...row,
            id: crypto.randomUUID(),
            partNumber: row[partNumKey] || `UNKNOWN-${index}`,
            images: row.images ? (() => { try { return JSON.parse(row.images); } catch { return []; } })() : []
          }));

          bulkMutation.mutate(
            { parts: parsedParts, headers: cleanHeaders },
            {
              onSuccess: () => toast({
                title: "CSV Uploaded",
                description: `Successfully loaded ${parsedParts.length} parts for all users.`,
              }),
              onError: (err) => toast({
                title: "Upload Failed", description: String(err), variant: "destructive"
              }),
            }
          );
        }
      },
      error: (error) => toast({ title: "Error reading CSV", description: error.message, variant: "destructive" }),
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const exportToCSV = () => {
    if (parts.length === 0) {
      toast({ title: "No data to export", description: "Please add some parts first.", variant: "destructive" });
      return;
    }
    // Use the stored headers (same columns as original upload e.g. PartNo,PartName,Location)
    const headers = csvHeaders.length > 0 ? csvHeaders : ["partNumber", "name", "location"];
    const exportData = parts.map(part => {
      const row: Record<string, string> = {};
      headers.forEach(h => {
        const val = (part as Record<string, any>)[h];
        row[h] = val === undefined || val === null ? "" : String(val);
      });
      return row;
    });
    const csv = Papa.unparse(exportData, { columns: headers });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "inventory_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: `Downloaded ${parts.length} parts as inventory_data.csv` });
  };


  // ─── Image handling ────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setFormImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeFormImage = (index: number) => setFormImages(prev => prev.filter((_, i) => i !== index));

  // ─── CRUD ──────────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this part?")) return;
    deletePartMutation.mutate(id, {
      onSuccess: () => toast({ title: "Part Deleted", description: "Record removed." }),
      onError: (err) => toast({ title: "Delete Failed", description: String(err), variant: "destructive" }),
    });
  };

  const openAddModal = () => {
    const initialForm: Record<string, string> = {};
    csvHeaders.forEach(h => { initialForm[h] = ""; });
    setFormData(initialForm);
    setFormImages([]);
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = () => {
    if (!formData.partNumber && !formData[csvHeaders[0]]) {
      toast({ title: "Validation Error", description: "Part number is required.", variant: "destructive" });
      return;
    }
    const newPart: Part = {
      id: crypto.randomUUID(),
      partNumber: formData.partNumber || formData[csvHeaders[0]],
      name: formData.name || "",
      quantity: formData.quantity || "0",
      location: formData.location || "",
      price: formData.price || "0",
      images: formImages,
      ...formData
    };
    addPartMutation.mutate(newPart, {
      onSuccess: () => {
        setIsAddModalOpen(false);
        toast({ title: "Part Added", description: "New part added for all users." });
      },
      onError: (err) => toast({ title: "Add Failed", description: String(err), variant: "destructive" }),
    });
  };

  const openEditModal = (part: Part) => {
    setCurrentEditPart(part);
    const initialForm: Record<string, string> = {};
    csvHeaders.forEach(h => { initialForm[h] = part[h]?.toString() || ""; });
    if (!initialForm.partNumber) initialForm.partNumber = part.partNumber;
    setFormData(initialForm);
    setFormImages(part.images || []);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!currentEditPart) return;
    const updated = { ...currentEditPart, ...formData, partNumber: formData.partNumber || currentEditPart.partNumber, images: formImages };
    updatePartMutation.mutate(
      { id: currentEditPart.id, data: updated },
      {
        onSuccess: () => {
          setIsEditModalOpen(false);
          setCurrentEditPart(null);
          toast({ title: "Part Updated", description: "Changes saved for all users." });
        },
        onError: (err) => toast({ title: "Update Failed", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handleFormChange = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }));

  const handleClearAllData = () => {
    if (!confirm("Are you sure you want to clear ALL inventory data? This cannot be undone.")) return;
    bulkMutation.mutate(
      { parts: [], headers: csvHeaders },
      {
        onSuccess: () => toast({ title: "Data Cleared", description: "All inventory records deleted." }),
        onError: (err) => toast({ title: "Clear Failed", description: String(err), variant: "destructive" }),
      }
    );
  };

  // ─── Announcement ──────────────────────────────────────────────────────────
  const showBanner = showAnnouncementGlobal && announcement && !dismissedAnnouncement;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDarkMode ? "dark" : ""} bg-neutral-50 dark:bg-neutral-950 p-4 md:p-8 font-sans`}>
      {/* Announcement Banner */}
      {showBanner && (
        <div className="max-w-5xl mx-auto mb-4 bg-primary text-primary-foreground p-3 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{announcement}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary-foreground/20 text-primary-foreground shrink-0" onClick={() => setDismissedAnnouncement(true)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-neutral-900 p-5 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
                Inventory Manager
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {isLoading ? "Loading..." : `${parts.length} parts loaded • shared across all users`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap w-full md:w-auto justify-end">
            {/* Dark mode toggle */}
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setIsDarkMode(!isDarkMode)}
              title="Toggle Theme"
              className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
            >
              {isDarkMode 
                ? <Sun className="w-4 h-4 text-amber-500" /> 
                : <Moon className="w-4 h-4 text-neutral-600" />
              }
            </Button>

            {/* Dev Mode toggle */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${devMode ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'}`}>
              <Shield className={`w-4 h-4 ${devMode ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500'}`} />
              <Label htmlFor="dev-mode" className={`text-sm font-medium cursor-pointer ${devMode ? 'text-amber-700 dark:text-amber-300' : ''}`}>Dev Mode</Label>
              <Switch 
                id="dev-mode" 
                checked={devMode}
                onCheckedChange={handleDevModeToggle}
                data-testid="toggle-devmode"
              />
            </div>

            {/* Admin actions */}
            {devMode && (
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-amber-200 dark:border-amber-800 font-medium"
                  onClick={() => setIsMasterDashboardOpen(true)}
                >
                  <Shield className="w-4 h-4 mr-1.5" />
                  Dashboard
                </Button>

                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload CSV"
                  data-testid="btn-upload-csv"
                  className="bg-white dark:bg-neutral-900 dark:border-neutral-700"
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={exportToCSV}
                  title="Download current inventory as CSV"
                  data-testid="btn-download-csv"
                  className="bg-white dark:bg-neutral-900 dark:border-neutral-700 font-medium"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Download CSV
                </Button>
  
                <Button 
                  variant="destructive" 
                  size="icon"
                  onClick={handleClearAllData}
                  title="Clear All Data"
                  className="shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Search Section */}
        <Card className="shadow-sm border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-neutral-800 dark:text-neutral-200">Search Parts</Label>
                <div className="flex items-center gap-2.5">
                  <Label htmlFor="suffix-mode" className="text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer select-none">
                    Last 3/4 Digits
                  </Label>
                  <Switch 
                    id="suffix-mode" 
                    checked={searchSuffixMode}
                    onCheckedChange={setSearchSuffixMode}
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none z-10" />
                  <Input 
                    placeholder={searchSuffixMode ? "Enter last 3 or 4 digits..." : "Enter Part Number..."}
                    className="pl-11 h-12 text-base border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-primary/20 dark:focus:ring-primary/30 transition-all"
                    value={searchInput}
                    onChange={(e) => { setSearchInput(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={(e) => { if (e.key === "Enter") doSearch(); if (e.key === "Escape") setShowSuggestions(false); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    data-testid="input-search"
                    autoFocus
                  />
                  {searchInput && (
                    <button 
                      onClick={() => { setSearchInput(""); setSearchQuery(""); setShowSuggestions(false); }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors z-10"
                      data-testid="btn-clear-search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {/* Suggestions dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg z-50 overflow-hidden">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onMouseDown={() => {
                            setSearchInput(s);
                            setShowSuggestions(false);
                            startTransition(() => setSearchQuery(s));
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm font-mono font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 flex items-center gap-2 transition-colors"
                        >
                          <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <Button 
                  className="h-12 px-8 font-semibold tracking-wide text-sm bg-primary hover:bg-primary/90 transition-all" 
                  onClick={doSearch}
                  data-testid="btn-search"
                >
                  SEARCH
                </Button>
                
                {devMode && (
                  <Button 
                    variant="secondary" 
                    className="h-12 px-5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 font-medium"
                    onClick={openAddModal}
                    data-testid="btn-add-part"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New
                  </Button>
                )}
              </div>

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading inventory from server...
                </div>
              )}
              {!isLoading && parts.length > 0 && !searchQuery && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  {parts.length} parts ready — type above to filter
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-4">
          {/* Results header or empty state */}
          {searchQuery ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                  Search Results
                  <Badge variant="secondary" className="ml-2 text-xs">{filteredParts.length}</Badge>
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {searchSuffixMode ? `Last 3/4 digits matching "${searchQuery}"` : `Part numbers containing "${searchQuery}"`}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-1 hidden sm:flex">
                <Button variant="ghost" size="icon" className={`h-7 w-7 rounded-md transition-colors ${isGridView ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`} onClick={() => setIsGridView(true)} title="Grid View">
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className={`h-7 w-7 rounded-md transition-colors ${!isGridView ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`} onClick={() => setIsGridView(false)} title="List View">
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl bg-neutral-50/50 dark:bg-neutral-900/20 text-center gap-3">
              <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-full">
                <Search className="w-8 h-8 text-neutral-400" />
              </div>
              {isLoading ? (
                <>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Loading inventory...</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Fetching data from server</p>
                </>
              ) : parts.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">No inventory yet</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                    {devMode ? "Upload a CSV file to get started." : "No inventory uploaded yet. Contact your admin."}
                  </p>
                  {devMode && (
                    <Button variant="outline" className="mt-2" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-2" /> Upload CSV
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Ready to search</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                    {parts.length} parts loaded. Type a part number above — suggestions will appear. Press SEARCH to see results.
                  </p>
                </>
              )}
            </div>
          )}

          {/* No results for search */}
          {searchQuery && filteredParts.length === 0 && (
            <div className="p-10 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-full w-fit mx-auto mb-3">
                <AlertCircle className="w-7 h-7 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">No parts found</h3>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
                {searchSuffixMode 
                  ? `No part ends with "${searchQuery}" (last 3/4 digits mode is on)`
                  : `No part number contains "${searchQuery}"`}
              </p>
              {devMode && (
                <Button className="mt-4" onClick={openAddModal}>
                  <Plus className="w-4 h-4 mr-2" /> Add "{searchQuery}" as New Part
                </Button>
              )}
            </div>
          )}

          {/* Parts grid/list */}
          <div className={isGridView ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-3"}>
            {filteredParts.map((part) => (
              <Card key={part.id} className={`overflow-hidden shadow-sm hover:shadow-md transition-all border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 ${!isGridView ? 'flex-row' : ''}`}>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold font-mono tracking-tight text-primary mb-0.5">
                        {part.partNumber}
                      </h3>
                      {part.name && <p className="text-base font-medium text-neutral-700 dark:text-neutral-300">{part.name}</p>}
                    </div>
                    
                    {devMode ? (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" onClick={() => openEditModal(part)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" onClick={() => handleDelete(part.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 h-8 rounded-lg shrink-0"
                        onClick={() => {
                          const alreadyReported = reports.some(r => r.partId === part.id);
                          if (alreadyReported) {
                            toast({ title: "Already Reported", description: "This part's location has already been reported." });
                            return;
                          }
                          addReportMutation.mutate(
                            { partId: part.id, partNumber: part.partNumber, reportedAt: Date.now() },
                            { onSuccess: () => toast({ title: "Report Submitted", description: "Admin has been notified." }) }
                          );
                        }}
                      >
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Report Wrong Location
                      </Button>
                    )}
                  </div>

                  {/* Fields grid */}
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 grid grid-cols-2 gap-y-3 gap-x-6 border border-neutral-100 dark:border-neutral-700/50 mb-4">
                    {['quantity', 'location', 'price'].map((key) => {
                      if (part[key] !== undefined && part[key] !== '') {
                        return (
                          <div key={key} className="space-y-0.5">
                            <p className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{key}</p>
                            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                              {key === 'price' ? `$${part[key]}` : part[key]}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })}
                    {Object.entries(part).map(([key, value]) => {
                      if (!['id','partNumber','name','quantity','location','price','images'].includes(key) && value) {
                        return (
                          <div key={key} className="space-y-0.5">
                            <p className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{key}</p>
                            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 break-words">{String(value)}</p>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>

                  {/* Photos */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Photos ({part.images?.length || 0})
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {part.images?.map((img, i) => (
                        <div 
                          key={i} 
                          className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700 cursor-pointer group shadow-sm hover:shadow-md transition-shadow"
                          onClick={() => { setActiveImageGallery({id: part.id, partId: part.partNumber, images: part.images}); setGalleryIndex(i); setIsImageGalleryOpen(true); }}
                        >
                          <img src={img} alt={`Part ${part.partNumber} photo ${i+1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                        </div>
                      ))}
                      {devMode && (
                        <div 
                          onClick={() => { openEditModal(part); }}
                          className="w-16 h-16 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </div>
                      )}
                      {(!part.images || part.images.length === 0) && !devMode && (
                        <div className="w-full py-3 text-center text-xs text-neutral-400 dark:text-neutral-500 italic">
                          No photos
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* ── Add Modal ── */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <DialogTitle className="text-xl dark:text-white">Add New Part</DialogTitle>
            <DialogDescription className="dark:text-neutral-400">This part will be visible to all users immediately.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-3 mb-2">
              <Label className="text-sm font-medium dark:text-neutral-300">Photos</Label>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {formImages.map((img, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                    <button onClick={() => removeFormImage(i)} className="absolute top-1 right-1 bg-black/60 p-1 rounded-full hover:bg-red-500 text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div onClick={() => imageInputRef.current?.click()} className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 transition-colors">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[10px] uppercase font-semibold">Add</span>
                </div>
                <input type="file" accept="image/*" multiple ref={imageInputRef} onChange={handleImageUpload} className="hidden" />
              </div>
            </div>
            {csvHeaders.map((header) => (
              <div key={header} className="grid gap-2">
                <Label htmlFor={`add-${header}`} className="capitalize dark:text-neutral-300">{header}</Label>
                <Input id={`add-${header}`} value={formData[header] || ""} onChange={(e) => handleFormChange(header, e.target.value)} placeholder={`Enter ${header}...`} required={header === 'partNumber' || header === csvHeaders[0]} className="dark:bg-neutral-800 dark:border-neutral-700" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)} className="dark:border-neutral-700 dark:text-neutral-300">Cancel</Button>
            <Button onClick={handleSaveAdd} disabled={addPartMutation.isPending}>
              {addPartMutation.isPending ? "Saving..." : "Save Part"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ── */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <DialogTitle className="text-xl dark:text-white">Edit Part — {currentEditPart?.partNumber}</DialogTitle>
            <DialogDescription className="dark:text-neutral-400">Changes will be visible to all users immediately.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-3 mb-2">
              <Label className="text-sm font-medium dark:text-neutral-300">Photos</Label>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {formImages.map((img, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700">
                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                    <button onClick={() => removeFormImage(i)} className="absolute top-1 right-1 bg-black/60 p-1 rounded-full hover:bg-red-500 text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div onClick={() => imageInputRef.current?.click()} className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 transition-colors">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[10px] uppercase font-semibold">Add</span>
                </div>
                <input type="file" accept="image/*" multiple ref={imageInputRef} onChange={handleImageUpload} className="hidden" />
              </div>
            </div>
            {csvHeaders.map((header) => (
              <div key={header} className="grid gap-2">
                <Label htmlFor={`edit-${header}`} className="capitalize dark:text-neutral-300">{header}</Label>
                <Input id={`edit-${header}`} value={formData[header] || ""} onChange={(e) => handleFormChange(header, e.target.value)} placeholder={`Enter ${header}...`} className="dark:bg-neutral-800 dark:border-neutral-700" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="dark:border-neutral-700 dark:text-neutral-300">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updatePartMutation.isPending}>
              {updatePartMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password Prompt ── */}
      <Dialog open={showPasswordPrompt} onOpenChange={(open) => { if (!open) { setShowPasswordPrompt(false); setPasswordInput(""); } }}>
        <DialogContent className="sm:max-w-[380px] dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <DialogTitle className="dark:text-white">Admin Access Required</DialogTitle>
            </div>
            <DialogDescription className="dark:text-neutral-400">Enter the administrator password to enable Dev Mode.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
              placeholder="Enter password..."
              className="dark:bg-neutral-800 dark:border-neutral-700"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPasswordPrompt(false); setPasswordInput(""); }} className="dark:border-neutral-700 dark:text-neutral-300">Cancel</Button>
            <Button onClick={handlePasswordSubmit} className="bg-amber-600 hover:bg-amber-700 text-white">Login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Image Gallery Modal ── */}
      <Dialog open={isImageGalleryOpen} onOpenChange={setIsImageGalleryOpen}>
        <DialogContent className="sm:max-w-[600px] dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <ImageIcon className="w-5 h-5" />
              Part {activeImageGallery.partId} — Photos
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {activeImageGallery.images.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="relative rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 aspect-video">
                  <img 
                    src={activeImageGallery.images[galleryIndex]} 
                    alt={`Photo ${galleryIndex + 1}`} 
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                    {galleryIndex + 1} / {activeImageGallery.images.length}
                  </div>
                </div>
                {activeImageGallery.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {activeImageGallery.images.map((img, i) => (
                      <div 
                        key={i} 
                        onClick={() => setGalleryIndex(i)}
                        className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-pointer border-2 transition-all ${i === galleryIndex ? 'border-primary shadow-md' : 'border-neutral-200 dark:border-neutral-700 opacity-60 hover:opacity-100'}`}
                      >
                        <img src={img} alt={`thumb ${i+1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Master Dashboard ── */}
      <Dialog open={isMasterDashboardOpen} onOpenChange={setIsMasterDashboardOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <DialogTitle className="text-xl dark:text-white">Admin Dashboard</DialogTitle>
                <DialogDescription className="dark:text-neutral-400">Manage inventory settings visible to all users</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Dashboard Tabs */}
          <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1 mt-2">
            {[
              { id: "overview", label: "Overview", icon: LayoutGrid },
              { id: "announcement", label: "Announcement", icon: Megaphone },
              { id: "reports", label: "Reports", icon: AlertCircle },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveDashboardTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeDashboardTab === tab.id 
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm' 
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "reports" && reports.length > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-4 min-w-4 px-1">{reports.length}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeDashboardTab === "overview" && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider mb-1">Total Parts</p>
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{parts.length}</p>
                </div>
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-800">
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold uppercase tracking-wider mb-1">Open Reports</p>
                  <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{reports.length}</p>
                </div>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider mb-1">CSV Columns</p>
                  <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{csvHeaders.length}</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wider mb-1">With Photos</p>
                  <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">{parts.filter(p => p.images?.length > 0).length}</p>
                </div>
              </div>

              <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">CSV Columns</p>
                <div className="flex flex-wrap gap-2">
                  {csvHeaders.map(h => (
                    <Badge key={h} variant="secondary" className="text-xs dark:bg-neutral-700 dark:text-neutral-300">{h}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 dark:border-neutral-700 dark:text-neutral-300" onClick={exportToCSV}>
                  <Download className="w-4 h-4 mr-2" /> Download CSV
                </Button>
                <Button variant="destructive" onClick={handleClearAllData}>
                  <Trash2 className="w-4 h-4 mr-2" /> Clear All Data
                </Button>
              </div>
            </div>
          )}

          {/* Announcement Tab */}
          {activeDashboardTab === "announcement" && (
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3">
                <Label className="text-sm font-semibold dark:text-neutral-300">Announcement Text</Label>
                <textarea
                  className="w-full p-3 rounded-lg border border-neutral-200 dark:border-neutral-600 text-sm bg-white dark:bg-neutral-900 dark:text-neutral-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  rows={3}
                  value={editAnnouncement}
                  onChange={(e) => setEditAnnouncement(e.target.value)}
                  placeholder="Enter announcement message..."
                />
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={editShowAnnouncement}
                    onCheckedChange={setEditShowAnnouncement}
                    id="show-announcement"
                  />
                  <Label htmlFor="show-announcement" className="text-sm dark:text-neutral-400 cursor-pointer">
                    Show announcement banner to all users
                  </Label>
                </div>
              </div>

              {/* Preview */}
              {editShowAnnouncement && editAnnouncement && (
                <div className="bg-primary text-primary-foreground p-3 rounded-xl flex items-center gap-2 text-sm">
                  <Megaphone className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{editAnnouncement}</span>
                </div>
              )}

              <Button 
                className="w-full"
                onClick={() => {
                  announcementMutation.mutate(
                    { announcement: editAnnouncement, showAnnouncement: editShowAnnouncement },
                    { 
                      onSuccess: () => {
                        setDismissedAnnouncement(false);
                        toast({ title: "Announcement Updated", description: "All users will see the new announcement." });
                      },
                      onError: (err) => toast({ title: "Update Failed", description: String(err), variant: "destructive" }),
                    }
                  );
                }}
                disabled={announcementMutation.isPending}
              >
                {announcementMutation.isPending ? "Saving..." : "Save & Publish Announcement"}
              </Button>
            </div>
          )}

          {/* Reports Tab */}
          {activeDashboardTab === "reports" && (
            <div className="space-y-3 mt-4">
              {reports.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 dark:text-neutral-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium">No reports submitted</p>
                  <p className="text-sm mt-1">All locations are verified.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {reports.map((r) => {
                      const reportedPart = parts.find(p => p.id === r.partId || p.partNumber === r.partNumber);
                      return (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-800">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm font-mono text-orange-900 dark:text-orange-200">{r.partNumber}</p>
                            <p className="text-xs text-orange-600 dark:text-orange-400">
                              Reported {new Date(r.reportedAt).toLocaleString()}
                            </p>
                            {reportedPart?.location && (
                              <p className="text-xs text-orange-500 dark:text-orange-500 mt-0.5">
                                Current location: <span className="font-medium">{reportedPart.location}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {reportedPart && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                                onClick={() => {
                                  setIsMasterDashboardOpen(false);
                                  setTimeout(() => openEditModal(reportedPart), 200);
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5 mr-1" />
                                Edit Part
                              </Button>
                            )}
                            <AlertCircle className="w-5 h-5 text-orange-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => clearReportsMutation.mutate(undefined, {
                      onSuccess: () => toast({ title: "Reports Cleared", description: "All reports have been resolved." })
                    })}
                    disabled={clearReportsMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {clearReportsMutation.isPending ? "Clearing..." : "Clear All Reports"}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
