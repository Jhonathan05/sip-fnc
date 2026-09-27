'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const INACTIVITY_MS = 5 * 60 * 1000; // espejo del middleware
const WARNING_BEFORE = 60 * 1000; // modal 60s antes
const PING_EVERY = 60 * 1000; // ping deslizante de actividad
const EVENTS = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'] as const;

// Adaptado de skill fnc-auth: modal de aviso + ping a /api/auth/activity.
export function useInactivityTimer() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const deadlineRef = useRef<number>(Date.now() + INACTIVITY_MS);
  const lastPingRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    deadlineRef.current = Date.now() + INACTIVITY_MS;
    setShowWarning(false);
    setSecondsLeft(60);
    if (Date.now() - lastPingRef.current > PING_EVERY) {
      lastPingRef.current = Date.now();
      fetch('/api/auth/activity', { method: 'POST' }).catch(() => undefined);
    }
  }, []);

  const doLogout = useCallback(
    async (reason = 'inactivity') => {
      let endSessionUrl: string | undefined;
      try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        const data = (await res.json().catch(() => null)) as { endSessionUrl?: string } | null;
        endSessionUrl = data?.endSessionUrl;
      } catch {
        // sigue a login aunque falle el POST
      }
      if (endSessionUrl) window.location.href = endSessionUrl;
      else router.push(`/login?reason=${reason}`);
    },
    [router],
  );

  useEffect(() => {
    EVENTS.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    intervalRef.current = setInterval(() => {
      const remaining = deadlineRef.current - Date.now();
      if (remaining <= WARNING_BEFORE && remaining > 0) {
        setShowWarning(true);
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else if (remaining <= 0) {
        void doLogout('inactivity');
      }
    }, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, resetTimer));
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resetTimer, doLogout]);

  return { showWarning, secondsLeft, stayActive: resetTimer, logout: doLogout };
}
