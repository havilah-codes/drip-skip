"use client";

import {
  useEffect,
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
import PostCard from "@/components/PostCard";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

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
  // CONNECT CAMERA STREAM TO VIDEO & DETECT ZOOM
  // ==========================================

  useEffect(() => {
    if (!videoRef.current || !cameraStream) {
      return;
    }

    videoRef.current.srcObject = cameraStream;
    videoRef.current.play().catch(() => {});

    // Check hardware zoom limits if supported by browser/device
    const track = cameraStream.getVideoTracks()[0];
    if (track && "getCapabilities" in track) {
      const capabilities = (track as any).getCapabilities();
      if (capabilities.zoom) {
        setMaxZoom(capabilities.zoom.max || 3);
      }
    }
  }, [cameraStream]);

  // Handle Zoom change (hardware track constraints or fallback CSS transform)
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
  // START & FLIP CAMERA
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

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: mode } },
          audio: true,
        });
      } catch {
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
  // TAKE PHOTO
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

    const context = canvas.getContext("2d");
    if (!context) return;

    if (facingMode === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }

    // Render snapshot
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

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
      0.92
    );
  };

  // ==========================================
  // RECORD VIDEO
  // ==========================================

  const startRecording = () => {
    if (!cameraStream) return;

    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : "video/webm";

    const mediaRecorder = new MediaRecorder(cameraStream, { mimeType });

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
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();

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
    event.target.value = "";
  };

  const handleVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedVideo(file);
    setSelectedImage(null);
    event.target.value = "";
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

      // Upload Image
      if (selectedImage) {
        const fileExtension = selectedImage.name.split(".").pop() || "jpg";
        const filePath = `${profile.id}/${crypto.randomUUID()}.${fileExtension}`;

        const { error: imageUploadError } = await supabase.storage
          .from("post-images")
          .upload(filePath, selectedImage);

        if (imageUploadError) throw imageUploadError;

        const { data: imagePublicData } = supabase.storage
          .from("post-images")
          .getPublicUrl(filePath);

        imageUrl = imagePublicData.publicUrl;
      }

      // Upload Video
      if (selectedVideo) {
        const fileExtension = selectedVideo.name.split(".").pop() || "mp4";
        const filePath = `${profile.id}/${crypto.randomUUID()}.${fileExtension}`;

        const { error: videoUploadError } = await supabase.storage
          .from("post-videos")
          .upload(filePath, selectedVideo);

        if (videoUploadError) throw videoUploadError;

        const { data: videoPublicData } = supabase.storage
          .from("post-videos")
          .getPublicUrl(filePath);

        videoUrl = videoPublicData.publicUrl;
      }

      // Save Post
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
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading...</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-black text-white pb-20">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/feed" className="text-xl font-black tracking-tight">
            Drip or Skip
          </Link>

          <nav className="hidden sm:flex items-center gap-6">
            <Link href="/feed" className="text-sm text-white font-medium">
              Feed
            </Link>
            <Link
              href="/profile"
              className="text-sm text-zinc-400 hover:text-white transition-colors font-medium"
            >
              Profile
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/profile">
              <img
                src={avatar}
                alt=""
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-zinc-800 hover:border-zinc-500 transition-colors"
              />
            </Link>

            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="text-[11px] text-zinc-500">{user.email}</p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50 ml-1"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>
      </header>

      {/* FEED CONTENT */}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <section className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold">
            Welcome back, {displayName.split(" ")[0]}.
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            See what the council is talking about.
          </p>
        </section>

        {/* CREATE POST COMPOSER */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 mb-6">
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
                className="w-full resize-none bg-transparent outline-none text-sm text-white placeholder:text-zinc-600 disabled:opacity-50"
              />

              {/* IMAGE PREVIEW */}
              {selectedImage && (
                <div className="mt-3 relative rounded-xl overflow-hidden border border-zinc-800">
                  <img
                    src={URL.createObjectURL(selectedImage)}
                    alt="Selected"
                    className="w-full max-h-80 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    disabled={posting}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/80 text-white flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* VIDEO PREVIEW */}
              {selectedVideo && (
                <div className="mt-3 relative rounded-xl overflow-hidden border border-zinc-800">
                  <video
                    src={URL.createObjectURL(selectedVideo)}
                    controls
                    className="w-full max-h-80"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedVideo(null)}
                    disabled={posting}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/80 text-white flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* ACTION BAR */}
              <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-zinc-900">
                <div className="flex items-center gap-1 sm:gap-2">
                  <label
                    htmlFor="post-image"
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer transition-all"
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
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer transition-all"
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
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all disabled:opacity-50"
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
                  className="px-4 sm:px-5 py-2 rounded-xl bg-white text-black text-xs font-bold transition-all hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
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
            <div className="py-10 text-center text-zinc-500">
              Loading your feed...
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-8 text-center">
              <h2 className="font-semibold">Your feed is empty</h2>
              <p className="text-sm text-zinc-500 mt-2">
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

      {/* ====================================== */}
      {/* FEATURE-COMPLETE CAMERA MODAL */}
      {/* ====================================== */}

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
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-xs font-mono font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {formatTime(recordingTime)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* SCREEN LIGHTING TOGGLE */}
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

              {/* ASPECT RATIO TOGGLE */}
              <button
                type="button"
                onClick={() => {
                  if (aspectRatio === "full") setAspectRatio("1:1");
                  else if (aspectRatio === "1:1") setAspectRatio("9:16");
                  else setAspectRatio("full");
                }}
                className={`px-2.5 py-1.5 rounded-full text-xs font-mono font-semibold transition-all ${
                  screenLight
                    ? "bg-zinc-200 text-zinc-900"
                    : "bg-zinc-900 text-zinc-300 hover:text-white"
                }`}
              >
                {aspectRatio.toUpperCase()}
              </button>

              {/* CLOSE BUTTON */}
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
                  className={`w-7 h-7 rounded-full text-[11px] font-bold font-mono transition-all ${
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
            {/* FLIP CAMERA */}
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

            {/* SNAPSHOT PHOTO BUTTON */}
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

            {/* VIDEO RECORDING BUTTON */}
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