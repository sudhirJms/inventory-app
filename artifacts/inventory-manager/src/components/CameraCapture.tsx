import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SwitchCamera, X, Camera } from "lucide-react";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isReady, setIsReady] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsReady(false);
  }, []);

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    stopStream();
    setError(null);
    try {
      // Check how many video devices exist
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === "videoinput");
      setHasMultipleCameras(videoDevices.length > 1);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsReady(true);
        };
      }
    } catch (e: any) {
      const msg =
        e.name === "NotAllowedError"
          ? "Camera permission denied. Please tap 'Allow' when prompted, or go to your browser settings → Site permissions → Camera and allow it."
          : e.name === "NotFoundError"
          ? "No camera found on this device."
          : e.name === "OverconstrainedError"
          ? "Camera constraint error — trying default camera."
          : `Camera error: ${e.message}`;
      setError(msg);
      // If facingMode failed, try without it
      if (e.name === "OverconstrainedError") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setIsReady(true); setError(null); };
          }
        } catch { /* keep original error */ }
      }
    }
  }, [stopStream]);

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopStream();
      setError(null);
    }
    return () => { stopStream(); };
  }, [open]);

  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !isReady) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopStream();
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden bg-black border-neutral-800">
        <div className="relative bg-black min-h-[320px] flex flex-col">

          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4 min-h-[320px]">
              <div className="p-4 bg-neutral-800 rounded-full">
                <Camera className="w-10 h-10 text-neutral-400" />
              </div>
              <p className="text-sm text-white/70 max-w-xs leading-relaxed">{error}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleClose} className="border-neutral-600 text-neutral-300">
                  Close
                </Button>
                <Button size="sm" onClick={() => startCamera(facingMode)} className="bg-blue-600 hover:bg-blue-700">
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full"
                style={{
                  minHeight: 240,
                  maxHeight: "60vh",
                  objectFit: "cover",
                  transform: facingMode === "user" ? "scaleX(-1)" : "none",
                  display: "block",
                }}
              />

              {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
                </div>
              )}
            </>
          )}

          {/* Controls overlay */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-center">
            <button
              onClick={handleClose}
              className="bg-black/60 p-2 rounded-full text-white hover:bg-black/80 active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            {hasMultipleCameras && !error && (
              <button
                onClick={flipCamera}
                className="bg-black/60 p-2 rounded-full text-white hover:bg-black/80 active:scale-95 transition-all"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Shutter button */}
          {isReady && !error && (
            <div className="py-6 flex justify-center bg-black/80">
              <button
                onClick={handleCapture}
                className="w-[68px] h-[68px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: "rgba(255,255,255,0.25)" }}
              >
                <div className="w-[52px] h-[52px] rounded-full bg-white shadow-inner" />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
