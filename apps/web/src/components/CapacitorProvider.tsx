'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * CapacitorProvider — Global handler for native mobile app behaviors.
 *
 * 1. Android hardware back button → navigate back or exit app
 * 2. "Press back again to exit" pattern on dashboard/home pages
 *
 * This component renders nothing — it only registers event listeners.
 * It safely no-ops on web (non-Capacitor) environments.
 */

// Dashboard / home routes where pressing back should exit the app
const ROOT_PATHS = [
  '/principal/dashboard',
  '/teacher/dashboard',
  '/parent/dashboard',
  '/admin/dashboard',
  '/login',
];

export default function CapacitorProvider() {
  const pathname = usePathname();
  const lastBackPress = useRef<number>(0);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showingExitToast = useRef(false);

  // Check if user is on a root/dashboard page
  const isOnRootPage = useCallback(() => {
    return ROOT_PATHS.some(root => pathname === root || pathname === root + '/');
  }, [pathname]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    async function init() {
      // Only run on native platforms (Capacitor Android/iOS)
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import('@capacitor/app');

        const listener = await App.addListener('backButton', ({ canGoBack }) => {
          // If we're on a root page (dashboard), implement "press back again to exit"
          if (isOnRootPage()) {
            const now = Date.now();
            if (now - lastBackPress.current < 2000) {
              // Second press within 2 seconds — exit the app
              App.exitApp();
              return;
            }
            lastBackPress.current = now;

            // Show a toast-like notification
            showExitToast();
            return;
          }

          // Otherwise, navigate back in browser history
          if (canGoBack) {
            window.history.back();
          } else {
            // Fallback: if no history but not on root, try going to dashboard
            // This handles edge cases where the user opened a deep link directly
            window.history.back();
          }
        });

        cleanup = () => {
          listener.remove();
        };
      } catch (e) {
        // @capacitor/core or @capacitor/app not available (web environment)
        // This is expected and fine — no-op
        console.debug('[CapacitorProvider] Not running in Capacitor environment');
      }
    }

    init();

    return () => {
      if (cleanup) cleanup();
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, [isOnRootPage]);

  return null;
}

/**
 * Show a native-style "Press back again to exit" toast.
 * Uses a simple DOM-based toast since we can't use Android Toast from JS directly.
 */
function showExitToast() {
  // Don't show multiple toasts
  const existing = document.getElementById('capacitor-exit-toast');
  if (existing) return;

  const toast = document.createElement('div');
  toast.id = 'capacitor-exit-toast';
  toast.textContent = 'Press back again to exit';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: 'rgba(0, 0, 0, 0.85)',
    color: 'white',
    padding: '10px 24px',
    borderRadius: '24px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'Inter, system-ui, sans-serif',
    zIndex: '99999',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    letterSpacing: '0.01em',
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Remove after 2 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 1800);
}
