/* Inactivity handling for terminal kiosk screens (emergency, done) that
   otherwise have no way back to the landing page. 30 seconds is tuned for
   demonstration so the reset can be shown quickly; a real OPD deployment
   would want a longer timeout on the emergency screen in particular, so a
   distressed patient showing it to staff is never rushed off it. */

import { useCallback, useEffect, useRef, useState } from "react";

export const EMERGENCY_SCREEN_TIMEOUT_MS = 30_000;
export const DONE_SCREEN_TIMEOUT_MS = 30_000;
export const INACTIVITY_COUNTDOWN_MS = 10_000;

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart"] as const;
const ACTIVITY_THROTTLE_MS = 250;

/**
 * Fires onTimeout once after timeoutMs of no tap, key press or pointer
 * movement anywhere on the window. Returns the whole seconds remaining once
 * the countdown window starts (last INACTIVITY_COUNTDOWN_MS), or null
 * before that, so a screen can show a countdown only near the end.
 */
export function useInactivityTimeout(timeoutMs: number, onTimeout: () => void): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(0);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  // Arms the timeout and countdown interval. Only ever touches state from
  // its (async) timer callbacks, never synchronously, so it is safe to call
  // straight from the setup effect below as well as from an event handler.
  const arm = useCallback(() => {
    clearTimers();
    const countdownMs = Math.min(INACTIVITY_COUNTDOWN_MS, timeoutMs);
    timeoutRef.current = setTimeout(() => {
      setSecondsLeft(Math.ceil(countdownMs / 1000));
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev === null || prev <= 1) {
            clearTimers();
            onTimeoutRef.current();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }, timeoutMs - countdownMs);
  }, [timeoutMs, clearTimers]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityRef.current = now;
    setSecondsLeft(null);
    arm();
  }, [arm]);

  useEffect(() => {
    arm();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));
    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      clearTimers();
    };
  }, [arm, handleActivity, clearTimers]);

  return secondsLeft;
}
