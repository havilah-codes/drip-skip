"use client";

import { useEffect, useState } from "react";
import { X, Download, Share2 } from "lucide-react";

type AvatarViewerProps = {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
  username?: string;
};

export default function AvatarViewer({
  src,
  alt,
  isOpen,
  onClose,
  username,
}: AvatarViewerProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setImageLoaded(false);
      setImageError(false);
    }
  }, [isOpen]);

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${username || "avatar"}-photo.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${alt}'s profile photo`,
          url: src,
        });
      } else {
        await navigator.clipboard.writeText(src);
      }
    } catch {
      // User cancelled or not supported
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 animate-in fade-in duration-200">
      {/* CLOSE BUTTON */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {/* USERNAME HEADER */}
      {username && (
        <div className="absolute top-4 left-4 z-10">
          <p className="text-white font-semibold text-sm">{alt}</p>
          <p className="text-white/60 text-xs">@{username}</p>
        </div>
      )}

      {/* IMAGE */}
      <div className="flex items-center justify-center w-full h-full p-4">
        {!imageError ? (
          <img
            src={src}
            alt={alt}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-300 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-white/60">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <span className="text-3xl">👤</span>
            </div>
            <p className="text-sm">Failed to load image</p>
          </div>
        )}

        {/* Loading spinner */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* BOTTOM ACTIONS */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <Download size={18} />
          Save
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <Share2 size={18} />
          Share
        </button>
      </div>
    </div>
  );
}
