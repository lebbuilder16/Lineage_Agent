import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on click outside
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="sm:hidden">
      {/* Burger button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-white/70 hover:text-white transition-colors"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop + dropdown */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 animate-fade-in"
          onClick={handleBackdropClick}
        >
          <div
            ref={menuRef}
            className="absolute top-16 right-4 w-56 glass-card rounded-2xl p-4 flex flex-col gap-1 animate-fade-in-scale"
          >
            <a
              href="#about"
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              About
            </a>
            <Link
              to="/dashboard"
              className="px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/compare"
              className="px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Compare
            </Link>
            <a
              href="#faq"
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              FAQ
            </a>

            <hr className="border-[#2B2B2B] my-2" />

            <button
              onClick={() => { setOpen(false); navigate('/search'); }}
              className="px-4 py-2.5 rounded-full bg-[#622EC3] text-white text-sm font-medium hover:bg-[#7438d4] transition-colors text-center purple-glow"
            >
              Analyse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
