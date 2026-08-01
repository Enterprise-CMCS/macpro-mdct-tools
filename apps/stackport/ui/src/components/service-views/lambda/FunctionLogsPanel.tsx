import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGroupLogEvents } from "@/lib/api";
import { coalesceLogEvents } from "@/lib/coalesce-log-events";
import { useEndpoint } from "@/hooks/useEndpoint";
import type { LogEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ScrollText, RefreshCw, Filter } from "lucide-react";

/** MiniStack filter_log_events returns oldest-first with no nextToken unless startTime is set. */
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LogLine({ event }: { event: LogEvent }) {
  return (
    <div className="border-b border-border/40 py-2 font-mono text-xs last:border-0">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>{formatEventTime(event.timestamp)}</span>
        {event.log_stream_name && (
          <span className="truncate" title={event.log_stream_name}>
            {event.log_stream_name}
          </span>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-all text-foreground">
        {event.message}
      </pre>
    </div>
  );
}

function mergeEvents(prev: LogEvent[], incoming: LogEvent[]): LogEvent[] {
  const seen = new Set(
    prev.map((e) => e.event_id || `${e.timestamp_millis}:${e.message}`)
  );
  const merged = [...prev];
  for (const event of incoming) {
    const key = event.event_id || `${event.timestamp_millis}:${event.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }
  merged.sort((a, b) => a.timestamp_millis - b.timestamp_millis);
  // Keep a bounded buffer so live tails don't grow forever
  return merged.length > 500 ? merged.slice(-500) : merged;
}

export function FunctionLogsPanel({
  functionName,
  logGroup,
}: {
  functionName: string;
  logGroup?: string | null;
}) {
  const { activeEndpoint } = useEndpoint();
  const resolvedGroup = logGroup || `/aws/lambda/${functionName}`;
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPattern, setFilterPattern] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [tailMode, setTailMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef<LogEvent[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const displayEvents = useMemo(() => coalesceLogEvents(events), [events]);

  const loadEvents = useCallback(
    async (mode: "replace" | "append" = "replace") => {
      setLoading(true);
      setError(null);
      try {
        const now = Date.now();
        let startTime = now - DEFAULT_LOOKBACK_MS;
        if (mode === "append" && eventsRef.current.length > 0) {
          startTime =
            eventsRef.current[eventsRef.current.length - 1].timestamp_millis +
            1;
        }

        const data = await fetchGroupLogEvents(
          resolvedGroup,
          startTime,
          0,
          appliedFilter,
          200,
          "",
          activeEndpoint
        );
        const next = data.events ?? [];
        setEvents((prev) =>
          mode === "append" ? mergeEvents(prev, next) : next
        );
        if (mode === "append" && next.length > 0) {
          requestAnimationFrame(() => {
            const el = containerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          });
        }
      } catch (e) {
        if (mode === "replace") {
          setEvents([]);
          setError(e instanceof Error ? e.message : "Failed to load logs");
        }
      } finally {
        setLoading(false);
      }
    },
    [resolvedGroup, appliedFilter, activeEndpoint]
  );

  useEffect(() => {
    void loadEvents("replace");
  }, [loadEvents]);

  useEffect(() => {
    if (!tailMode) return;
    const id = window.setInterval(() => {
      void loadEvents(eventsRef.current.length > 0 ? "append" : "replace");
    }, 3000);
    return () => window.clearInterval(id);
  }, [tailMode, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <code
          className="rounded bg-muted px-2 py-1 font-mono text-xs"
          title={resolvedGroup}
        >
          {resolvedGroup}
        </code>
        <span className="text-xs text-muted-foreground">Last 24h</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>Live</span>
          <Switch checked={tailMode} onCheckedChange={setTailMode} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void loadEvents("replace")}
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Filter pattern (CloudWatch syntax)"
            value={filterPattern}
            onChange={(e) => setFilterPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setAppliedFilter(filterPattern);
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8"
          onClick={() => setAppliedFilter(filterPattern)}
        >
          Apply
        </Button>
      </div>

      <div
        ref={containerRef}
        className="max-h-[28rem] overflow-y-auto rounded-md border border-border/60 p-3"
      >
        {loading && events.length === 0 && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!loading && error && (
          <EmptyState
            icon={ScrollText}
            title="Could not load logs"
            description={error}
          />
        )}
        {!loading && !error && displayEvents.length === 0 && (
          <EmptyState
            icon={ScrollText}
            title="No log events"
            description="No events in the last 24h. Invoke the function or wait — Live refreshes every 3s."
          />
        )}
        {displayEvents.map((event) => (
          <LogLine
            key={
              event.event_id ||
              `${event.timestamp_millis}-${event.message.slice(0, 24)}`
            }
            event={event}
          />
        ))}
      </div>
    </div>
  );
}
