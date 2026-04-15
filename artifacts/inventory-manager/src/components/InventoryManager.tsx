import { useState, useRef, useEffect, useMemo, useCallback, useTransition } from "react";
import Papa from "papaparse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, Plus, Upload, Download, Trash2, Edit2, 
  Settings, X, FileSpreadsheet, AlertCircle, Image as ImageIcon, Camera,
  Shield, Megaphone, Users, MessageSquare, Moon, Sun, LayoutGrid, List,
  RefreshCw, CheckCircle2, Crop, FolderOpen
} from "lucide-react";
import { CropImageModal } from "./CropImageModal";
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

interface PasswordEntry {
  id: string;
  label: string;
  password: string;
  permissions: { canSuggestLocations: boolean; canUploadPhotos: boolean };
  createdAt: number;
}

interface PendingChange {
  id: number;
  type: "location" | "photo" | "add_part";
  partId: string;
  partNumber: string;
  oldValue?: string | null;
  newValue?: string | null;
  photoData?: string | null;
  photoName?: string | null;
  submittedAt: number;
  status: string;
}

interface InventoryState {
  parts: Part[];
  headers: string[];
  announcement: string;
  showAnnouncement: boolean;
  devUserCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function InventoryManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);         // Add modal - gallery
  const imageCameraRef = useRef<HTMLInputElement>(null);        // Add modal - camera
  const imageInputEditRef = useRef<HTMLInputElement>(null);     // Edit modal - gallery
  const imageCameraEditRef = useRef<HTMLInputElement>(null);    // Edit modal - camera
  const bulkPhotoInputRef = useRef<HTMLInputElement>(null);     // Bulk photo upload
  const [, startTransition] = useTransition();

  // ─── Server data ───────────────────────────────────────────────────────────
  const { data: inv, isLoading } = useQuery<InventoryState>({
    queryKey: ["inventory"],
    queryFn: () => apiFetch("/inventory"),
    staleTime: 0,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchSuffixMode, setSearchSuffixMode] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState(false);

  // Auth
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetMasterInput, setResetMasterInput] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetStep, setResetStep] = useState<"verify"|"set">("verify");

  // Password manager
  const [isPasswordManagerOpen, setIsPasswordManagerOpen] = useState(false);
  const [masterInput, setMasterInput] = useState("");
  const [masterVerified, setMasterVerified] = useState(false);
  const [passwordsList, setPasswordsList] = useState<PasswordEntry[]>([]);
  const [newPwLabel, setNewPwLabel] = useState("");
  const [newPwValue, setNewPwValue] = useState("");
  const [newPwPermissions, setNewPwPermissions] = useState({ canSuggestLocations: true, canUploadPhotos: true });
  const [showGeneratedPw, setShowGeneratedPw] = useState<string|null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
  const [isMasterDashboardOpen, setIsMasterDashboardOpen] = useState(false);
  const [isBulkPhotoOpen, setIsBulkPhotoOpen] = useState(false);
  const [bulkPhotoProgress, setBulkPhotoProgress] = useState<{matched: number; unmatched: string[]; total: number} | null>(null);
  const [currentEditPart, setCurrentEditPart] = useState<Part | null>(null);
  const [activeImageGallery, setActiveImageGallery] = useState<{id: string, partId: string, images: string[]}>({id:'',partId:'',images:[]});
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Suggest location change (non-dev)
  const [isSuggestLocationOpen, setIsSuggestLocationOpen] = useState(false);
  const [suggestPart, setSuggestPart] = useState<Part | null>(null);
  const [suggestNewLocation, setSuggestNewLocation] = useState("");

  // Suggest photo upload (non-dev)
  const [isUserPhotoUploadOpen, setIsUserPhotoUploadOpen] = useState(false);
  const [userPhotoUploadPart, setUserPhotoUploadPart] = useState<Part | null>(null);
  const userPhotoUploadInputRef = useRef<HTMLInputElement>(null); // camera
  const userPhotoGalleryRef = useRef<HTMLInputElement>(null);     // gallery
  const [userPhotoPreview, setUserPhotoPreview] = useState<{base64: string; name: string} | null>(null);

  // Rename photo (dev approval)
  const [renamingPhotoId, setRenamingPhotoId] = useState<number | null>(null);
  const [renamePhotoName, setRenamePhotoName] = useState("");

  // Crop modal
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropFor, setCropFor] = useState<"form" | "userUpload" | "suggestPart">("form");

  // Suggest New Part (public)
  const [isSuggestNewPartOpen, setIsSuggestNewPartOpen] = useState(false);
  const [suggestPartForm, setSuggestPartForm] = useState<Record<string, string>>({});
  const [suggestPartImages, setSuggestPartImages] = useState<string[]>([]);
  const suggestPartImageRef = useRef<HTMLInputElement>(null);
  const suggestPartCameraRef = useRef<HTMLInputElement>(null);

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

  // Pending changes
  const { data: pendingList = [], refetch: refetchPending } = useQuery<PendingChange[]>({
    queryKey: ["pending"],
    queryFn: () => apiFetch("/inventory/pending"),
    staleTime: 8000,
    refetchInterval: devMode ? 10000 : false,
    enabled: devMode,
  });

  const submitPendingMutation = useMutation({
    mutationFn: (data: Partial<PendingChange>) =>
      apiFetch("/inventory/pending", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending"] }),
  });

  const approvePendingMutation = useMutation({
    mutationFn: ({ id, approvedName }: { id: number; approvedName?: string }) =>
      apiFetch(`/inventory/pending/${id}/approve`, { method: "POST", body: JSON.stringify({ approvedName }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pending"] }); qc.invalidateQueries({ queryKey: ["inventory"] }); },
  });

  const rejectPendingMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/pending/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending"] }),
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

  const handlePasswordSubmit = async () => {
    if (!passwordInput.trim()) return;
    try {
      const result = await apiFetch("/inventory/passwords/check", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput }),
      });
      if (result.valid) {
        setDevMode(true);
        setShowPasswordPrompt(false);
        setPasswordInput("");
        setShowResetFlow(false);
        toast({ title: "Developer Mode Enabled", description: result.label ? `Welcome, ${result.label}!` : "You now have admin access." });
      } else {
        toast({ title: "Access Denied", description: "Incorrect password.", variant: "destructive" });
        setPasswordInput("");
      }
    } catch {
      toast({ title: "Error", description: "Could not verify password.", variant: "destructive" });
    }
  };

  // ─── Password reset flow ────────────────────────────────────────────────────
  const handleResetVerify = async () => {
    if (resetMasterInput !== "skyadavjsr45@gmail.com") {
      toast({ title: "Wrong Master Password", variant: "destructive" });
      return;
    }
    setResetStep("set");
  };

  // ─── Password manager ───────────────────────────────────────────────────────
  const handleMasterVerify = async () => {
    try {
      const result = await apiFetch("/inventory/passwords/verify", {
        method: "POST",
        body: JSON.stringify({ masterPassword: masterInput }),
      });
      setPasswordsList(result.passwords);
      setMasterVerified(true);
    } catch {
      toast({ title: "Invalid Master Password", variant: "destructive" });
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
    const pw = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setNewPwValue(pw);
    setShowGeneratedPw(pw);
  };

  const handleAddPassword = async () => {
    if (!newPwValue.trim()) { toast({ title: "Enter a password", variant: "destructive" }); return; }
    try {
      const result = await apiFetch("/inventory/passwords", {
        method: "POST",
        body: JSON.stringify({ masterPassword: masterInput, label: newPwLabel || "User", password: newPwValue, permissions: newPwPermissions }),
      });
      setPasswordsList(prev => [...prev, result.entry]);
      setNewPwLabel(""); setNewPwValue(""); setShowGeneratedPw(null);
      toast({ title: "Password Added", description: `Label: ${result.entry.label}` });
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
  };

  const handleDeletePassword = async (id: string) => {
    if (!confirm("Delete this password?")) return;
    try {
      await apiFetch(`/inventory/passwords/${id}`, { method: "DELETE", body: JSON.stringify({ masterPassword: masterInput }) });
      setPasswordsList(prev => prev.filter(p => p.id !== id));
      toast({ title: "Deleted" });
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!resetNewPassword.trim()) { toast({ title: "Enter new password", variant: "destructive" }); return; }
    try {
      await apiFetch("/inventory/passwords/reset", { method: "PUT", body: JSON.stringify({ masterPassword: masterInput, id, newPassword: resetNewPassword }) });
      setPasswordsList(prev => prev.map(p => p.id === id ? { ...p, password: resetNewPassword } : p));
      setResetNewPassword("");
      toast({ title: "Password Updated" });
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
  };

  // ─── Pending change submission (non-dev) ────────────────────────────────────
  const handleSuggestLocationSubmit = () => {
    if (!suggestPart || !suggestNewLocation.trim()) return;
    submitPendingMutation.mutate({
      type: "location",
      partId: suggestPart.id,
      partNumber: suggestPart.partNumber,
      oldValue: suggestPart.location || String((suggestPart as any).Location || ""),
      newValue: suggestNewLocation.trim(),
    }, {
      onSuccess: () => {
        setIsSuggestLocationOpen(false);
        setSuggestNewLocation("");
        setSuggestPart(null);
        toast({ title: "Suggestion Sent", description: "Admin will review your location change." });
      },
      onError: (e) => toast({ title: "Failed", description: String(e), variant: "destructive" }),
    });
  };

  const handleUserPhotoSubmit = () => {
    if (!userPhotoUploadPart || !userPhotoPreview) return;
    submitPendingMutation.mutate({
      type: "photo",
      partId: userPhotoUploadPart.id,
      partNumber: userPhotoUploadPart.partNumber,
      photoData: userPhotoPreview.base64,
      photoName: userPhotoPreview.name,
    }, {
      onSuccess: () => {
        setIsUserPhotoUploadOpen(false);
        setUserPhotoPreview(null);
        setUserPhotoUploadPart(null);
        toast({ title: "Photo Submitted", description: "Admin will review and approve your photo." });
      },
      onError: (e) => toast({ title: "Failed", description: String(e), variant: "destructive" }),
    });
  };

  const handleSuggestNewPartSubmit = () => {
    const firstKey = Object.keys(suggestPartForm)[0] || "partNumber";
    const partNum = suggestPartForm.partNumber || suggestPartForm[firstKey] || "";
    if (!partNum.trim()) {
      toast({ title: "Part number required", variant: "destructive" });
      return;
    }
    const partData = { ...suggestPartForm, images: suggestPartImages };
    submitPendingMutation.mutate({
      type: "add_part",
      partId: "",
      partNumber: partNum,
      newValue: JSON.stringify(partData),
    }, {
      onSuccess: () => {
        setIsSuggestNewPartOpen(false);
        setSuggestPartForm({});
        setSuggestPartImages([]);
        toast({ title: "Suggestion Sent!", description: "Admin will review and add this part." });
      },
      onError: (e) => toast({ title: "Failed", description: String(e), variant: "destructive" }),
    });
  };

  // ─── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      // Strip BOM + whitespace from header names (Excel CSVs often have BOM)
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          toast({ title: "Empty CSV", description: "The file has no data rows.", variant: "destructive" });
          return;
        }
        const headers = Object.keys(results.data[0] as object);
        const cleanHeaders = headers.filter(h => h !== 'id' && h !== 'images');

        if (cleanHeaders.length === 0) {
          toast({ title: "Invalid CSV", description: "No valid columns found. Check the file format.", variant: "destructive" });
          return;
        }

        const partNumKey = cleanHeaders.find(h => {
          const l = h.toLowerCase();
          return l === 'partnumber' || l === 'part_number' || l === 'part no' || l === 'partno' || l === 'part number';
        }) || cleanHeaders[0];

        const parsedParts: Part[] = (results.data as any[]).map((row: any, index) => ({
          ...row,
          id: crypto.randomUUID(),
          partNumber: String(row[partNumKey] || `UNKNOWN-${index}`).trim(),
          name: row.name || row.PartName || row.partname || row.Name || row["Part Name"] || "",
          location: row.location || row.Location || "",
          quantity: row.quantity || row.Quantity || "0",
          price: row.price || row.Price || "0",
          images: row.images ? (() => { try { return JSON.parse(row.images); } catch { return []; } })() : [],
        }));

        bulkMutation.mutate(
          { parts: parsedParts, headers: cleanHeaders },
          {
            onSuccess: () => toast({
              title: "CSV Uploaded ✓",
              description: `${parsedParts.length} parts loaded for all users.`,
            }),
            onError: (err) => toast({
              title: "Upload Failed", description: String(err), variant: "destructive"
            }),
          }
        );
      },
      error: (error) => toast({ title: "Error reading CSV", description: error.message, variant: "destructive" }),
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Bulk photo upload (match by filename = partno.jpg) ────────────────────
  const handleBulkPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBulkPhotoProgress({ matched: 0, unmatched: [], total: files.length });

    const readFile = (file: File): Promise<{ partNumber: string; base64: string; filename: string }> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({
          partNumber: file.name.replace(/\.[^/.]+$/, "").replace(/_\d+$/, "").trim(),
          base64: reader.result as string,
          filename: file.name,
        });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    Promise.all(files.map(readFile)).then(async (fileData) => {
      const unmatched: string[] = [];
      let matched = 0;

      // Group files by part number (multiple photos for same part)
      const byPart = new Map<string, { part: Part; newImages: string[] }>();
      for (const { partNumber, base64, filename } of fileData) {
        const part = parts.find(p =>
          (p.partNumber || "").toLowerCase() === partNumber.toLowerCase()
        );
        if (!part) {
          unmatched.push(filename);
          continue;
        }
        if (!byPart.has(part.id)) {
          byPart.set(part.id, { part, newImages: [] });
        }
        byPart.get(part.id)!.newImages.push(base64);
        matched++;
      }

      // Update each matched part sequentially
      for (const { part, newImages } of byPart.values()) {
        const updatedImages = [...(part.images || []), ...newImages];
        await apiFetch(`/inventory/parts/${part.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...part, images: updatedImages }),
        }).catch(() => {});
      }

      await qc.invalidateQueries({ queryKey: ["inventory"] });
      setBulkPhotoProgress({ matched, unmatched, total: files.length });

      toast({
        title: matched > 0 ? `${matched} Photos Saved!` : "No Photos Matched",
        description: unmatched.length > 0
          ? `${unmatched.length} file(s) not matched: ${unmatched.slice(0, 3).join(", ")}${unmatched.length > 3 ? "..." : ""}`
          : `All ${matched} photos added to their parts.`,
        variant: matched > 0 ? "default" : "destructive",
      });
    });

    if (bulkPhotoInputRef.current) bulkPhotoInputRef.current.value = "";
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
  const pickImageForCrop = (e: React.ChangeEvent<HTMLInputElement>, target: "form" | "userUpload" | "suggestPart" = "form") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    (e.target as HTMLInputElement).value = "";
    if (files.length === 1) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCropFor(target);
        setCropSource(reader.result as string);
      };
      reader.readAsDataURL(files[0]);
    } else {
      // Multiple files: add without crop
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (target === "form") setFormImages(prev => [...prev, reader.result as string]);
          else if (target === "suggestPart") setSuggestPartImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    if (cropFor === "form") {
      setFormImages(prev => [...prev, croppedDataUrl]);
    } else if (cropFor === "userUpload") {
      setUserPhotoPreview({ base64: croppedDataUrl, name: "photo.jpg" });
    } else if (cropFor === "suggestPart") {
      setSuggestPartImages(prev => [...prev, croppedDataUrl]);
    }
    setCropSource(null);
  };

  const handleUserPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickImageForCrop(e, "userUpload");
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
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload CSV file"
                  data-testid="btn-upload-csv"
                  className="bg-white dark:bg-neutral-900 dark:border-neutral-700 font-medium"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Upload CSV
                </Button>
                <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setBulkPhotoProgress(null); setIsBulkPhotoOpen(true); }}
                  title="Upload photos by part number filename"
                  className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 border-purple-200 dark:border-purple-800 font-medium"
                >
                  <Camera className="w-4 h-4 mr-1.5" />
                  Photo Upload
                </Button>
                
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

            {/* Non-dev quick actions */}
            {!devMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSuggestPartForm(Object.fromEntries(csvHeaders.map(h => [h, ""]))); setSuggestPartImages([]); setIsSuggestNewPartOpen(true); }}
                className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800 font-medium"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Suggest New Part
              </Button>
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
                      <div className="flex flex-col gap-1 shrink-0 items-end">
                        <Button 
                          variant="ghost" size="sm"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 h-7 rounded-lg px-2"
                          onClick={() => { setSuggestPart(part); setSuggestNewLocation(part.location || String((part as any).Location || "")); setIsSuggestLocationOpen(true); }}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Suggest Location
                        </Button>
                        <Button 
                          variant="ghost" size="sm"
                          className="text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 h-7 rounded-lg px-2"
                          onClick={() => { setUserPhotoUploadPart(part); setUserPhotoPreview(null); setIsUserPhotoUploadOpen(true); }}
                        >
                          <Camera className="w-3 h-3 mr-1" />
                          Add Photo
                        </Button>
                      </div>
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
                <div className="flex flex-col gap-1.5 shrink-0">
                  <div onClick={() => imageCameraRef.current?.click()} className="w-20 h-9 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 flex items-center justify-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors gap-1.5">
                    <Camera className="w-4 h-4" />
                    <span className="text-[10px] font-semibold">Camera</span>
                  </div>
                  <div onClick={() => imageInputRef.current?.click()} className="w-20 h-9 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 transition-colors gap-1.5">
                    <FolderOpen className="w-4 h-4" />
                    <span className="text-[10px] font-semibold">Gallery</span>
                  </div>
                </div>
                <input type="file" accept="image/*" capture="environment" ref={imageCameraRef} onChange={(e) => pickImageForCrop(e, "form")} className="hidden" />
                <input type="file" accept="image/*" multiple ref={imageInputRef} onChange={(e) => pickImageForCrop(e, "form")} className="hidden" />
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
                <div className="flex flex-col gap-1.5 shrink-0">
                  <div onClick={() => imageCameraEditRef.current?.click()} className="w-20 h-9 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 flex items-center justify-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors gap-1.5">
                    <Camera className="w-4 h-4" />
                    <span className="text-[10px] font-semibold">Camera</span>
                  </div>
                  <div onClick={() => imageInputEditRef.current?.click()} className="w-20 h-9 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 transition-colors gap-1.5">
                    <FolderOpen className="w-4 h-4" />
                    <span className="text-[10px] font-semibold">Gallery</span>
                  </div>
                </div>
                <input type="file" accept="image/*" capture="environment" ref={imageCameraEditRef} onChange={(e) => pickImageForCrop(e, "form")} className="hidden" />
                <input type="file" accept="image/*" multiple ref={imageInputEditRef} onChange={(e) => pickImageForCrop(e, "form")} className="hidden" />
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
      <Dialog open={showPasswordPrompt} onOpenChange={(open) => { if (!open) { setShowPasswordPrompt(false); setPasswordInput(""); setShowResetFlow(false); setResetStep("verify"); setResetMasterInput(""); setResetNewPassword(""); } }}>
        <DialogContent className="sm:max-w-[400px] dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <DialogTitle className="dark:text-white">{showResetFlow ? "Reset Password" : "Admin Access Required"}</DialogTitle>
                <DialogDescription className="dark:text-neutral-400 text-xs">
                  {showResetFlow ? "Master password required to reset" : "Enter your developer password"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {!showResetFlow ? (
            <>
              <div className="py-3 space-y-3">
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
                  placeholder="Enter password..."
                  className="dark:bg-neutral-800 dark:border-neutral-700"
                  autoFocus
                />
                <button
                  onClick={() => { setShowResetFlow(true); setResetStep("verify"); }}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline w-full text-right"
                >
                  Forgot / Reset Password?
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowPasswordPrompt(false); setPasswordInput(""); }} className="dark:border-neutral-700 dark:text-neutral-300">Cancel</Button>
                <Button onClick={handlePasswordSubmit} className="bg-amber-600 hover:bg-amber-700 text-white">Login</Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-3 space-y-3">
              {resetStep === "verify" ? (
                <>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Enter master password to continue:</p>
                  <Input
                    type="password"
                    value={resetMasterInput}
                    onChange={(e) => setResetMasterInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleResetVerify(); }}
                    placeholder="Master password (gmail)..."
                    className="dark:bg-neutral-800 dark:border-neutral-700"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 dark:border-neutral-700" onClick={() => setShowResetFlow(false)}>Back</Button>
                    <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleResetVerify}>Verify</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">To set a new main dev password, go to <strong>Dashboard → Passwords</strong> after logging in.</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Or login directly with master password:</p>
                  <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                    setPasswordInput(resetMasterInput);
                    setShowResetFlow(false);
                    setTimeout(() => handlePasswordSubmit(), 50);
                  }}>Login with Master Password</Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk Photo Upload Modal ── */}
      <Dialog open={isBulkPhotoOpen} onOpenChange={setIsBulkPhotoOpen}>
        <DialogContent className="sm:max-w-[480px] dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Camera className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <DialogTitle className="dark:text-white">Photo Upload</DialogTitle>
                <DialogDescription className="dark:text-neutral-400">
                  Name your photos as <span className="font-mono font-semibold">PartNo.jpg</span> — they'll auto-match to parts.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Instructions */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800 space-y-1.5 text-sm text-purple-800 dark:text-purple-200">
              <p className="font-semibold">How it works:</p>
              <p>• Name photo as <span className="font-mono">8914900694.jpg</span> → adds to part 8914900694</p>
              <p>• Multiple photos for same part: <span className="font-mono">8914900694_1.jpg</span>, <span className="font-mono">8914900694_2.jpg</span></p>
              <p>• Select many photos at once — all processed together</p>
            </div>

            {/* Upload button */}
            <div
              onClick={() => bulkPhotoInputRef.current?.click()}
              className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-center"
            >
              <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-full">
                <Camera className="w-8 h-8 text-purple-500" />
              </div>
              <div>
                <p className="font-semibold text-purple-700 dark:text-purple-300">Click to select photos</p>
                <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">From gallery or camera • Multiple files supported</p>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              ref={bulkPhotoInputRef}
              onChange={handleBulkPhotoUpload}
              className="hidden"
            />

            {/* Result summary */}
            {bulkPhotoProgress && bulkPhotoProgress.total > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-100 dark:border-emerald-800 text-center">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{bulkPhotoProgress.matched}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Matched & Saved</p>
                  </div>
                  <div className={`rounded-xl p-3 border text-center ${bulkPhotoProgress.unmatched.length > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800" : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"}`}>
                    <p className={`text-2xl font-bold ${bulkPhotoProgress.unmatched.length > 0 ? "text-red-700 dark:text-red-300" : "text-neutral-500"}`}>{bulkPhotoProgress.unmatched.length}</p>
                    <p className={`text-xs font-medium ${bulkPhotoProgress.unmatched.length > 0 ? "text-red-600 dark:text-red-400" : "text-neutral-400"}`}>Not Matched</p>
                  </div>
                </div>
                {bulkPhotoProgress.unmatched.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Unmatched files (part number not found):</p>
                    <div className="flex flex-wrap gap-1">
                      {bulkPhotoProgress.unmatched.map(f => (
                        <span key={f} className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-mono">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkPhotoOpen(false)} className="dark:border-neutral-700 dark:text-neutral-300">Close</Button>
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
          <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1 mt-2 flex-wrap">
            {[
              { id: "overview", label: "Overview", icon: LayoutGrid },
              { id: "pending", label: "Pending", icon: RefreshCw, badge: pendingList.length },
              { id: "passwords", label: "Passwords", icon: Shield },
              { id: "announcement", label: "Announce", icon: Megaphone },
              { id: "reports", label: "Reports", icon: AlertCircle, badge: reports.length },
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
                {(tab as any).badge > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-4 min-w-4 px-1">{(tab as any).badge}</Badge>
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

          {/* Pending Tab */}
          {activeDashboardTab === "pending" && (
            <div className="space-y-3 mt-4">
              {pendingList.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 dark:text-neutral-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium">No pending changes</p>
                  <p className="text-sm mt-1">All suggestions have been reviewed.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingList.map((pc) => (
                    <div key={pc.id} className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="text-[10px] h-4 capitalize" variant={pc.type === "photo" ? "secondary" : pc.type === "add_part" ? "default" : "outline"}>
                              {pc.type === "photo" ? "📷 Photo" : pc.type === "add_part" ? "➕ New Part" : "📍 Location"}
                            </Badge>
                            <span className="font-mono text-sm font-semibold dark:text-neutral-200">{pc.partNumber}</span>
                          </div>
                          {pc.type === "location" && (
                            <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
                              <p>Old: <span className="font-mono line-through text-red-500">{pc.oldValue}</span></p>
                              <p>New: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{pc.newValue}</span></p>
                            </div>
                          )}
                          {pc.type === "add_part" && pc.newValue && (() => {
                            try {
                              const d = JSON.parse(pc.newValue);
                              return (
                                <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5 mt-1">
                                  {Object.entries(d).filter(([k]) => k !== "images").slice(0, 5).map(([k, v]) => (
                                    <p key={k}><span className="text-neutral-400 capitalize">{k}:</span> <span className="font-mono">{String(v)}</span></p>
                                  ))}
                                  {d.images?.length > 0 && <p className="text-purple-500">{d.images.length} photo(s) attached</p>}
                                </div>
                              );
                            } catch { return null; }
                          })()}
                          {pc.type === "photo" && pc.photoData && (
                            <div className="mt-2 space-y-2">
                              <img src={pc.photoData} alt="pending" className="w-24 h-24 object-cover rounded-lg border border-amber-200 dark:border-amber-700" />
                              <div className="flex items-center gap-2">
                                {renamingPhotoId === pc.id ? (
                                  <>
                                    <Input
                                      value={renamePhotoName}
                                      onChange={(e) => setRenamePhotoName(e.target.value)}
                                      placeholder="New filename..."
                                      className="text-xs h-7 dark:bg-neutral-800 dark:border-neutral-700"
                                    />
                                    <Button size="sm" className="h-7 text-xs" onClick={() => { setRenamingPhotoId(null); }}>Save</Button>
                                  </>
                                ) : (
                                  <button
                                    className="text-xs text-blue-500 hover:underline"
                                    onClick={() => { setRenamingPhotoId(pc.id); setRenamePhotoName(pc.photoName || "photo.jpg"); }}
                                  >
                                    Rename: {pc.photoName || "photo.jpg"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          onClick={() => approvePendingMutation.mutate({ id: pc.id, approvedName: renamingPhotoId === pc.id ? renamePhotoName : undefined })}
                          disabled={approvePendingMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm" variant="outline" className="flex-1 h-8 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 text-xs"
                          onClick={() => rejectPendingMutation.mutate(pc.id)}
                          disabled={rejectPendingMutation.isPending}
                        >
                          <X className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Passwords Tab */}
          {activeDashboardTab === "passwords" && (
            <div className="space-y-4 mt-4">
              {!masterVerified ? (
                <div className="space-y-3 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <p className="text-sm font-medium dark:text-neutral-300">Enter master password to manage access:</p>
                  <Input
                    type="password"
                    value={masterInput}
                    onChange={(e) => setMasterInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleMasterVerify(); }}
                    placeholder="Master password (gmail)..."
                    className="dark:bg-neutral-900 dark:border-neutral-700"
                  />
                  <Button className="w-full" onClick={handleMasterVerify}>Unlock Password Manager</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Existing passwords list */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider">Active Passwords ({passwordsList.length})</p>
                    {passwordsList.length === 0 ? (
                      <p className="text-sm text-neutral-400 italic">No sub-passwords added yet.</p>
                    ) : (
                      passwordsList.map((pw) => (
                        <div key={pw.id} className="flex items-center gap-2 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold dark:text-neutral-200">{pw.label}</p>
                            <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                              {pw.password.substring(0, 3)}{'*'.repeat(pw.password.length - 3)}
                            </p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {pw.permissions?.canSuggestLocations && <Badge className="text-[9px] h-4 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Locations</Badge>}
                              {pw.permissions?.canUploadPhotos && <Badge className="text-[9px] h-4 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Photos</Badge>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => handleDeletePassword(pw.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add new password */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 space-y-3">
                    <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">Add New Password</p>
                    <Input
                      value={newPwLabel}
                      onChange={(e) => setNewPwLabel(e.target.value)}
                      placeholder="Label (e.g. Warehouse Team)..."
                      className="dark:bg-neutral-900 dark:border-neutral-700 text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={newPwValue}
                        onChange={(e) => { setNewPwValue(e.target.value); setShowGeneratedPw(null); }}
                        placeholder="Password..."
                        className="dark:bg-neutral-900 dark:border-neutral-700 text-sm flex-1"
                      />
                      <Button variant="outline" size="sm" className="text-xs dark:border-neutral-700" onClick={generatePassword}>
                        Auto
                      </Button>
                    </div>
                    {showGeneratedPw && (
                      <div className="flex items-center gap-2 p-2 bg-white dark:bg-neutral-900 rounded-lg border border-emerald-200 dark:border-emerald-700">
                        <span className="font-mono text-sm text-emerald-700 dark:text-emerald-300 flex-1 select-all">{showGeneratedPw}</span>
                        <button onClick={() => { navigator.clipboard.writeText(showGeneratedPw); toast({ title: "Copied!" }); }} className="text-xs text-emerald-600 hover:underline">Copy</button>
                      </div>
                    )}
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={newPwPermissions.canSuggestLocations} onChange={(e) => setNewPwPermissions(p => ({ ...p, canSuggestLocations: e.target.checked }))} className="rounded" />
                        <span className="dark:text-neutral-300">Suggest Locations</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={newPwPermissions.canUploadPhotos} onChange={(e) => setNewPwPermissions(p => ({ ...p, canUploadPhotos: e.target.checked }))} className="rounded" />
                        <span className="dark:text-neutral-300">Upload Photos</span>
                      </label>
                    </div>
                    <Button className="w-full" onClick={handleAddPassword}>Add Password</Button>
                  </div>
                </div>
              )}
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

      {/* ── Suggest New Part Modal ── */}
      <Dialog open={isSuggestNewPartOpen} onOpenChange={(open) => { if (!open) { setIsSuggestNewPartOpen(false); setSuggestPartForm({}); setSuggestPartImages([]); } }}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="dark:text-white">Suggest New Part</DialogTitle>
                <DialogDescription className="dark:text-neutral-400 text-xs">Your suggestion will be reviewed by an admin.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            {/* Photos */}
            <div className="space-y-2">
              <Label className="text-sm font-medium dark:text-neutral-300">Photos (optional)</Label>
              <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
                {suggestPartImages.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700">
                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                    <button onClick={() => setSuggestPartImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 p-0.5 rounded-full text-white hover:bg-red-500">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <div onClick={() => suggestPartCameraRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500">
                    <Camera className="w-5 h-5 mb-0.5" />
                    <span className="text-[9px] font-semibold">Camera</span>
                  </div>
                  <div onClick={() => suggestPartImageRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500">
                    <FolderOpen className="w-5 h-5 mb-0.5" />
                    <span className="text-[9px] font-semibold">Gallery</span>
                  </div>
                </div>
                <input type="file" accept="image/*" capture="environment" ref={suggestPartCameraRef} onChange={(e) => pickImageForCrop(e, "suggestPart")} className="hidden" />
                <input type="file" accept="image/*" multiple ref={suggestPartImageRef} onChange={(e) => pickImageForCrop(e, "suggestPart")} className="hidden" />
              </div>
            </div>
            {/* Part fields */}
            {csvHeaders.map((header) => (
              <div key={header} className="grid gap-1.5">
                <Label htmlFor={`suggest-${header}`} className="capitalize text-sm dark:text-neutral-300">{header}</Label>
                <Input
                  id={`suggest-${header}`}
                  value={suggestPartForm[header] || ""}
                  onChange={(e) => setSuggestPartForm(prev => ({ ...prev, [header]: e.target.value }))}
                  placeholder={`Enter ${header}...`}
                  className="dark:bg-neutral-800 dark:border-neutral-700"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuggestNewPartOpen(false)} className="dark:border-neutral-700">Cancel</Button>
            <Button onClick={handleSuggestNewPartSubmit} disabled={submitPendingMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitPendingMutation.isPending ? "Sending..." : "Submit Suggestion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suggest Location Modal ── */}
      <Dialog open={isSuggestLocationOpen} onOpenChange={(open) => { if (!open) { setIsSuggestLocationOpen(false); setSuggestPart(null); setSuggestNewLocation(""); } }}>
        <DialogContent className="sm:max-w-[380px] dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Edit2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="dark:text-white">Suggest Location Change</DialogTitle>
                <DialogDescription className="dark:text-neutral-400 text-xs">Part: <span className="font-mono font-semibold">{suggestPart?.partNumber}</span></DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs dark:text-neutral-400">New Location</Label>
              <Input
                value={suggestNewLocation}
                onChange={(e) => setSuggestNewLocation(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSuggestLocationSubmit(); }}
                placeholder="e.g. Shelf B-3..."
                className="dark:bg-neutral-800 dark:border-neutral-700"
                autoFocus
              />
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 p-2 rounded-lg">
              Your suggestion will be reviewed by an admin before being applied.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuggestLocationOpen(false)} className="dark:border-neutral-700">Cancel</Button>
            <Button onClick={handleSuggestLocationSubmit} disabled={submitPendingMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {submitPendingMutation.isPending ? "Sending..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Photo Upload Modal ── */}
      <Dialog open={isUserPhotoUploadOpen} onOpenChange={(open) => { if (!open) { setIsUserPhotoUploadOpen(false); setUserPhotoUploadPart(null); setUserPhotoPreview(null); } }}>
        <DialogContent className="sm:max-w-[380px] dark:bg-neutral-900 dark:border-neutral-800">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Camera className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <DialogTitle className="dark:text-white">Submit Photo</DialogTitle>
                <DialogDescription className="dark:text-neutral-400 text-xs">Part: <span className="font-mono font-semibold">{userPhotoUploadPart?.partNumber}</span></DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-3 space-y-3">
            {userPhotoPreview ? (
              <div className="relative w-full h-48 rounded-xl overflow-hidden border border-purple-200 dark:border-purple-700">
                <img src={userPhotoPreview.base64} alt="preview" className="w-full h-full object-cover" />
                <button onClick={() => setUserPhotoPreview(null)} className="absolute top-2 right-2 bg-black/60 p-1 rounded-full text-white hover:bg-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 flex items-center gap-1">
                  <Crop className="w-3 h-3" /> Cropped photo ready
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div
                  onClick={() => userPhotoUploadInputRef.current?.click()}
                  className="flex-1 h-24 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-blue-500"
                >
                  <Camera className="w-6 h-6 mb-1" />
                  <p className="text-xs font-medium">Camera</p>
                </div>
                <div
                  onClick={() => userPhotoGalleryRef.current?.click()}
                  className="flex-1 h-24 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-purple-500"
                >
                  <FolderOpen className="w-6 h-6 mb-1" />
                  <p className="text-xs font-medium">Gallery</p>
                </div>
              </div>
            )}
            <input type="file" accept="image/*" capture="environment" ref={userPhotoUploadInputRef} onChange={handleUserPhotoSelect} className="hidden" />
            <input type="file" accept="image/*" ref={userPhotoGalleryRef} onChange={handleUserPhotoSelect} className="hidden" />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 p-2 rounded-lg">
              Photo will be reviewed by an admin before appearing on the part.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserPhotoUploadOpen(false)} className="dark:border-neutral-700">Cancel</Button>
            <Button onClick={handleUserPhotoSubmit} disabled={!userPhotoPreview || submitPendingMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
              {submitPendingMutation.isPending ? "Sending..." : "Submit Photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Crop Image Modal ── */}
      <CropImageModal
        open={!!cropSource}
        imageDataUrl={cropSource || ""}
        onClose={() => setCropSource(null)}
        onCrop={handleCropConfirm}
      />
    </div>
  );
}
