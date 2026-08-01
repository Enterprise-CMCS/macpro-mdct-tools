import type { LogEvent } from "@/lib/types";

/** Lambda platform / runtime lines that always begin a new statement. */
const STATEMENT_BOUNDARY =
  /^(START|END|REPORT) RequestId:|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function isNewLogStatement(message: string): boolean {
  return STATEMENT_BOUNDARY.test(message.trimStart());
}

/**
 * CloudWatch (and MiniStack) often store each newline of a console.log as its own
 * event with the same timestamp. Reassemble consecutive fragments into one row.
 */
export function coalesceLogEvents(events: LogEvent[]): LogEvent[] {
  if (events.length === 0) return [];

  const out: LogEvent[] = [];
  for (const event of events) {
    const prev = out[out.length - 1];
    const sameStream =
      !prev?.log_stream_name ||
      !event.log_stream_name ||
      prev.log_stream_name === event.log_stream_name;
    const sameTimestamp =
      !!prev && Math.abs(event.timestamp_millis - prev.timestamp_millis) <= 1;

    if (
      prev &&
      sameStream &&
      sameTimestamp &&
      !isNewLogStatement(event.message)
    ) {
      out[out.length - 1] = {
        ...prev,
        message: `${prev.message}\n${event.message}`,
        event_id: prev.event_id || event.event_id,
      };
      continue;
    }

    out.push({ ...event });
  }
  return out;
}
