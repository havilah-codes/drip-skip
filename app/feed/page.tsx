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
  // CAMERA
  // ==========================================

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ==========================================
  // AUTH LISTENER
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        console.log("🔥 AUTH STATE:", currentUser);

        if (!currentUser) {
          router.replace("/login");
          return;
        }

        try {
          console.log("🔥 CALLING SYNC PROFILE...");
          await syncProfile(currentUser);
          console.log("✅ PROFILE SYNC FINISHED");

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
        console.log("🧠 LOADING SMART FEED");

        const profile = await syncProfile(user);

        if (!profile?.id) {
          throw new Error("Could not find Supabase profile.");
        }

        console.log("👤 SMART FEED PROFILE:", profile.id);

        const smartPosts = await getSmartFeed({
          profileId: profile.id,
          limit: 50,
        });

        if (cancelled) return;

        console.log("🧠 SMART FEED POSTS:", smartPosts);
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
  // CONNECT CAMERA STREAM TO VIDEO
  // ==========================================

  useEffect(() => {
    if (!videoRef.current || !cameraStream) {
      return;
    }

    videoRef.current.srcObject = cameraStream;
    videoRef.current.play().catch(() => {});
  }, [cameraStream]);

  // ==========================================
  // CAMERA CLEANUP
  // ==========================================

  const stopCamera = () => {
    if (!cameraStream) {
      return;
    }

    cameraStream.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
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

      // Stop existing tracks before requesting new hardware access
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: mode } },
          audio: false,
        });
      } catch {
        // Fallback to ideal if exact fails on mobile browsers
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
      }

      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      console.error("CAMERA ERROR:", error);
      alert("Could not access your camera. Please allow camera permissions and try again.");
    }
  };

  const openCamera = () => {
    startCamera(facingMode);
  };

  const flipCamera = () => {
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

    if (!video) {
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert("Camera is not ready yet. Please try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    // Mirror image on canvas if taking photo with front-facing camera
    if (facingMode === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }

        const file = new File([blob], `drip-camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        setSelectedImage(file);
        closeCamera();
      },
      "image/jpeg",
      0.9
    );
  };

  // ==========================================
  // IMAGE & VIDEO SELECT
  // ==========================================

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedImage(file);
    event.target.value = "";
  };

  const handleVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedVideo(file);
    event.target.value = "";
  };

  // ==========================================
  // CREATE POST
  // ==========================================

  const handlePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!post.trim() && !selectedImage && !selectedVideo) {
      return;
    }

    if (!user) {
      return;
    }

    setPosting(true);

    try {
      console.log("🚀 CREATING POST");

      const profile = await syncProfile(user);
      console.log("👤 SUPABASE PROFILE:", profile);

      if (!profile?.id) {
        throw new Error("Could not find Supabase profile.");
      }

      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      // Upload Image
      if (selectedImage) {
        const fileExtension = selectedImage.name.split(".").pop() || "jpg";
        const filePath = `${profile.id}/${crypto.randomUUID()}.${fileExtension}`;

        console.log("📸 UPLOADING IMAGE:", filePath);

        const { error: imageUploadError } = await supabase.storage
          .from("post-images")
          .upload(filePath, selectedImage);

        if (imageUploadError) throw imageUploadError;

        const { data: imagePublicData } = supabase.storage
          .from("post-images")
          .getPublicUrl(filePath);

        imageUrl = imagePublicData.publicUrl;
        console.log("✅ IMAGE URL:", imageUrl);
      }

      // Upload Video
      if (selectedVideo) {
        const fileExtension = selectedVideo.name.split(".").pop() || "mp4";
        const filePath = `${profile.id}/${crypto.randomUUID()}.${fileExtension}`;

        console.log("🎥 UPLOADING VIDEO:", filePath);

        const { error: videoUploadError } = await supabase.storage
          .from("post-videos")
          .upload(filePath, selectedVideo);

        if (videoUploadError) throw videoUploadError;

        const { data: videoPublicData } = supabase.storage
          .from("post-videos")
          .getPublicUrl(filePath);

        videoUrl = videoPublicData.publicUrl;
        console.log("✅ VIDEO URL:", videoUrl);
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

      if (postError) {
        console.error("❌ POST DATABASE ERROR:", postError);
        throw postError;
      }

      console.log("📝 NEW POST:", newPost);

      if (newPost) {
        setPosts((currentPosts) => [newPost, ...currentPosts]);
      }

      // Clear composer
      setPost("");
      setSelectedImage(null);
      setSelectedVideo(null);

      console.log("✅ POST CREATED SUCCESSFULLY");
    } catch (error) {
      console.error("❌ POST CREATION FAILED:", error);
      alert("Could not create your post. Check the console for details.");
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

  // ==========================================
  // AUTH LOADING & NO USER STATES
  // ==========================================

  if (authLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  // ==========================================
  // FEED UI
  // ==========================================

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
                  
                  {/* PHOTO ATTACHMENT */}
                  <label
                    htmlFor="post-image"
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer transition-all"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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

                  {/* VIDEO ATTACHMENT */}
                  <label
                    htmlFor="post-video"
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer transition-all"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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

                  {/* LIVE CAMERA */}
                  <button
                    type="button"
                    onClick={openCamera}
                    disabled={posting}
                    className="flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all disabled:opacity-50"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14.5 4h-5L7.5 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2.5z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    <span className="hidden sm:inline">Camera</span>
                  </button>
                </div>

                {/* SUBMIT BUTTON */}
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
      {/* CAMERA MODAL */}
      {/* ====================================== */}

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          {/* CAMERA HEADER */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-900">
            <h2 className="font-semibold text-sm">Camera</h2>
            <button
              type="button"
              onClick={closeCamera}
              className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center text-xl text-zinc-400 hover:text-white"
            >
              ×
            </button>
          </div>

          {/* CAMERA VIEW */}
          <div className="flex-1 flex items-center justify-center bg-black p-4 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full max-w-2xl max-h-full rounded-2xl object-cover ${
                facingMode === "user" ? "scale-x-[-1]" : ""
              }`}
            />
          </div>

          {/* CAMERA CONTROLS */}
          <div className="p-6 flex items-center justify-around border-t border-zinc-900 bg-black">
            {/* Spacer for symmetry */}
            <div className="w-12 h-12" />

            {/* SHUTTER */}
            <button
              type="button"
              onClick={takePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-zinc-400 shadow-lg active:scale-95 transition-transform"
              aria-label="Take photo"
            />

            {/* FAMILIAR FLIP CAMERA BUTTON */}
            <button
              type="button"
              onClick={flipCamera}
              className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white active:scale-90 transition-all"
              aria-label="Flip camera"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Standard native camera-swap icon */}
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                <polyline points="16 2 20 5 16 8" />
                <polyline points="8 22 4 19 8 16" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}