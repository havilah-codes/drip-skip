"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { getSmartFeed } from "@/lib/smartFeed";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import BottomNav from "@/components/BottomNav";
import { FeedSkeleton } from "@/components/skeletons/SkeletonPulse";
import NotificationPrompt from "@/components/NotificationPrompt";
import PostCard from "@/components/PostCard";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { linkHashtagsToPost } from "@/lib/hashtags";
import { extractVideoFrame } from "@/lib/videoThumbnail";
import { compressImage } from "@/lib/imageCompression";
import { compressVideo } from "@/lib/videoCompression";

export default function FeedPage() {
  const router = useRouter();

  // ==========================================
  // AUTH
  // ==========================================

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // ==========================================
  // PROFILE
  // ==========================================

  const [displayName, setDisplayName] = useState("Drip User");
  const [avatar, setAvatar] = useState("/default-avatar.png");

  // ==========================================
  // POSTS
  // ==========================================

  const [post, setPost] = useState("");
  const [posts, setPosts] = useState<any[]>([]);

  const [posting, setPosting] = useState(false);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);

  // ==========================================
  // MEDIA
  // ==========================================

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [thumbnailSeeking, setThumbnailSeeking] = useState(false);

  // ==========================================
  // CAMERA & RECORDING
  // ==========================================

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // CAMERA ENHANCEMENTS (Lighting, Zoom, Aspect Ratio)
  const [screenLight, setScreenLight] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(3);
  const [aspectRatio, setAspectRatio] = useState<"full" | "1:1" | "9:16">("full");

  // Video Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================
  // AUTH LISTENER
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        if (!currentUser) {
          router.replace("/login");
          return;
        }

        try {
          await syncProfile(currentUser);
          setUser(currentUser);

          setDisplayName(
            currentUser.displayName ||
              currentUser.email?.split("@")[0] ||
              "Drip User"
          );

          if (currentUser.photoURL) {
            setAvatar(currentUser.photoURL);
          }

          setAuthLoading(false);
        } catch (error) {
          console.error("❌ PROFILE SYNC FAILED:", error);
          setAuthLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  // ==========================================
  // SMART FEED LOADER
  // ==========================================

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const loadSmartFeed = async () => {
      setFeedLoading(true);
      setPostsLoading(true);

      try {
        const profile = await syncProfile(user);

        if (!profile?.id) {
          throw new Error("Could not find Supabase profile.");
        }

        const smartPosts = await getSmartFeed({
          profileId: profile.id,
          limit: 50,
        });

        if (cancelled) return;
        setPosts(smartPosts);
      } catch (error) {
        console.error("❌ SMART FEED FAILED:", error);
        if (!cancelled) {
          setPosts([]);
        }
      } finally {
        if (!cancelled) {
          setFeedLoading(false);
          setPostsLoading(false);
        }
      }
    };

    loadSmartFeed();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ==========================================
  // CONNECT CAMERA STREAM & ENHANCE TRACKS
  // ==========================================

  useEffect(() => {
    if (!videoRef.current || !cameraStream) {
      return;
    }

    videoRef.current.srcObject = cameraStream;
    videoRef.current.play().catch(() => {});

    const track = cameraStream.getVideoTracks()[0];
    if (track && "getCapabilities" in track) {
      const capabilities = (track as any).getCapabilities();
      
      // Hardware zoom limits detection
      if (capabilities.zoom) {
        setMaxZoom(capabilities.zoom.max || 3);
      }

      // Continuous Autofocus
      if ("focusMode" in capabilities && capabilities.focusMode?.includes("continuous")) {
        track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as any],
        }).catch(() => {});
      }
    }
  }, [cameraStream]);

  // Handle Zoom change
  const applyZoom = (newZoom: number) => {
    setZoomLevel(newZoom);

    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];

    if (track && "applyConstraints" in track) {
      const capabilities = "getCapabilities" in track ? (track as any).getCapabilities() : {};
      if (capabilities.zoom) {
        (track as any).applyConstraints({
          advanced: [{ zoom: newZoom }],
        }).catch(() => {});
      }
    }
  };

  // ==========================================
  // CAMERA CLEANUP
  // ==========================================

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
    setZoomLevel(1);
    setScreenLight(false);
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [cameraStream]);

  // ==========================================
  // START HIGH-QUALITY CAMERA STREAM
  // ==========================================

  const startCamera = async (mode: "environment" | "user") => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support camera access.");
        return;
      }

      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      // High-resolution camera constraint configurations
      const highQualityVideoConstraints: MediaTrackConstraints = {
        facingMode: mode,
        width: { ideal: 3840, min: 1920 },
        height: { ideal: 2160, min: 1080 },
        frameRate: { ideal: 60, min: 30 },
      };

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: highQualityVideoConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch {
        // Fallback constraint set if max specs fail
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: true,
        });
      }

      setCameraStream(stream);
      setZoomLevel(1);
      setCameraOpen(true);
    } catch (error) {
      console.error("CAMERA ERROR:", error);
      alert("Could not access camera/microphone. Please enable permissions and try again.");
    }
  };

  const openCamera = () => {
    startCamera(facingMode);
  };

  const flipCamera = () => {
    if (isRecording) return;
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  // ==========================================
  // HIGH-RESOLUTION SNAPSHOT PHOTO
  // ==========================================

  const takePhoto = () => {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      alert("Camera is not ready yet. Please try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    // Smoother canvas downscaling rendering
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    if (facingMode === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Uncompressed JPEG snapshot export
    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const file = new File([blob], `drip-camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        setSelectedImage(file);
        setSelectedVideo(null);
        closeCamera();
      },
      "image/jpeg",
      0.98
    );
  };

  // ==========================================
  // HIGH-BITRATE VIDEO RECORDING
  // ==========================================

  const startRecording = () => {
    if (!cameraStream) return;

    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    // High bitrate allocation (8 Mbps) for zero blockiness
    const mediaRecorder = new MediaRecorder(cameraStream, {
      mimeType,
      videoBitsPerSecond: 8000000,
      audioBitsPerSecond: 128000,
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `drip-video-${Date.now()}.${extension}`, {
        type: mimeType,
      });

      setSelectedVideo(file);
      setSelectedImage(null);
      closeCamera();

      // Auto-extract a thumbnail from the recorded video
      extractVideoFrame(file, 0.5).then((frame) => {
        if (frame) setVideoThumbnail(frame);
      });
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000);

    setIsRecording(true);
    setRecordingTime(0);

    timerIntervalRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // ==========================================
  // IMAGE & VIDEO SELECT
  // ==========================================

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedImage(file);
    setSelectedVideo(null);
    setVideoThumbnail(null);
    event.target.value = "";
  };

  const handleVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedVideo(file);
    setSelectedImage(null);
    event.target.value = "";

    // Auto-extract a thumbnail frame
    extractVideoFrame(file, 0.5).then((frame) => {
      if (frame) setVideoThumbnail(frame);
    });
  };

  // ==========================================
  // CREATE POST
  // ==========================================

  const handlePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!post.trim() && !selectedImage && !selectedVideo) return;
    if (!user) return;

    setPosting(true);

    try {
      const profile = await syncProfile(user);
      if (!profile?.id) throw new Error("Could not find Supabase profile.");

      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      if (selectedImage) {
        // Compress the image before uploading
        let imageToUpload: Blob = selectedImage;
        if (selectedImage.type !== "image/gif") {
          try {
            imageToUpload = await compressImage(selectedImage, 1600, 0.85);
            console.log("POST IMAGE COMPRESSED:", {
              originalSize: selectedImage.size,
              compressedSize: imageToUpload.size,
            });
          } catch (compressionError) {
            console.warn("Compression failed, using original:", compressionError);
            imageToUpload = selectedImage;
          }
        }

        const fileExtension = imageToUpload.type === "image/webp" ? "webp" : imageToUpload.type === "image/png" ? "png" : "jpg";
        const filePath = `${profile.id}/${crypto.randomUUID()}.${fileExtension}`;

        const { error: imageUploadError } = await supabase.storage
          .from("post-images")
          .upload(filePath, imageToUpload, {
            contentType: imageToUpload.type || "image/jpeg",
          });

        if (imageUploadError) throw imageUploadError;

        const { data: imagePublicData } = supabase.storage
          .from("post-images")
          .getPublicUrl(filePath);

        imageUrl = imagePublicData.publicUrl;
      }

      if (selectedVideo) {
        // Compress the video before uploading
        let videoToUpload: Blob = selectedVideo;
        try {
          videoToUpload = await compressVideo(selectedVideo, 720, 8, 30);
          console.log("POST VIDEO COMPRESSED:", {
            originalSize: selectedVideo.size,
            compressedSize: videoToUpload.size,
          });
        } catch (compressionError) {
          console.warn("Video compression failed, using original:", compressionError);
          videoToUpload = selectedVideo;
        }

        const fileExtension = videoToUpload.type === "video/webm" ? "webm" : selectedVideo.name.split(".").pop() || "mp4";
        const filePath = `${profile.id}/${crypto.randomUUID()}.${fileExtension}`;

        const { error: videoUploadError } = await supabase.storage
          .from("post-videos")
          .upload(filePath, videoToUpload, {
            contentType: videoToUpload.type || "video/mp4",
          });

        if (videoUploadError) throw videoUploadError;

        const { data: videoPublicData } = supabase.storage
          .from("post-videos")
          .getPublicUrl(filePath);

        videoUrl = videoPublicData.publicUrl;
      }

      const { data: newPost, error: postError } = await supabase
        .from("posts")
        .insert({
          user_id: profile.id,
          text: post.trim() || null,
          image_url: imageUrl,
          video_url: videoUrl,
        })
        .select(`
          id,
          text,
          image_url,
          video_url,
          created_at,
          user_id,
          profiles (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .single();

      if (postError) throw postError;

      if (newPost) {
        setPosts((currentPosts) => [newPost, ...currentPosts]);

        // Extract and store hashtags
        linkHashtagsToPost(newPost.id, post.trim()).catch((err) =>
          console.error("❌ HASHTAG LINKING FAILED:", err)
        );
      }

      setPost("");
      setSelectedImage(null);
      setSelectedVideo(null);
    } catch (error) {
      console.error("❌ POST CREATION FAILED:", error);
      alert("Could not create your post. Check console for details.");
    } finally {
      setPosting(false);
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await signOut(firebaseAuth);
      router.replace("/login");
    } catch (error) {
      console.error("LOGOUT ERROR:", error);
      setLoggingOut(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-20">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
            <span className="text-xl font-black tracking-tight font-display">Drip or Skip</span>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
          <FeedSkeleton count={3} />
        </div>
        <BottomNav />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg text-text-p pb-20">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/feed" className="text-xl font-black tracking-tight font-display">
            Drip or Skip
          </Link>

          <nav className="hidden sm:flex items-center gap-6">
            <Link href="/feed" className="text-sm text-text-p font-medium">
              Feed
            </Link>
            <Link
              href="/profile"
              className="text-sm text-text-s hover:text-text-p transition-colors font-medium"
            >
              Profile
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/profile">
              <img
                src={avatar}
                alt=""
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-border-d hover:border-zinc-500 transition-colors"
              />
            </Link>

            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="text-[11px] text-text-t">{user.email}</p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-xs text-text-s hover:text-text-p transition-colors disabled:opacity-50 ml-1"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>
      </header>

      {/* FEED CONTENT */}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <section className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold font-display">
            Welcome back, {displayName.split(" ")[0]}.
          </h1>
          <p className="text-sm text-text-t mt-1">
            See what the council is talking about.
          </p>
        </section>

        {/* NOTIFICATION PROMPT */}

        <NotificationPrompt />

        {/* CREATE POST COMPOSER */}
        <section className="rounded-2xl border border-border-d bg-bg-raised p-3 sm:p-4 mb-6">
          <div className="flex gap-3">
            <img
              src={avatar}
              alt=""
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0"
            />

            <form onSubmit={handlePost} className="flex-1 min-w-0">
              <textarea
                value={post}
                onChange={(e) => setPost(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                disabled={posting}
                className="w-full resize-none bg-transparent outline-none text-sm text-text-p placeholder:text-text-m disabled:opacity-50"
              />

              {/* IMAGE PREVIEW */}
              {selectedImage && (
                <div className="mt-3 relative rounded-xl overflow-hidden border border-border-d">
                  <img
                    src={URL.createObjectURL(selectedImage)}
                    alt="Selected"
                    className="w-full max-h-80 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    disabled={posting}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-bg/80 text-text-p flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* VIDEO PREVIEW */}
              {selectedVideo && (
                <div className="mt-3 relative rounded-xl overflow-hidden border border-border-d">
                  {thumbnailSeeking ? (
                    <VideoFramePicker
                      file={selectedVideo}
                      onFramePick={(frame) => {
                        setVideoThumbnail(frame);
                        setThumbnailSeeking(false);
                      }}
                      onCancel={() => setThumbnailSeeking(false)}
                    />
                  ) : videoThumbnail ? (
                    <div className="relative">
                      <img
                        src={videoThumbnail}
                        alt="Video thumbnail"
                        className="w-full max-h-80 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setThumbnailSeeking(true)}
                        className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-bg/70 text-text-p text-[11px] font-medium backdrop-blur-sm hover:bg-bg/80 transition-colors"
                      >
                        🎬 Pick thumbnail
                      </button>
                    </div>
                  ) : (
                    <div className="w-full max-h-80 bg-bg-sunken flex items-center justify-center py-12">
                      <span className="text-sm text-text-t animate-pulse">Loading preview...</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectedVideo(null); setVideoThumbnail(null); }}
                    disabled={posting}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-bg/80 text-text-p flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* ACTION BAR */}
              <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-border-s">
                <div className="flex items-center gap-1 sm:gap-2">
                  <label
                    htmlFor="post-image"
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-text-s hover:text-text-p hover:bg-bg-sunken cursor-pointer transition-all"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span className="hidden sm:inline">Photo</span>
                  </label>
                  <input
                    id="post-image"
                    type="file"
                    accept="image/*"
                    disabled={posting}
                    className="hidden"
                    onChange={handleImageSelect}
                  />

                  <label
                    htmlFor="post-video"
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-text-s hover:text-text-p hover:bg-bg-sunken cursor-pointer transition-all"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="13" height="14" rx="2" />
                      <path d="m16 10 5-3v10l-5-3z" />
                    </svg>
                    <span className="hidden sm:inline">Video</span>
                  </label>
                  <input
                    id="post-video"
                    type="file"
                    accept="video/*"
                    disabled={posting}
                    className="hidden"
                    onChange={handleVideoSelect}
                  />

                  <button
                    type="button"
                    onClick={openCamera}
                    disabled={posting}
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-text-s hover:text-text-p hover:bg-bg-sunken transition-all disabled:opacity-50"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 4h-5L7.5 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2.5z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    <span className="hidden sm:inline">Camera</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={
                    posting ||
                    (!post.trim() && !selectedImage && !selectedVideo)
                  }
                  className="px-4 sm:px-5 py-2 rounded-xl bg-btn text-btn-text text-xs font-bold transition-all hover:bg-btn/80 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  {posting ? "Posting..." : "Post"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* FEED POSTS */}
        <section>
          {feedLoading ? (
            <FeedSkeleton count={2} />
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-border-s bg-bg-raised p-8 text-center">
              <h2 className="font-semibold font-display">Your feed is empty</h2>
              <p className="text-sm text-text-t mt-2">
                Follow some people or create a post to get things moving.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* CAMERA MODAL */}
      {cameraOpen && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col transition-colors duration-200 ${
            screenLight ? "bg-white text-black" : "bg-black text-white"
          }`}
        >
          {/* CAMERA HEADER */}
          <div
            className={`flex items-center justify-between px-4 py-3 border-b ${
              screenLight ? "border-zinc-200 bg-white" : "border-zinc-900 bg-black"
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">Camera</h2>
              {isRecording && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {formatTime(recordingTime)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScreenLight(!screenLight)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  screenLight
                    ? "bg-amber-400 text-black shadow-md shadow-amber-300/30"
                    : "bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                <span>💡</span>
                <span>{screenLight ? "Light On" : "Light"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (aspectRatio === "full") setAspectRatio("1:1");
                  else if (aspectRatio === "1:1") setAspectRatio("9:16");
                  else setAspectRatio("full");
                }}
                className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  screenLight
                    ? "bg-zinc-200 text-zinc-900"
                    : "bg-zinc-900 text-zinc-300 hover:text-white"
                }`}
              >
                {aspectRatio.toUpperCase()}
              </button>

              <button
                type="button"
                onClick={closeCamera}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xl ${
                  screenLight
                    ? "bg-zinc-200 text-black hover:bg-zinc-300"
                    : "bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                ×
              </button>
            </div>
          </div>

          {/* CAMERA PREVIEW CONTAINER */}
          <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden p-2">
            <div
              className={`relative overflow-hidden rounded-2xl flex items-center justify-center transition-all ${
                aspectRatio === "1:1"
                  ? "aspect-square w-full max-w-md"
                  : aspectRatio === "9:16"
                  ? "aspect-[9/16] h-full max-h-[70vh]"
                  : "w-full h-full max-w-2xl"
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ transform: `scale(${zoomLevel}) ${facingMode === "user" ? "scaleX(-1)" : ""}` }}
                className="w-full h-full object-cover transition-transform duration-100 ease-out"
              />
            </div>

            {/* ZOOM TOGGLES OVERLAY */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full z-10 border border-white/10">
              {[1, 1.5, 2, 3].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => applyZoom(z)}
                  className={`w-7 h-7 rounded-full text-[11px] font-bold transition-all ${
                    zoomLevel === z
                      ? "bg-white text-black scale-110"
                      : "text-zinc-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>

          {/* CAMERA CONTROLS BAR */}
          <div
            className={`p-6 flex items-center justify-around border-t transition-colors ${
              screenLight ? "border-zinc-200 bg-white" : "border-zinc-900 bg-black"
            }`}
          >
            <button
              type="button"
              onClick={flipCamera}
              disabled={isRecording}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 ${
                screenLight
                  ? "bg-zinc-100 border-zinc-300 text-black"
                  : "bg-zinc-900 border-zinc-800 text-white"
              }`}
              aria-label="Flip camera"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                <polyline points="16 2 20 5 16 8" />
                <polyline points="8 22 4 19 8 16" />
              </svg>
            </button>

            <button
              type="button"
              onClick={takePhoto}
              disabled={isRecording}
              className={`w-16 h-16 rounded-full border-4 shadow-lg active:scale-95 transition-transform disabled:opacity-40 ${
                screenLight
                  ? "bg-black border-zinc-300"
                  : "bg-white border-zinc-400"
              }`}
              aria-label="Take photo"
            />

            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                isRecording
                  ? "border-red-500 bg-red-500/20 text-red-500 scale-105"
                  : "border-red-600 bg-red-600 text-white"
              }`}
              aria-label={isRecording ? "Stop recording" : "Record video"}
            >
              <div
                className={`transition-all ${
                  isRecording ? "w-4 h-4 bg-red-500 rounded-sm" : "w-5 h-5 bg-white rounded-full"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

// =====================================================
// VIDEO FRAME PICKER — lets user scrub through video to pick a thumbnail
// =====================================================

function VideoFramePicker({
  file,
  onFramePick,
  onCancel,
}: {
  file: File;
  onFramePick: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const videoUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const handleSeek = useCallback(() => {
    const frame = captureCurrentFrame();
    if (frame) setPreviewFrame(frame);
  }, [captureCurrentFrame]);

  const handleConfirm = useCallback(() => {
    const frame = captureCurrentFrame();
    if (frame) onFramePick(frame);
  }, [captureCurrentFrame, onFramePick]);

  return (
    <div className="bg-bg-sunken rounded-xl overflow-hidden">
      {/* Video preview area */}
      <div className="relative">
        {previewFrame ? (
          <img
            src={previewFrame}
            alt="Selected frame"
            className="w-full max-h-80 object-cover"
          />
        ) : (
          <div className="w-full max-h-80 bg-bg-raised flex items-center justify-center py-12">
            <span className="text-sm text-text-t animate-pulse">Loading...</span>
          </div>
        )}
      </div>

      {/* Hidden video for seeking */}
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        preload="auto"
        onLoadedData={() => {
          const v = videoRef.current;
          if (v) {
            setDuration(v.duration);
            v.currentTime = 0.5;
          }
        }}
        onSeeked={handleSeek}
        className="hidden"
      />

      {/* Seek slider */}
      <div className="px-3 pt-3 pb-2">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const t = parseFloat(e.target.value);
            setCurrentTime(t);
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
          className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-cyan-400"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-text-t font-medium tabular-nums">
            {Math.floor(currentTime)}s / {Math.floor(duration)}s
          </span>
          <span className="text-[10px] text-text-m">Drag to pick a frame</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-xl border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="flex-1 px-3 py-2 rounded-xl bg-btn text-btn-text text-xs font-bold hover:bg-btn/80 transition-colors"
        >
          Use this frame
        </button>
      </div>
    </div>
  );
}