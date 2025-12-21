import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface MobileMenuProps {
  youtubeUrl: string;
}

export default function MobileMenu({ youtubeUrl }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Wait for mount before using portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const openSubscribeModal = () => {
    setIsOpen(false);
    (
      document.getElementById("subscribe-modal-global") as HTMLDialogElement
    )?.showModal();
  };

  const menuOverlay = (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 top-16 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Navigation */}
      <div
        className={`md:hidden fixed left-0 right-0 top-16 bg-void border-b border-etc-green/10 z-50 transition-all duration-200 ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-1">
            <a
              href="/#archive"
              className="nav-link-mobile"
              onClick={() => setIsOpen(false)}
            >
              Archive
            </a>
            <button
              type="button"
              className="nav-link-mobile w-full text-left cursor-pointer"
              onClick={openSubscribeModal}
            >
              Subscribe
            </button>
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link-mobile"
              onClick={() => setIsOpen(false)}
            >
              YouTube
            </a>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        className="md:hidden p-2 text-gray-400 hover:text-etc-green transition-colors"
        aria-label="Toggle menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {/* Portal the overlay to body so it's not constrained by header */}
      {mounted && createPortal(menuOverlay, document.body)}
    </>
  );
}
