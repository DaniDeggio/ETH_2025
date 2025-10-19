"use client";
import { useState } from "react";
import { NexusChat } from "../app/_components/NexusChat";

export function NexusChatWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Floating chat dot/button */}
      <button
        aria-label="Apri chat Nexus"
        className="fixed z-50 bottom-12 right-6 w-12 h-12 rounded-full bg-primary shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        style={{ boxShadow: "0 2px 16px 0 rgba(0,0,0,0.18)" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-white text-2xl">💬</span>
      </button>
      {/* Chat modal/panel */}
      {open && (
        <div className="fixed z-50 bottom-24 right-6 max-w-full w-[360px] sm:w-[400px] bg-base-100 border border-base-300 rounded-xl shadow-xl animate-fade-in">
          <div className="flex justify-end p-2">
            <button
              aria-label="Chiudi chat Nexus"
              className="btn btn-xs btn-circle btn-ghost"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          <NexusChat />
        </div>
      )}
    </>
  );
}
