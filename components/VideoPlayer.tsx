"use client";

import {
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
} from "lucide-react";
import {
  playVideo,
  pauseVideo,
} from "@/lib/videoManager";

type VideoPlayerProps = {
  src: string;
  className?: string;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({
  src,
  className = "",
}: VideoPlayerProps) {
  const videoId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [showPlayIcon, setShowPlayIcon] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // =====================================================
  // INTERSECTION OBSERVER — play only when visible,
  // delegate to manager so only one video plays at a time
  // =====================================================

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!hasStarted) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          // Ask the manager to play — it will pause any other video first
          playVideo(videoId, video);
          setPlaying(true);
        } else if (!entry.isIntersecting) {
          // Left viewport entirely — pause
          pauseVideo(videoId);
          setPlaying(false);
        }
        // Between 0-50% visible: do nothing (keep current state)
      },
      {
        // Two thresholds: fully out (0) and 50% visible
        threshold: [0, 0.5],
      }
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
      // When unmounting, pause if this video was playing
      pauseVideo(videoId);
    };
  }, [videoId, hasStarted]);

  // =====================================================
  // CLEAN UP on unmount
  // =====================================================

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // =====================================================
  // TIME & BUFFER UPDATES
  // =====================================================

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || dragging) return;
    setCurrentTime(video.currentTime);
  }, [dragging]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
    }
  }, []);

  const handleProgress = useCallback(() => {
    const video = videoRef.current;
    if (video && video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
  }, []);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setShowPlayIcon(true);
  }, []);

  // =====================================================
  // PLAY / PAUSE (user-initiated — goes through manager)
  // =====================================================

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      playVideo(videoId, video);
      setPlaying(true);
      setHasStarted(true);
    } else {
      pauseVideo(videoId);
      setPlaying(false);
    }
  }, [videoId]);

  const handleVideoClick = useCallback(() => {
    togglePlay();
    setShowPlayIcon(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowPlayIcon(false);
    }, 800);
  }, [togglePlay]);

  // =====================================================
  // MUTE
  // =====================================================

  const toggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video) return;
      video.muted = !video.muted;
      setMuted(video.muted);
    },
    []
  );

  // =====================================================
  // FULLSCREEN
  // =====================================================

  const toggleFullscreen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;

      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen();
      }
    },
    []
  );

  // =====================================================
  // PROGRESS BAR SEEK
  // =====================================================

  const seekToPosition = useCallback(
    (clientX: number) => {
      const bar = progressRef.current;
      const video = videoRef.current;
      if (!bar || !video || !duration) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width)
      );
      video.currentTime = ratio * duration;
      setCurrentTime(video.currentTime);
    },
    [duration]
  );

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDragging(true);
      seekToPosition(e.clientX);

      const handleMouseMove = (ev: MouseEvent) => {
        seekToPosition(ev.clientX);
      };

      const handleMouseUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [seekToPosition]
  );

  const handleProgressTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      setDragging(true);
      seekToPosition(e.touches[0].clientX);
    },
    [seekToPosition]
  );

  const handleProgressTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      seekToPosition(e.touches[0].clientX);
    },
    [seekToPosition]
  );

  const handleProgressTouchEnd = useCallback(() => {
    setDragging(false);
  }, []);

  // =====================================================
  // CONTROLS VISIBILITY (auto-hide after 3s)
  // =====================================================

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setControlsVisible(false);
    }, 3000);
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showControls();
    }
  }, [playing, showControls]);

  // =====================================================
  // RENDER
  // =====================================================

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferProgress =
    duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden group select-none ${className}`}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {/* VIDEO */}
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onEnded={handleEnded}
        onClick={handleVideoClick}
        className="w-full h-full object-contain"
      />

      {/* CENTER PLAY/PAUSE ICON */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${
          showPlayIcon ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-transform duration-200">
          {playing ? (
            <Pause size={28} className="text-white" />
          ) : (
            <Play size={28} className="text-white ml-1" />
          )}
        </div>
      </div>

      {/* INITIAL STATE — BIG PLAY BUTTON */}
      {!hasStarted && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer z-10"
          onClick={handleVideoClick}
        >
          <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-black/70 transition-all active:scale-95">
            <Play size={32} className="text-white ml-1.5" />
          </div>
        </div>
      )}

      {/* BOTTOM CONTROLS */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* GRADIENT */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

        <div className="relative px-3 pb-3 pt-8">
          {/* PROGRESS BAR */}
          <div
            ref={progressRef}
            className="relative w-full h-1 bg-white/20 rounded-full cursor-pointer group/progress hover:h-1.5 transition-all"
            onMouseDown={handleProgressMouseDown}
            onTouchStart={handleProgressTouchStart}
            onTouchMove={handleProgressTouchMove}
            onTouchEnd={handleProgressTouchEnd}
          >
            {/* Buffer */}
            <div
              className="absolute top-0 left-0 h-full bg-white/20 rounded-full"
              style={{ width: `${bufferProgress}%` }}
            />
            {/* Progress */}
            <div
              className="absolute top-0 left-0 h-full bg-white rounded-full"
              style={{ width: `${progress}%` }}
            />
            {/* Scrubber */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>

          {/* CONTROLS ROW */}
          <div className="flex items-center justify-between mt-2">
            {/* TIME */}
            <span className="text-[11px] text-white/70 font-medium tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* RIGHT BUTTONS */}
            <div className="flex items-center gap-2">
              {/* MUTE */}
              <button
                type="button"
                onClick={toggleMute}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>

              {/* FULLSCREEN */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Maximize size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
