import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Current app version — bump this string on each meaningful release
const APP_VERSION = "2026.05.06-a";

const POLL_INTERVAL = 60_000; // check every 60s

export function VersionChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const dismissed = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function check() {
      if (dismissed.current) return;
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "app_version")
          .single();
        if (data && data.value && data.value !== APP_VERSION) {
          setUpdateAvailable(true);
        }
      } catch {
        // silently ignore
      }
    }

    // First check after 5s so it doesn't block initial render
    const initial = setTimeout(check, 5000);
    timer = setInterval(check, POLL_INTERVAL);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-background/95 backdrop-blur-md px-5 py-3 shadow-lg">
        <span className="text-sm font-medium text-foreground">
          🔄 تم تحديث التطبيق — يرجى إعادة التحميل
        </span>
        <button
          onClick={() => {
            // Clear caches and hard reload
            if ("caches" in window) {
              caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
            }
            window.location.reload();
          }}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          تحديث الآن
        </button>
        <button
          onClick={() => {
            dismissed.current = true;
            setUpdateAvailable(false);
          }}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
          aria-label="إغلاق"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Export the current version so the admin panel can display/set it */
export const CURRENT_APP_VERSION = APP_VERSION;