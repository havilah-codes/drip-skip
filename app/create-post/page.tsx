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
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import { linkHashtagsToPost } from "@/lib/hashtags";
import { extractVideoFrame } from "@/lib/videoThumbnail";
import { compressImage } from "@/lib/imageCompression";
import { compressVideo } from "@/lib/videoCompression";
import { savePostTags } from "@/lib/tags";
import { sendNotification } from "@/lib/notifications";
import MentionAutocomplete from "@/components/MentionAutocomplete";

import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

const MAX_CAPTION_LENGTH = 500;

export default function CreatePostPage() {
  const router = useRouter();

  // ==========================================
  // AUTH
  // ==========================================

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        if (!currentUser) {
          router.replace("/login");
          return;
        }

        try {
          const profile = await syncProfile(currentUser);
          setUser(currentUser);
          setProfileId(profile?.id || null);
        } catch (error) {
          console.error("PROFILE SYNC FAILED:", error);
        } finally {
          setAuthLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  // ==========================================
  // POST STATE
  // ==========================================

  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  // Autocomplete state
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [autocompleteType, setAutocompleteType] = useState<"mention" | "hashtag" | null>(null);
  const [autocompleteStartPos, setAutocompleteStartPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // CAMERA
  // ==========================================

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================
  // CLEANUP
  // ==========================================

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
  // CAMERA
  // ==========================================

  const startCamera = async (mode: "environment" | "user") => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Your browser does not support camera access.");
        return;
      }

      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      console.error("CAMERA ERROR:", error);
      alert("Could not access camera. Please enable permissions and try again.");
    }
  };

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
  };

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      alert("Camera is not ready yet. Please try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        setSelectedImage(file);
        setSelectedVideo(null);
        stopCamera();
        setCameraOpen(false);
      },
      "image/jpeg",
      0.95
    );
  };

  const startRecording = () => {
    if (!cameraStream) return;
    recordedChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const recorder = new MediaRecorder(cameraStream, {
      mimeType,
      videoBitsPerSecond: 5000000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const file = new File([blob], `video-${Date.now()}.webm`, { type: mimeType });
      setSelectedVideo(file);
      setSelectedImage(null);
      stopCamera();
      setCameraOpen(false);

      extractVideoFrame(file, 0.5).then((frame) => {
        if (frame) setVideoThumbnail(frame);
      });
    };

    mediaRecorderRef.current = recorder;
    recorder.start(1000);
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

  const flipCamera = () => {
    if (isRecording) return;
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    stopCamera();
    startCamera(nextMode);
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // ==========================================
  // AUTOCOMPLETE
  // ==========================================

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, MAX_CAPTION_LENGTH);
    setText(newValue);

    // Detect if user is typing a mention or hashtag
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Find the last @ or # that wasn't followed by a space before the cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const lastHashIndex = textBeforeCursor.lastIndexOf("#");

    let triggerIndex = -1;
    let triggerType: "mention" | "hashtag" | null = null;

    if (lastAtIndex > lastHashIndex) {
      triggerIndex = lastAtIndex;
      triggerType = "mention";
    } else if (lastHashIndex > lastAtIndex) {
      triggerIndex = lastHashIndex;
      triggerType = "hashtag";
    }

    if (triggerIndex >= 0 && triggerType) {
      const textAfterTrigger = textBeforeCursor.slice(triggerIndex + 1);

      // Check if there's a space after the trigger (means user finished the tag)
      if (!textAfterTrigger.includes(" ") && textAfterTrigger.length <= 30) {
        setAutocompleteQuery(textAfterTrigger);
        setAutocompleteType(triggerType);
        setAutocompleteStartPos(triggerIndex);
        setAutocompleteOpen(true);
        return;
      }
    }

    // No trigger found, close autocomplete
    setAutocompleteOpen(false);
  };

  const handleAutocompleteSelect = (suggestion: { id: string; name: string; type: "mention" | "hashtag" }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    // Find the trigger position
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const lastHashIndex = textBeforeCursor.lastIndexOf("#");
    const triggerIndex = Math.max(lastAtIndex, lastHashIndex);

    if (triggerIndex < 0) return;

    // Replace from trigger to cursor with the selected suggestion
    const prefix = text.slice(0, triggerIndex);
    const suffix = textAfterCursor;
    const newValue = `${prefix}@${suggestion.name} ${suffix}`;

    setText(newValue);
    setAutocompleteOpen(false);

    // Focus and set cursor position
    setTimeout(() => {
      const newPos = triggerIndex + suggestion.name.length + 2;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Let autocomplete handle keyboard events when open
    if (autocompleteOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
        // These are handled by MentionAutocomplete
        return;
      }
    }
  };

  // ==========================================
  // FILE HANDLERS
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

    extractVideoFrame(file, 0.5).then((frame) => {
      if (frame) setVideoThumbnail(frame);
    });
  };

  // ==========================================
  // SUBMIT POST
  // ==========================================

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!text.trim() && !selectedImage && !selectedVideo) return;
    if (!user || !profileId) return;

    setPosting(true);
    setError("");

    try {
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      if (selectedImage) {
        let imageToUpload: Blob = selectedImage;
        if (selectedImage.type !== "image/gif") {
          try {
            imageToUpload = await compressImage(selectedImage, 1600, 0.85);
          } catch {
            imageToUpload = selectedImage;
          }
        }

        const ext = imageToUpload.type === "image/webp" ? "webp" : imageToUpload.type === "image/png" ? "png" : "jpg";
        const filePath = `${profileId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("post-images")
          .upload(filePath, imageToUpload, { contentType: imageToUpload.type || "image/jpeg" });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(filePath);
        imageUrl = urlData?.publicUrl || null;
      }

      if (selectedVideo) {
        let videoToUpload: Blob = selectedVideo;
        try {
          videoToUpload = await compressVideo(selectedVideo, 720, 8, 30);
        } catch {
          videoToUpload = selectedVideo;
        }

        const ext = videoToUpload.type === "video/webm" ? "webm" : "mp4";
        const filePath = `${profileId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("post-videos")
          .upload(filePath, videoToUpload, { contentType: videoToUpload.type || "video/mp4" });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from("post-videos").getPublicUrl(filePath);
        videoUrl = urlData?.publicUrl || null;
      }

      const { data: newPost, error: postError } = await supabase
        .from("posts")
        .insert({
          user_id: profileId,
          text: text.trim() || null,
          image_url: imageUrl,
          video_url: videoUrl,
        })
        .select("id")
        .single();

      if (postError) throw postError;

      if (newPost && text.trim()) {
        linkHashtagsToPost(newPost.id, text.trim()).catch((err) =>
          console.error("HASHTAG LINKING FAILED:", err)
        );

        // Save tags and notify tagged users
        savePostTags(newPost.id, text.trim(), profileId).then((taggedIds) => {
          taggedIds.forEach((taggedId) => {
            sendNotification({
              recipientId: taggedId,
              type: "tag",
              postId: newPost.id,
            });
          });
        }).catch((err) =>
          console.error("TAG SAVE FAILED:", err)
        );
      }

      router.push("/feed");
    } catch (err: unknown) {
      console.error("POST CREATION FAILED:", err);
      setError("Could not create your post. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (authLoading) {
    return (
      <main className="min-h-screen bg-bg text-text-p flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-text-t border-t-text-p rounded-full animate-spin" />
      </main>
    );
  }

  if (!user) return null;

  const hasMedia = !!selectedImage || !!selectedVideo;
  const canPost = text.trim() || hasMedia;

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <main className="min-h-screen bg-bg text-text-p pb-20">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/feed"
            className="text-sm font-medium text-text-s hover:text-text-p transition-colors"
          >
            Cancel
          </Link>
          <h1 className="text-base font-semibold font-display">New Post</h1>
          <button
            type="submit"
            form="create-post-form"
            disabled={posting || !canPost}
            className="text-sm font-bold text-btn disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </header>

      {/* FORM */}
      <form id="create-post-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pt-4">
        {/* TEXT INPUT */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            rows={4}
            disabled={posting}
            autoFocus
            className="w-full resize-none bg-transparent outline-none text-base text-text-p placeholder:text-text-m disabled:opacity-50"
          />
          <MentionAutocomplete
            query={autocompleteQuery}
            type={autocompleteType}
            isOpen={autocompleteOpen}
            onSelect={handleAutocompleteSelect}
            onClose={() => setAutocompleteOpen(false)}
            textareaRef={textareaRef}
          />
        </div>

        <div className="text-right text-xs text-text-m mb-4">
          {text.length}/{MAX_CAPTION_LENGTH}
        </div>

        {/* IMAGE PREVIEW */}
        {selectedImage && (
          <div className="relative rounded-2xl overflow-hidden border border-border-d mb-4">
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Selected"
              className="w-full max-h-96 object-cover"
            />
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              disabled={posting}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-bg/80 text-text-p flex items-center justify-center text-lg backdrop-blur-sm"
            >
              &times;
            </button>
          </div>
        )}

        {/* VIDEO PREVIEW */}
        {selectedVideo && (
          <div className="relative rounded-2xl overflow-hidden border border-border-d mb-4">
            {videoThumbnail ? (
              <img
                src={videoThumbnail}
                alt="Video thumbnail"
                className="w-full max-h-96 object-cover"
              />
            ) : (
              <div className="w-full max-h-96 bg-bg-sunken flex items-center justify-center py-16">
                <span className="text-sm text-text-t animate-pulse">Loading preview...</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => { setSelectedVideo(null); setVideoThumbnail(null); }}
              disabled={posting}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-bg/80 text-text-p flex items-center justify-center text-lg backdrop-blur-sm"
            >
              &times;
            </button>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500 mb-4">
            {error}
          </div>
        )}
      </form>

      {/* ACTION BAR (fixed at bottom, above nav) */}
      <div className="fixed bottom-20 left-0 right-0 z-40">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center gap-1 bg-bg-raised/90 backdrop-blur-xl border border-border-d rounded-2xl p-2 shadow-lg">
            <label
              htmlFor="create-image"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-text-s hover:text-text-p hover:bg-bg-sunken cursor-pointer transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <span>Photo</span>
            </label>
            <input
              id="create-image"
              type="file"
              accept="image/*"
              disabled={posting}
              className="hidden"
              onChange={handleImageSelect}
            />

            <label
              htmlFor="create-video"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-text-s hover:text-text-p hover:bg-bg-sunken cursor-pointer transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="13" height="14" rx="2" />
                <path d="m16 10 5-3v10l-5-3z" />
              </svg>
              <span>Video</span>
            </label>
            <input
              id="create-video"
              type="file"
              accept="video/*"
              disabled={posting}
              className="hidden"
              onChange={handleVideoSelect}
            />

            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              disabled={posting}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-text-s hover:text-text-p hover:bg-bg-sunken transition-all disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7.5 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2.5z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <span>Camera</span>
            </button>

            <div className="flex-1" />

            {isRecording && (
              <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-500">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {formatTime(recordingTime)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CAMERA MODAL */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
          {/* CAMERA HEADER */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-black">
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
                onClick={flipCamera}
                disabled={isRecording}
                className="w-8 h-8 rounded-full bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center disabled:opacity-40 transition-all"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                  <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                  <polyline points="16 2 20 5 16 8" />
                  <polyline points="8 22 4 19 8 16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="w-8 h-8 rounded-full bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center transition-all"
              >
                &times;
              </button>
            </div>
          </div>

          {/* CAMERA PREVIEW */}
          <div className="flex-1 flex items-center justify-center p-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: facingMode === "user" ? "scaleX(-1)" : "" }}
              className="w-full h-full max-w-lg object-cover rounded-2xl"
            />
          </div>

          {/* CAMERA CONTROLS */}
          <div className="p-6 flex items-center justify-around border-t border-zinc-900 bg-black">
            <button
              type="button"
              onClick={flipCamera}
              disabled={isRecording}
              className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 text-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
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
              className="w-16 h-16 rounded-full bg-white border-4 border-zinc-400 shadow-lg active:scale-95 transition-transform disabled:opacity-40"
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
    </main>
  );
}
