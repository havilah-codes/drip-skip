"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, FileText, Trophy, X } from "lucide-react";
import CreateCompetitionModal from "./CreateCompetitionModal";

export default function CreatePostFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCompetitionModal, setShowCompetitionModal] = useState(false);

  return (
    <>
      {/* BACKDROP */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* FAB MENU ITEMS */}
      <div className="fixed bottom-24 right-5 z-[60] sm:bottom-8 sm:right-8 flex flex-col items-end gap-3">
        {/* COMPETITION OPTION */}
        <div
          className={`flex items-center gap-2 transition-all duration-300 ease-out ${
            isOpen
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-4 scale-90 pointer-events-none"
          }`}
          style={{ transitionDelay: isOpen ? "50ms" : "0ms" }}
        >
          <span className="text-xs font-semibold bg-bg-raised/95 backdrop-blur-sm text-text-p px-3 py-1.5 rounded-lg shadow-lg border border-border-s whitespace-nowrap">
            Create Competition
          </span>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setShowCompetitionModal(true);
            }}
            className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-90 hover:scale-105"
          >
            <Trophy size={20} />
          </button>
        </div>

        {/* CREATE POST OPTION */}
        <div
          className={`flex items-center gap-2 transition-all duration-300 ease-out ${
            isOpen
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-4 scale-90 pointer-events-none"
          }`}
          style={{ transitionDelay: isOpen ? "0ms" : "50ms" }}
        >
          <span className="text-xs font-semibold bg-bg-raised/95 backdrop-blur-sm text-text-p px-3 py-1.5 rounded-lg shadow-lg border border-border-s whitespace-nowrap">
            Create Post
          </span>
          <Link
            href="/create-post"
            onClick={() => setIsOpen(false)}
            className="w-12 h-12 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-90 hover:scale-105"
          >
            <FileText size={20} />
          </Link>
        </div>

        {/* MAIN FAB BUTTON */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-black/30
            transition-all duration-300 ease-out
            ${isOpen ? "bg-red-500 rotate-45" : "bg-btn hover:scale-110 active:scale-95"}
          `}
        >
          {isOpen ? (
            <X size={26} strokeWidth={2.5} className="text-white -rotate-45" />
          ) : (
            <Plus size={26} strokeWidth={2.5} className="text-btn-text" />
          )}
        </button>
      </div>

      {/* CREATE COMPETITION MODAL */}
      <CreateCompetitionModal
        isOpen={showCompetitionModal}
        onClose={() => setShowCompetitionModal(false)}
      />
    </>
  );
}
