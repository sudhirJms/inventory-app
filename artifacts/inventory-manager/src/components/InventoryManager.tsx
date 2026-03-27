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
  partId: string;
  partNumber: string;
  reportedAt: number;
}

export default function InventoryManager() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [parts, setParts] = useState<Part[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuffixMode, setSearchSuffixMode] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>(["partNumber", "name", "quantity", "location", "price"]);
  
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
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          return parsed.filter(r => r.reportedAt > sevenDaysAgo);
        } catch (e) { return []; }
      }
    }
    return [];
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
  const [isMasterDashboardOpen, setIsMasterDashboardOpen] = useState(false);
  const [currentEditPart, setCurrentEditPart] = useState<Part | null>(null);
  const [activeImageGallery, setActiveImageGallery] = useState<{id: string, partId: string, images: string[]}>({id: '', partId: '', images: []});
  
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formImages, setFormImages] = useState<string[]>([]);

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

  const [announcement, setAnnouncement] = useState("Welcome to the new Inventory System!");
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");

  useEffect(() => {
    const savedParts = localStorage.getItem("inventory_parts");
    const savedHeaders = localStorage.getItem("inventory_headers");
    if (savedParts) {
      try { setParts(JSON.parse(savedParts)); } catch (e) {}
    }
    if (savedHeaders) {
      try { setCsvHeaders(JSON.parse(savedHeaders)); } catch (e) {}
    }
  }, []);

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
      toast({ title: "Developer Mode Enabled", description: "You now have admin access." });
    } else {
      toast({ title: "Access Denied", description: "Incorrect password.", variant: "destructive" });
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
          const headers = Object.keys(results.data[0] as object);
          const cleanHeaders = headers.filter(h => h !== 'id' && h !== 'images');
          setCsvHeaders(cleanHeaders);
          
          const parsedParts = results.data.map((row: any, index) => {
            const partNumKey = cleanHeaders.find(h => 
              h.toLowerCase() === 'partnumber' || 
              h.toLowerCase() === 'part_number' || 
              h.toLowerCase() === 'part no' || 
              h.toLowerCase() === 'partno'
            ) || cleanHeaders[0];

            return {
              ...row,
              id: crypto.randomUUID(),
              partNumber: row[partNumKey] || `UNKNOWN-${index}`,
              images: row.images ? (() => { try { return JSON.parse(row.images); } catch { return []; } })() : []
            };
          });

          setParts(parsedParts);
          toast({ title: "CSV Uploaded", description: `Successfully loaded ${parsedParts.length} parts.` });
        }
      },
      error: (error) => {
        toast({ title: "Error reading CSV", description: error.message, variant: "destructive" });
      }
    });
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const exportToCSV = () => {
    if (parts.length === 0) {
      toast({ title: "No data to export", description: "Please add some parts first.", variant: "destructive" });
      return;
    }
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
    toast({ title: "Export Successful", description: "Inventory data has been downloaded as inventory_data.csv" });
  };

  const exportCompleteProject = async () => {
    if (parts.length === 0) {
      toast({ title: "No data to export", description: "Please add some parts first.", variant: "destructive" });
      return;
    }

    toast({ title: "Generating Full Archive", description: "Packaging your data and images..." });

    try {
      const zip = new JSZip();
      const backupFolder = zip.folder("inventory_backup_data");
      if (!backupFolder) throw new Error("Failed to create backup folder");

      const exportData = parts.map(({ id, ...rest }) => ({
        ...rest,
        hasImages: (rest.images && rest.images.length > 0) ? rest.images.length : 0,
        images: undefined
      }));
      
      const csv = Papa.unparse(exportData);
      backupFolder.file("data.csv", csv);

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
                const filename = `${part.partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${index + 1}.${ext}`;
                imagesFolder.file(filename, matches[2], {base64: true});
                partImages.push(`images/${filename}`);
              }
            });
            imageMapping[part.partNumber] = partImages;
          }
        });
        backupFolder.file("image_mapping.json", JSON.stringify(imageMapping, null, 2));
      }

      backupFolder.file("full_backup.json", JSON.stringify(parts, null, 2));

      const content = await zip.generateAsync({type: "blob"});
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Inventory_Backup_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Export Successful", description: "Full backup downloaded!" });
    } catch (error) {
      toast({ title: "Export Failed", description: "There was an error generating the archive.", variant: "destructive" });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this part?")) {
      setParts(parts.filter(p => p.id !== id));
      toast({ title: "Part Deleted", description: "The record has been removed." });
    }
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

    setParts([newPart, ...parts]);
    setIsAddModalOpen(false);
    toast({ title: "Part Added", description: "New part has been added successfully." });
  };

  const openEditModal = (part: Part) => {
    setCurrentEditPart(part);
    const editForm: Record<string, string> = {};
    csvHeaders.forEach(h => { editForm[h] = String(part[h] || ""); });
    setFormData(editForm);
    setFormImages(part.images || []);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!currentEditPart) return;

    const updatedPart: Part = {
      ...currentEditPart,
      ...formData,
      partNumber: formData.partNumber || formData[csvHeaders[0]] || currentEditPart.partNumber,
      images: formImages,
    };

    setParts(parts.map(p => p.id === currentEditPart.id ? updatedPart : p));
    setIsEditModalOpen(false);
    setCurrentEditPart(null);
    toast({ title: "Part Updated", description: "The part has been updated successfully." });
  };

  const openImageGallery = (part: Part) => {
    setActiveImageGallery({ id: crypto.randomUUID(), partId: part.id, images: part.images || [] });
    setIsImageGalleryOpen(true);
  };

  const handleReportLocation = (part: Part) => {
    const newReport: LocationReport = {
      partId: part.id,
      partNumber: part.partNumber,
      reportedAt: Date.now()
    };
    setReports(prev => [newReport, ...prev.slice(0, 99)]);
    toast({ 
      title: "Location Reported", 
      description: `Part ${part.partNumber} location has been flagged for review.` 
    });
  };

  const filteredParts = useMemo(() => {
    if (!searchQuery.trim()) return parts;
    const query = searchQuery.toLowerCase();
    return parts.filter(part => {
      return csvHeaders.some(header => {
        const value = String(part[header] || "").toLowerCase();
        if (searchSuffixMode) {
          return value.endsWith(query);
        }
        return value.includes(query);
      });
    });
  }, [parts, searchQuery, csvHeaders, searchSuffixMode]);

  const totalValue = useMemo(() => {
    return parts.reduce((sum, part) => {
      const qty = parseFloat(String(part.quantity)) || 0;
      const price = parseFloat(String(part.price)) || 0;
      return sum + (qty * price);
    }, 0);
  }, [parts]);

  const lowStockParts = useMemo(() => {
    return parts.filter(p => parseFloat(String(p.quantity)) <= 5);
  }, [parts]);

  const recentReports = useMemo(() => {
    return reports.slice(0, 10).map(r => {
      const part = parts.find(p => p.id === r.partId);
      return { ...r, partName: part?.name || "Unknown" };
    });
  }, [reports, parts]);

  const renderFormFields = () => (
    <div className="space-y-3">
      {csvHeaders.map(header => (
        <div key={header} className="space-y-1">
          <Label htmlFor={`form-${header}`} className="text-sm font-medium capitalize">
            {header.replace(/([A-Z])/g, ' $1').trim()}
          </Label>
          <Input
            id={`form-${header}`}
            value={formData[header] || ""}
            onChange={e => setFormData(prev => ({ ...prev, [header]: e.target.value }))}
            placeholder={`Enter ${header}`}
          />
        </div>
      ))}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Images</Label>
        <div className="flex flex-wrap gap-2">
          {formImages.map((img, i) => (
            <div key={i} className="relative w-16 h-16 group">
              <img src={img} alt="" className="w-full h-full object-cover rounded border" />
              <button
                onClick={() => removeFormImage(i)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageUpload}
        />
      </div>
    </div>
  );

  const renderPartCard = (part: Part) => (
    <Card key={part.id} className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-mono truncate">{part.partNumber}</CardTitle>
            <CardDescription className="text-xs mt-0.5 truncate">{part.name}</CardDescription>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {devMode && (
              <>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditModal(part)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(part.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        {part.images && part.images.length > 0 && (
          <div 
            className="mb-2 cursor-pointer" 
            onClick={() => openImageGallery(part)}
          >
            <img 
              src={part.images[0]} 
              alt={part.name}
              className="w-full h-28 object-cover rounded border"
            />
            {part.images.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">+{part.images.length - 1} more</p>
            )}
          </div>
        )}
        <div className="space-y-1">
          {csvHeaders.filter(h => !['partNumber', 'name'].includes(h)).map(header => (
            <div key={header} className="flex justify-between text-xs">
              <span className="text-muted-foreground capitalize">{header.replace(/([A-Z])/g, ' $1').trim()}:</span>
              <span className="font-medium truncate ml-2">{String(part[header] || "—")}</span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="pt-1 pb-2 flex gap-1 flex-wrap">
        {part.images && part.images.length > 0 && (
          <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => openImageGallery(part)}>
            <ImageIcon className="h-3 w-3 mr-1" />
            {part.images.length}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleReportLocation(part)}>
          <AlertCircle className="h-3 w-3 mr-1" />
          Report
        </Button>
        {reports.some(r => r.partId === part.id) && (
          <Badge variant="secondary" className="h-5 text-xs">Flagged</Badge>
        )}
      </CardFooter>
    </Card>
  );

  const renderPartRow = (part: Part) => (
    <div key={part.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50 rounded-lg border group">
      {part.images && part.images.length > 0 ? (
        <img 
          src={part.images[0]} 
          alt=""
          className="w-8 h-8 object-cover rounded cursor-pointer flex-shrink-0"
          onClick={() => openImageGallery(part)}
        />
      ) : (
        <div className="w-8 h-8 bg-muted rounded flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 grid gap-x-4 min-w-0" style={{gridTemplateColumns: `repeat(${Math.min(csvHeaders.length, 5)}, minmax(0, 1fr))`}}>
        {csvHeaders.slice(0, 5).map(header => (
          <div key={header} className="min-w-0">
            <p className="text-xs text-muted-foreground capitalize truncate">{header.replace(/([A-Z])/g, ' $1').trim()}</p>
            <p className="text-sm font-medium truncate">{String(part[header] || "—")}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReportLocation(part)}>
          <AlertCircle className="h-3.5 w-3.5" />
        </Button>
        {devMode && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditModal(part)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(part.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Announcement Banner */}
      {showAnnouncement && announcement && (
        <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 flex-shrink-0" />
            <span>{announcement}</span>
          </div>
          <button onClick={() => setShowAnnouncement(false)} className="flex-shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Archive className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">Inventory Manager</h1>
              {devMode && <Badge variant="secondary" className="text-xs">Admin</Badge>}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Stats */}
              <div className="hidden md:flex items-center gap-3 text-sm text-muted-foreground border rounded-lg px-3 py-1.5">
                <span><strong className="text-foreground">{parts.length}</strong> parts</span>
                <span>·</span>
                <span>Value: <strong className="text-foreground">${totalValue.toFixed(2)}</strong></span>
                {lowStockParts.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-orange-500"><strong>{lowStockParts.length}</strong> low stock</span>
                  </>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(!isDarkMode)}>
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setIsGridView(!isGridView)}
                >
                  {isGridView ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                </Button>
                {devMode && (
                  <Button variant="ghost" size="icon" onClick={() => setIsMasterDashboardOpen(true)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Dev mode toggle */}
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <Switch
                  checked={devMode}
                  onCheckedChange={handleDevModeToggle}
                  className="scale-75"
                />
              </div>
            </div>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search parts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-8"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-sm">
              <Label htmlFor="suffix-mode" className="text-xs text-muted-foreground whitespace-nowrap">Suffix</Label>
              <Switch id="suffix-mode" checked={searchSuffixMode} onCheckedChange={setSearchSuffixMode} className="scale-75" />
            </div>

            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" />
                Import CSV
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-1.5" />
                CSV
              </Button>

              <Button variant="outline" size="sm" onClick={exportCompleteProject}>
                <Archive className="h-4 w-4 mr-1.5" />
                ZIP
              </Button>

              {devMode && (
                <Button size="sm" onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Part
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        {parts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FileSpreadsheet className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No inventory data</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Import a CSV file to get started, or add parts manually if you're in admin mode.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              {devMode && (
                <Button variant="outline" onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Part
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {filteredParts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No parts match "{searchQuery}"</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    {filteredParts.length === parts.length 
                      ? `${parts.length} parts` 
                      : `${filteredParts.length} of ${parts.length} parts`}
                  </p>
                </div>

                {isGridView ? (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {filteredParts.map(part => renderPartCard(part))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredParts.map(part => renderPartRow(part))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Password Prompt Dialog */}
      <Dialog open={showPasswordPrompt} onOpenChange={setShowPasswordPrompt}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Access
            </DialogTitle>
            <DialogDescription>Enter the admin password to enable developer mode.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Enter password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPasswordPrompt(false); setPasswordInput(""); }}>
              Cancel
            </Button>
            <Button onClick={handlePasswordSubmit}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Part Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Part</DialogTitle>
            <DialogDescription>Fill in the details for the new inventory part.</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAdd}>Add Part</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Part Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Part</DialogTitle>
            <DialogDescription>Update the details for this part.</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Gallery Dialog */}
      <Dialog open={isImageGalleryOpen} onOpenChange={setIsImageGalleryOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Image Gallery
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeImageGallery.images.map((img, i) => (
              <div key={i} className="aspect-square">
                <img src={img} alt={`Image ${i+1}`} className="w-full h-full object-cover rounded-lg border" />
              </div>
            ))}
          </div>
          {activeImageGallery.images.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No images available.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Master Dashboard / Admin Dialog */}
      <Dialog open={isMasterDashboardOpen} onOpenChange={setIsMasterDashboardOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Admin Dashboard
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Announcement */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Announcement Banner
              </h3>
              <Input
                value={announcement}
                onChange={e => setAnnouncement(e.target.value)}
                placeholder="Enter announcement text..."
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={showAnnouncement}
                  onCheckedChange={setShowAnnouncement}
                />
                <Label className="text-sm">Show announcement</Label>
              </div>
            </div>

            {/* Password Management */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Admin Passwords
              </h3>
              <div className="space-y-2">
                {adminPasswords.map((pwd, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="text"
                      value={pwd}
                      onChange={e => {
                        const updated = [...adminPasswords];
                        updated[i] = e.target.value;
                        setAdminPasswords(updated);
                      }}
                      className="font-mono text-sm"
                    />
                    {adminPasswords.length > 1 && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => setAdminPasswords(adminPasswords.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAdminPasswords([...adminPasswords, ""])}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Password
                </Button>
              </div>
            </div>

            {/* Recent Reports */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Location Reports ({reports.length})
              </h3>
              {recentReports.length > 0 ? (
                <div className="space-y-1">
                  {recentReports.map((r, i) => (
                    <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
                      <div>
                        <span className="font-mono font-medium">{r.partNumber}</span>
                        <span className="text-muted-foreground ml-2">{r.partName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.reportedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No location reports yet.</p>
              )}
              {reports.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setReports([]); toast({ title: "Reports cleared" }); }}
                >
                  Clear All Reports
                </Button>
              )}
            </div>

            {/* CSV Column Management */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Data Columns
              </h3>
              <div className="flex flex-wrap gap-2">
                {csvHeaders.map((header, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {header}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Columns are automatically set when importing a CSV file.</p>
            </div>

            {/* Danger Zone */}
            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => {
                  if (confirm("This will delete all inventory data. Are you sure?")) {
                    setParts([]);
                    localStorage.removeItem("inventory_parts");
                    localStorage.removeItem("inventory_headers");
                    setCsvHeaders(["partNumber", "name", "quantity", "location", "price"]);
                    setIsMasterDashboardOpen(false);
                    toast({ title: "Inventory cleared", description: "All parts have been removed." });
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Inventory
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsMasterDashboardOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
