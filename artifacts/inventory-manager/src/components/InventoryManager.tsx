import { useState, useRef, useEffect, useMemo } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import { 
  Search, Plus, Upload, Download, Trash2, Edit2, 
  Settings, X, FileSpreadsheet, AlertCircle, Image as ImageIcon, Camera, Archive,
  Shield, Megaphone, Users, MessageSquare, Moon, Sun, Palette, LayoutGrid, List
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

// Define our base Part interface
interface Part {
  id: string; // Unique identifier (could be part number if unique)
  partNumber: string;
  name: string;
  quantity: string | number;
  location: string;
  price: string | number;
  images: string[]; // Base64 encoded images or URLs
  [key: string]: any; // Allow for dynamic CSV columns
}

interface LocationReport {
  partId: string;
  partNumber: string;
  reportedAt: number;
}

export default function InventoryManager() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // State
  const [parts, setParts] = useState<Part[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuffixMode, setSearchSuffixMode] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>(["partNumber", "name", "quantity", "location", "price"]);
  
  // Auth & Admin state
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [adminPasswords, setAdminPasswords] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("inventory_passwords");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { return ["AS0511"]; }
      }
    }
    return ["AS0511"];
  });

  const [reports, setReports] = useState<LocationReport[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("inventory_reports");
      if (saved) {
        try { 
          const parsed: LocationReport[] = JSON.parse(saved); 
          // Auto-delete reports older than 7 days
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          return parsed.filter(r => r.reportedAt > sevenDaysAgo);
        } catch (e) { return []; }
      }
    }
    return [];
  });

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
  const [isMasterDashboardOpen, setIsMasterDashboardOpen] = useState(false);
  const [currentEditPart, setCurrentEditPart] = useState<Part | null>(null);
  const [activeImageGallery, setActiveImageGallery] = useState<{id: string, partId: string, images: string[]}>({id: '', partId: '', images: []});
  
  // Form state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formImages, setFormImages] = useState<string[]>([]);

  // Theme & Layout State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [isGridView, setIsGridView] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Master Dashboard State (Mockup)
  const [announcement, setAnnouncement] = useState("Welcome to the new Inventory System!");
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");

  // Load from local storage on mount to persist across reloads
  useEffect(() => {
    const savedParts = localStorage.getItem("inventory_parts");
    const savedHeaders = localStorage.getItem("inventory_headers");
    if (savedParts) {
      try {
        setParts(JSON.parse(savedParts));
      } catch (e) {
        console.error("Failed to parse saved parts");
      }
    }
    if (savedHeaders) {
      try {
        setCsvHeaders(JSON.parse(savedHeaders));
      } catch (e) {
        console.error("Failed to parse saved headers");
      }
    }
  }, []);

  // Save to local storage whenever parts change
  useEffect(() => {
    if (parts.length > 0) {
      localStorage.setItem("inventory_parts", JSON.stringify(parts));
      localStorage.setItem("inventory_headers", JSON.stringify(csvHeaders));
    }
  }, [parts, csvHeaders]);

  useEffect(() => {
    localStorage.setItem("inventory_passwords", JSON.stringify(adminPasswords));
  }, [adminPasswords]);

  useEffect(() => {
    localStorage.setItem("inventory_reports", JSON.stringify(reports));
  }, [reports]);

  const handleDevModeToggle = (checked: boolean) => {
    if (checked) {
      setShowPasswordPrompt(true);
    } else {
      setDevMode(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (adminPasswords.includes(passwordInput) || passwordInput === "skyadavjsr45@gmail.com") {
      setDevMode(true);
      setShowPasswordPrompt(false);
      setPasswordInput("");
      toast({
        title: "Developer Mode Enabled",
        description: "You now have admin access.",
      });
    } else {
      toast({
        title: "Access Denied",
        description: "Incorrect password.",
        variant: "destructive",
      });
      setPasswordInput("");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          // Extract headers
          const headers = Object.keys(results.data[0] as object);
          const cleanHeaders = headers.filter(h => h !== 'id' && h !== 'images');
          setCsvHeaders(cleanHeaders);
          
          // Map data, ensuring we have a unique ID and a partNumber field
          const parsedParts = results.data.map((row: any, index) => {
            // Try to find the part number column (case insensitive)
            const partNumKey = cleanHeaders.find(h => 
              h.toLowerCase() === 'partnumber' || 
              h.toLowerCase() === 'part_number' || 
              h.toLowerCase() === 'part no' || 
              h.toLowerCase() === 'partno'
            ) || cleanHeaders[0]; // fallback to first column

            return {
              ...row,
              id: crypto.randomUUID(),
              partNumber: row[partNumKey] || `UNKNOWN-${index}`,
              images: row.images ? JSON.parse(row.images) : []
            };
          });

          setParts(parsedParts);
          toast({
            title: "CSV Uploaded",
            description: `Successfully loaded ${parsedParts.length} parts.`,
          });
        }
      },
      error: (error) => {
        toast({
          title: "Error reading CSV",
          description: error.message,
          variant: "destructive",
        });
      }
    });
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const exportToCSV = () => {
    if (parts.length === 0) {
      toast({
        title: "No data to export",
        description: "Please add some parts first.",
        variant: "destructive",
      });
      return;
    }

    // Remove internal 'id' field for export and stringify images
    const exportData = parts.map(({ id, ...rest }) => ({
      ...rest,
      images: JSON.stringify(rest.images || [])
    }));
    
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "inventory_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Export Successful",
      description: "Inventory data has been downloaded as data.csv",
    });
  };

  const exportCompleteProject = async () => {
    if (parts.length === 0) {
      toast({
        title: "No data to export",
        description: "Please add some parts first.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Generating Full Archive",
      description: "Packaging your app source code, data, and images...",
    });

    try {
      let zip: JSZip;
      
      // Try to fetch the base source code zip
      try {
        const response = await fetch("/source-code.zip");
        if (response.ok) {
           const blob = await response.blob();
           zip = await JSZip.loadAsync(blob);
        } else {
           zip = new JSZip();
        }
      } catch (e) {
        zip = new JSZip();
      }

      // Create a specific folder for the backup data within the project
      const backupFolder = zip.folder("inventory_backup_data");
      if (!backupFolder) throw new Error("Failed to create backup folder inside ZIP");

      // 1. Add the CSV data
      const exportData = parts.map(({ id, ...rest }) => ({
        ...rest,
        hasImages: (rest.images && rest.images.length > 0) ? rest.images.length : 0,
        images: undefined
      }));
      
      const csv = Papa.unparse(exportData);
      backupFolder.file("data.csv", csv);

      // 2. Create an images folder and add images
      const imagesFolder = backupFolder.folder("images");
      if (imagesFolder) {
        const imageMapping: Record<string, string[]> = {};

        parts.forEach(part => {
          if (part.images && part.images.length > 0) {
            const partImages: string[] = [];
            part.images.forEach((base64Data, index) => {
              const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                let ext = 'jpg';
                if (matches[1] === 'image/png') ext = 'png';
                else if (matches[1] === 'image/webp') ext = 'webp';
                else if (matches[1] === 'image/jpeg') ext = 'jpg';

                const filename = `${part.partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${index + 1}.${ext}`;
                const base64Content = matches[2];
                
                imagesFolder.file(filename, base64Content, {base64: true});
                partImages.push(`images/${filename}`);
              }
            });
            imageMapping[part.partNumber] = partImages;
          }
        });

        backupFolder.file("image_mapping.json", JSON.stringify(imageMapping, null, 2));
      }

      // 3. Generate the full backup JSON
      backupFolder.file("full_backup.json", JSON.stringify(parts, null, 2));

      // 4. Create and download the zip
      const content = await zip.generateAsync({type: "blob"});
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Full_Inventory_Project_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Successful",
        description: "Full project source code & backup downloaded!",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "There was an error generating the complete project archive.",
        variant: "destructive",
      });
    }
  };

  // Image Handling
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEditMode = false) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormImages(prev => [...prev, base64String]);
      };
      reader.readAsDataURL(file);
    });

    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeFormImage = (index: number) => {
    setFormImages(prev => prev.filter((_, i) => i !== index));
  };


  const handleClear = () => {
    setSearchQuery("");
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this part?")) {
      setParts(parts.filter(p => p.id !== id));
      toast({
        title: "Part Deleted",
        description: "The record has been removed.",
      });
    }
  };

  const openAddModal = () => {
    const initialForm: Record<string, string> = {};
    csvHeaders.forEach(h => {
      initialForm[h] = "";
    });
    setFormData(initialForm);
    setFormImages([]);
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = () => {
    if (!formData.partNumber && !formData[csvHeaders[0]]) {
      toast({
        title: "Validation Error",
        description: "Part number is required.",
        variant: "destructive",
      });
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

    setParts([newPart, ...parts]);
    setIsAddModalOpen(false);
    toast({
      title: "Part Added",
      description: "New part has been added successfully.",
    });
  };

  const openEditModal = (part: Part) => {
    setCurrentEditPart(part);
    
    // Populate form data
    const initialForm: Record<string, string> = {};
    csvHeaders.forEach(h => {
      initialForm[h] = part[h]?.toString() || "";
    });
    // Ensure standard fields are mapped if headers differ
    if (!initialForm.partNumber) initialForm.partNumber = part.partNumber;
    
    setFormData(initialForm);
    setFormImages(part.images || []);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!currentEditPart) return;
    
    const updatedParts = parts.map(p => {
      if (p.id === currentEditPart.id) {
        return {
          ...p,
          ...formData,
          partNumber: formData.partNumber || p.partNumber,
          images: formImages
        };
      }
      return p;
    });

    setParts(updatedParts);
    setIsEditModalOpen(false);
    setCurrentEditPart(null);
    toast({
      title: "Part Updated",
      description: "The changes have been saved.",
    });
  };

  const handleFormChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // Clear all data
  const handleClearAllData = () => {
    if (confirm("Are you sure you want to clear ALL inventory data? This cannot be undone.")) {
      setParts([]);
      localStorage.removeItem("inventory_parts");
      toast({
        title: "Data Cleared",
        description: "All inventory records have been deleted.",
      });
    }
  };

  // Search logic
  const filteredParts = useMemo(() => {
    if (!searchQuery) return []; 
    
    const query = searchQuery.toLowerCase().trim();
    
    return parts.filter(part => {
      const partNum = (part.partNumber || "").toLowerCase().trim();
      
      if (searchSuffixMode) {
        // Search by last 3 or 4 digits
        const last3 = partNum.slice(-3);
        const last4 = partNum.slice(-4);
        return last3 === query || last4 === query || partNum.endsWith(query);
      } else {
        // Full or partial match
        return partNum.includes(query);
      }
    });
  }, [parts, searchQuery, searchSuffixMode]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 md:p-8 font-sans">
      {/* Announcement Banner */}
      {showAnnouncement && announcement && (
        <div className="max-w-5xl mx-auto mb-4 bg-primary text-primary-foreground p-3 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            <span className="text-sm font-medium">{announcement}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary-foreground/20 text-primary-foreground" onClick={() => setShowAnnouncement(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
              Inventory Manager
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Manage your complete data.csv in one place
            </p>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setIsDarkMode(!isDarkMode)}
                title="Toggle Theme"
                className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
              >
                {isDarkMode ? <Moon className="w-4 h-4 text-neutral-500" /> : <Sun className="w-4 h-4 text-neutral-500" />}
              </Button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              <Settings className="w-4 h-4 text-neutral-500" />
              <Label htmlFor="dev-mode" className="text-sm font-medium cursor-pointer">Dev Mode</Label>
              <Switch 
                id="dev-mode" 
                checked={devMode}
                onCheckedChange={handleDevModeToggle}
                data-testid="toggle-devmode"
              />
            </div>

            <div className="flex gap-2">
              {devMode && (
                <>
                  <Button 
                    variant="outline" 
                    className="bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200"
                    onClick={() => setIsMasterDashboardOpen(true)}
                    title="Master Dashboard"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Master Dashboard
                  </Button>

                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload CSV"
                    data-testid="btn-upload-csv"
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                  <input 
                    type="file" 
                    accept=".csv" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                  
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={exportToCSV}
                    title="Download CSV Only"
                    data-testid="btn-download-csv"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
    
                  <Button 
                    variant="default" 
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                    onClick={exportCompleteProject}
                    title="Export Complete Backup (CSV + Images)"
                  >
                    <Archive className="w-4 h-4 hidden sm:block" />
                    <span className="hidden sm:block">Export Backup</span>
                    <span className="sm:hidden"><Archive className="w-4 h-4" /></span>
                  </Button>
    
                  <Button 
                    variant="secondary"
                    className="flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = "/source-code.zip";
                      link.setAttribute("download", "inventory-app-source-code.zip");
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      toast({
                        title: "Download Started",
                        description: "Downloading the full project source code...",
                      });
                    }}
                    title="Download Full Project Source Code"
                  >
                    <Download className="w-4 h-4 hidden sm:block" />
                    <span className="hidden sm:block">Download Full Project</span>
                    <span className="sm:hidden"><Download className="w-4 h-4" /></span>
                  </Button>
    
                  <Button 
                    variant="destructive" 
                    size="icon"
                    onClick={handleClearAllData}
                    title="Clear All Data"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search Section */}
        <Card className="shadow-sm border-neutral-200 dark:border-neutral-800">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Search Parts</Label>
                <div className="flex items-center gap-2">
                  <Switch 
                    id="suffix-mode" 
                    checked={searchSuffixMode}
                    onCheckedChange={setSearchSuffixMode}
                  />
                  <Label htmlFor="suffix-mode" className="text-xs text-neutral-500 cursor-pointer">
                    Last 3/4 Digits
                  </Label>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <Input 
                    placeholder={searchSuffixMode ? "Enter last 3 or 4 digits..." : "Enter Part Number..."}
                    className="pl-10 h-12 text-lg"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search"
                    autoFocus
                  />
                  {searchQuery && (
                    <button 
                      onClick={handleClear}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      data-testid="btn-clear-search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <Button 
                  className="h-12 px-8 font-medium" 
                  onClick={() => {/* Search is reactive, this just feels good UX */}}
                  data-testid="btn-search"
                >
                  SEARCH
                </Button>
                
                {devMode && (
                  <Button 
                    variant="secondary" 
                    className="h-12 px-6 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800"
                    onClick={openAddModal}
                    data-testid="btn-add-part"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-4">
          {searchQuery ? (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                Search Results ({filteredParts.length})
              </h2>
              {devMode && (
                <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-1 hidden sm:flex">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-7 w-7 rounded-md ${isGridView ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`} 
                    onClick={() => setIsGridView(true)}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-7 w-7 rounded-md ${!isGridView ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`} 
                    onClick={() => setIsGridView(false)}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center p-12 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/20 text-center">
              <div className="max-w-sm space-y-2">
                <Search className="w-8 h-8 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Ready to search</h3>
                <p className="text-sm text-neutral-500">
                  {parts.length > 0 
                    ? `Enter a part number above to search through your ${parts.length} loaded parts.` 
                    : "Upload a data.csv file first to start searching parts."}
                </p>
                {parts.length === 0 && (
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" /> Upload CSV
                  </Button>
                )}
              </div>
            </div>
          )}

          {searchQuery && filteredParts.length === 0 && (
            <div className="p-8 text-center bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">No parts found</h3>
              <p className="text-neutral-500 mt-1">Try a different part number or check if your search mode is correct.</p>
              {devMode && (
                <Button className="mt-4" onClick={openAddModal}>
                  <Plus className="w-4 h-4 mr-2" /> Add "{searchQuery}" as New Part
                </Button>
              )}
            </div>
          )}

          <div className={isGridView ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-4"}>
            {filteredParts.map((part) => (
              <Card key={part.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow border-neutral-200 dark:border-neutral-800">
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold font-mono tracking-tight text-primary">
                          {part.partNumber}
                        </h3>
                      </div>
                      {part.name && <p className="text-lg font-medium text-neutral-700 dark:text-neutral-300">{part.name}</p>}
                    </div>
                    
                    {devMode && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30" onClick={() => openEditModal(part)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => handleDelete(part.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    {!devMode && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 h-8"
                        onClick={() => {
                          const existingReport = reports.find(r => r.partId === part.id);
                          if (existingReport) {
                            toast({
                              title: "Already Reported",
                              description: "This part's location has already been reported.",
                            });
                            return;
                          }
                          const newReport: LocationReport = {
                            partId: part.id,
                            partNumber: part.partNumber,
                            reportedAt: Date.now()
                          };
                          setReports([...reports, newReport]);
                          toast({
                            title: "Report Submitted",
                            description: "An admin has been notified to verify the location.",
                          });
                        }}
                      >
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Report Wrong Location
                      </Button>
                    )}
                  </div>

                  <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 grid grid-cols-2 gap-y-4 gap-x-6 border border-neutral-100 dark:border-neutral-800 mb-4">
                    {/* Display primary fields first if they exist */}
                    {['quantity', 'location', 'price'].map((key) => {
                      if (part[key] !== undefined && part[key] !== '') {
                        return (
                          <div key={key} className="space-y-1">
                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{key}</p>
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {key === 'price' ? `$${part[key]}` : part[key]}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })}
                    
                    {/* Display other dynamic CSV fields */}
                    {Object.entries(part).map(([key, value]) => {
                      if (!['id', 'partNumber', 'name', 'quantity', 'location', 'price', 'images'].includes(key) && value) {
                        return (
                          <div key={key} className="space-y-1">
                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{key}</p>
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 break-words">{String(value)}</p>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>

                  {/* Photo Feature Area */}
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Photos ({part.images?.length || 0})
                       </span>
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {part.images?.map((img, i) => (
                        <div 
                          key={i} 
                          className="relative w-16 h-16 rounded-md overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700 cursor-pointer group"
                          onClick={() => {
                            setActiveImageGallery({id: part.id, partId: part.partNumber, images: part.images});
                            setIsImageGalleryOpen(true);
                          }}
                        >
                          <img src={img} alt={`Part ${part.partNumber} photo ${i+1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      
                      {devMode && (
                        <div 
                          onClick={() => {
                             setCurrentEditPart(part);
                             const initialForm: Record<string, string> = {};
                             csvHeaders.forEach(h => {
                               initialForm[h] = part[h]?.toString() || "";
                             });
                             if (!initialForm.partNumber) initialForm.partNumber = part.partNumber;
                             
                             setFormData(initialForm);
                             setFormImages(part.images || []);
                             setIsEditModalOpen(true);
                          }}
                          className="w-16 h-16 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600"
                        >
                          <Plus className="w-5 h-5 mb-0.5" />
                        </div>
                      )}
                      
                      {(!part.images || part.images.length === 0) && !devMode && (
                         <div className="w-full py-4 text-center text-xs text-neutral-400 italic">
                           No photos available. Enable Dev Mode to add.
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

      {/* Add Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Add New Part</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             {/* Photo Upload in Modal */}
             <div className="space-y-3 mb-2">
                <Label className="text-sm font-medium">Photos</Label>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {formImages.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden shrink-0 border border-neutral-200">
                      <img src={img} alt="preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeFormImage(i)}
                        className="absolute top-1 right-1 bg-black/50 p-1 rounded-full hover:bg-red-500 text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div 
                    onClick={() => imageInputRef.current?.click()}
                    className="w-20 h-20 rounded-md border border-dashed border-neutral-300 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 text-neutral-500"
                  >
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-[10px] uppercase font-medium">Add</span>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    ref={imageInputRef} 
                    onChange={(e) => handleImageUpload(e)} 
                    className="hidden" 
                  />
                </div>
              </div>

            {csvHeaders.map((header) => (
              <div key={header} className="grid gap-2">
                <Label htmlFor={`add-${header}`} className="capitalize">{header}</Label>
                <Input
                  id={`add-${header}`}
                  value={formData[header] || ""}
                  onChange={(e) => handleFormChange(header, e.target.value)}
                  placeholder={`Enter ${header}...`}
                  required={header === 'partNumber' || header === csvHeaders[0]}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAdd}>Save Part</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Prompt Modal for Dev Mode */}
      <Dialog open={showPasswordPrompt} onOpenChange={(open) => {
        if (!open) {
          setShowPasswordPrompt(false);
          setPasswordInput("");
        }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Admin Access Required</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="admin-password">Enter Password</Label>
            <Input
              id="admin-password"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handlePasswordSubmit();
                }
              }}
              placeholder="Password..."
              className="mt-2"
              autoFocus
            />
            <p className="text-xs text-neutral-500 mt-2">
              Note: This action requires administrator privileges.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPasswordPrompt(false);
              setPasswordInput("");
            }}>Cancel</Button>
            <Button onClick={handlePasswordSubmit}>Login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Edit Part {currentEditPart?.partNumber}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
              {/* Photo Upload in Modal */}
              <div className="space-y-3 mb-2">
                <Label className="text-sm font-medium">Photos</Label>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {formImages.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden shrink-0 border border-neutral-200">
                      <img src={img} alt="preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeFormImage(i)}
                        className="absolute top-1 right-1 bg-black/50 p-1 rounded-full hover:bg-red-500 text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div 
                    onClick={() => imageInputRef.current?.click()}
                    className="w-20 h-20 rounded-md border border-dashed border-neutral-300 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 text-neutral-500"
                  >
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-[10px] uppercase font-medium">Add</span>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    ref={imageInputRef} 
                    onChange={(e) => handleImageUpload(e)} 
                    className="hidden" 
                  />
                </div>
              </div>

            {csvHeaders.map((header) => (
              <div key={header} className="grid gap-2">
                <Label htmlFor={`edit-${header}`} className="capitalize">{header}</Label>
                <Input
                  id={`edit-${header}`}
                  value={formData[header] || ""}
                  onChange={(e) => handleFormChange(header, e.target.value)}
                  placeholder={`Enter ${header}...`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Gallery Modal */}
      <Dialog open={isImageGalleryOpen} onOpenChange={setIsImageGalleryOpen}>
        <DialogContent className="max-w-3xl p-1 bg-neutral-900 border-none">
          <div className="flex justify-between p-3 absolute top-0 w-full z-10 bg-gradient-to-b from-black/60 to-transparent">
             <h3 className="text-white font-medium">{activeImageGallery.partId}</h3>
             <DialogClose className="text-white hover:text-neutral-300 bg-black/20 rounded-full p-1">
               <X className="w-5 h-5" />
             </DialogClose>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[85vh] overflow-y-auto p-2 pt-12">
             {activeImageGallery.images.map((img, i) => (
                <div key={i} className="relative rounded bg-black flex items-center justify-center min-h-[200px] group">
                   <img src={img} alt={`Gallery ${i}`} className="max-w-full max-h-full object-contain" />
                   {devMode && (
                     <Button 
                       variant="destructive" 
                       size="icon" 
                       className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                       onClick={() => {
                         if (confirm("Delete this photo?")) {
                           const updatedParts = parts.map(p => {
                             if (p.id === activeImageGallery.id) {
                               const newImages = [...p.images];
                               newImages.splice(i, 1);
                               return { ...p, images: newImages };
                             }
                             return p;
                           });
                           setParts(updatedParts);
                           
                           const newActiveImages = [...activeImageGallery.images];
                           newActiveImages.splice(i, 1);
                           setActiveImageGallery(prev => ({ ...prev, images: newActiveImages }));
                           
                           if (newActiveImages.length === 0) {
                             setIsImageGalleryOpen(false);
                           }
                           
                           toast({
                             title: "Photo Deleted",
                             description: "The photo has been removed from this part."
                           });
                         }
                       }}
                     >
                       <Trash2 className="w-4 h-4" />
                     </Button>
                   )}
                </div>
             ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Master Dashboard Modal */}
      <Dialog open={isMasterDashboardOpen} onOpenChange={setIsMasterDashboardOpen}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-amber-500" />
              <div>
                <DialogTitle className="text-xl">Master Dashboard</DialogTitle>
                <DialogDescription>Premium Management & Controls</DialogDescription>
              </div>
            </div>
          </div>
          
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 p-4 space-y-2 overflow-y-auto">
              <Button 
                variant={activeDashboardTab === "overview" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveDashboardTab("overview")}
              >
                <Settings className="w-4 h-4 mr-2" />
                Overview
              </Button>
              <Button 
                variant={activeDashboardTab === "announcements" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveDashboardTab("announcements")}
              >
                <Megaphone className="w-4 h-4 mr-2" />
                Announcements
              </Button>
              <Button 
                variant={activeDashboardTab === "qa" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveDashboardTab("qa")}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Q & A
              </Button>
              <Button 
                variant={activeDashboardTab === "users" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveDashboardTab("users")}
              >
                <Users className="w-4 h-4 mr-2" />
                User Management
              </Button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-6 overflow-y-auto bg-neutral-50 dark:bg-neutral-900">
              {activeDashboardTab === "overview" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium">System Overview</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-neutral-500">Total Parts</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{parts.length}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-neutral-500">Total Images</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{parts.reduce((acc, p) => acc + (p.images?.length || 0), 0)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-neutral-500">System Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold text-green-500">Online</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Data Management Actions</CardTitle>
                      <CardDescription>Perform master data operations</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">Force Sync / Optimize</p>
                            <p className="text-sm text-neutral-500">Rebuild indices for faster searching</p>
                          </div>
                          <Button variant="outline">Optimize</Button>
                        </div>
                        <div className="flex items-center justify-between p-3 border rounded-lg border-red-200 bg-red-50 dark:bg-red-900/10">
                          <div>
                            <p className="font-medium text-red-600">Factory Reset</p>
                            <p className="text-sm text-red-500">Completely wipe all data and settings</p>
                          </div>
                          <Button variant="destructive">Reset</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeDashboardTab === "announcements" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium">Global Announcements</h3>
                  <Card>
                    <CardHeader>
                      <CardTitle>Current Announcement</CardTitle>
                      <CardDescription>This message will be displayed to all users at the top of the screen.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Message</Label>
                        <Input 
                          value={announcement} 
                          onChange={(e) => setAnnouncement(e.target.value)} 
                          placeholder="Enter announcement text..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={showAnnouncement} 
                          onCheckedChange={setShowAnnouncement} 
                          id="show-announcement"
                        />
                        <Label htmlFor="show-announcement">Display announcement banner</Label>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button onClick={() => toast({title: "Announcement Saved", description: "Changes have been published to all users."})}>
                        Publish Changes
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )}

              {activeDashboardTab === "qa" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Q & A / Support Messages</h3>
                  </div>
                  
                  {reports.length === 0 ? (
                    <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center bg-white dark:bg-neutral-900">
                      <MessageSquare className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                      <h4 className="text-lg font-medium mb-1">No pending messages</h4>
                      <p className="text-neutral-500 text-sm">When users submit questions or report locations, they will appear here.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {reports.map((report, i) => (
                        <Card key={i}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between">
                              <CardTitle className="text-base text-red-600">Location Report</CardTitle>
                              <span className="text-xs text-neutral-500">{new Date(report.reportedAt).toLocaleDateString()}</span>
                            </div>
                            <CardDescription>Part Number: {report.partNumber}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm">A user reported that the location for this part might be incorrect.</p>
                          </CardContent>
                          <CardFooter className="flex justify-end gap-2 pt-0">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                const part = parts.find(p => p.id === report.partId);
                                if (part) {
                                  setCurrentEditPart(part);
                                  const initialForm: Record<string, string> = {};
                                  csvHeaders.forEach(h => { initialForm[h] = part[h]?.toString() || ""; });
                                  if (!initialForm.partNumber) initialForm.partNumber = part.partNumber;
                                  setFormData(initialForm);
                                  setFormImages(part.images || []);
                                  setIsEditModalOpen(true);
                                  setIsMasterDashboardOpen(false);
                                } else {
                                  toast({ title: "Part Not Found", description: "This part may have been deleted.", variant: "destructive" });
                                }
                              }}
                            >
                              Edit Part
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setReports(prev => prev.filter((_, index) => index !== i))}>Dismiss</Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeDashboardTab === "users" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Sub-Admin Passwords</h3>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>Manage Access</CardTitle>
                      <CardDescription>Add or remove passwords for sub-admin access.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Input 
                          placeholder="New password..." 
                          id="new-password-input"
                          type="password"
                        />
                        <Button onClick={() => {
                          const input = document.getElementById("new-password-input") as HTMLInputElement;
                          if (input && input.value) {
                            if (!adminPasswords.includes(input.value)) {
                              setAdminPasswords([...adminPasswords, input.value]);
                              input.value = "";
                              toast({ title: "Password Added", description: "New sub-admin password has been saved." });
                            } else {
                              toast({ title: "Duplicate", description: "This password already exists.", variant: "destructive" });
                            }
                          }
                        }}>Add</Button>
                      </div>
                      
                      <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
                            <tr>
                              <th className="px-4 py-3 font-medium">Password</th>
                              <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminPasswords.map((pwd, i) => (
                              <tr key={i} className="border-b border-neutral-200 dark:border-neutral-800 last:border-0">
                                <td className="px-4 py-3 font-mono">{pwd.replace(/./g, '*')} <span className="text-xs text-neutral-400 ml-2">(hidden)</span></td>
                                <td className="px-4 py-3 text-right">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 h-8"
                                    onClick={() => {
                                      if (adminPasswords.length <= 1) {
                                        toast({ title: "Cannot Delete", description: "You must have at least one admin password.", variant: "destructive" });
                                        return;
                                      }
                                      if (confirm("Remove this password?")) {
                                        setAdminPasswords(prev => prev.filter((_, index) => index !== i));
                                        toast({ title: "Password Removed", description: "Sub-admin access revoked for this password." });
                                      }
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}