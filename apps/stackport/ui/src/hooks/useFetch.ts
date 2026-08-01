import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function useFetch<T>(fetcher: () => Promise<T>, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      setError(msg);
      toast.error("Failed to fetch data", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setError(null);
    refresh();
    const delayMs = Number(intervalMs);
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return;
    }
    // deepcode ignore CodeInjection: delay is numeric; callback is a function, not a string
    const id = setInterval(refresh, delayMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, loading, error, refresh };
}
