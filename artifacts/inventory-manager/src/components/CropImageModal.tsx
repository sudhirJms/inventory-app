import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Check, X, RotateCcw } from "lucide-react";

interface CropImageModalProps {
  open: boolean;
  imageDataUrl: string;
  onClose: () => void;
  onCrop: (croppedDataUrl: string) => void;
}

export function CropImageModal({ open, imageDataUrl, onClose, onCrop }: CropImageModalProps) {
  const CONTAINER = 280;
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (open) { setZoom(1); setPanX(0); setPanY(0); }
  }, [open, imageDataUrl]);

  const startDrag = (x: number, y: number) => {
    isDragging.current = true;
    lastPos.current = { x, y };
  };
  const moveDrag = (x: number, y: number) => {
    if (!isDragging.current) return;
    setPanX(p => p + (x - lastPos.current.x));
    setPanY(p => p + (y - lastPos.current.y));
    lastPos.current = { x, y };
  };
  const endDrag = () => { isDragging.current = false; };

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 600, 600);
    const scale = 600 / CONTAINER;
    const displayW = img.naturalWidth * zoom;
    const displayH = img.naturalHeight * zoom;
    const imgLeft = CONTAINER / 2 - displayW / 2 + panX;
    const imgTop = CONTAINER / 2 - displayH / 2 + panY;
    const srcX = (0 - imgLeft) / zoom;
    const srcY = (0 - imgTop) / zoom;
    const srcW = CONTAINER / zoom;
    const srcH = CONTAINER / zoom;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 600, 600);
    onCrop(canvas.toDataURL("image/jpeg", 0.88));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[340px] dark:bg-neutral-900 dark:border-neutral-800 p-4">
        <DialogHeader>
          <DialogTitle className="dark:text-white text-base">Crop Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className="relative mx-auto overflow-hidden rounded-xl border-2 border-primary cursor-grab active:cursor-grabbing select-none bg-neutral-800"
            style={{ width: CONTAINER, height: CONTAINER, touchAction: "none" }}
            onMouseDown={(e) => { startDrag(e.clientX, e.clientY); e.preventDefault(); }}
            onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={endDrag}
          >
            <img
              ref={imgRef}
              src={imageDataUrl}
              alt="crop"
              draggable={false}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
                maxWidth: "none",
                transformOrigin: "center",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
            <div className="absolute inset-0 pointer-events-none border-2 border-white/30 rounded-xl" />
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: `${CONTAINER/3}px ${CONTAINER/3}px`
            }} />
          </div>

          <div className="flex items-center gap-3 px-1">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range" min={0.5} max={4} step={0.05} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary cursor-pointer"
            />
            <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400 dark:text-neutral-500">Drag to pan · Pinch/slider to zoom</p>
            <button onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="dark:border-neutral-700 flex-1">
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={handleCrop} className="flex-1">
            <Check className="w-3.5 h-3.5 mr-1" /> Use Photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
