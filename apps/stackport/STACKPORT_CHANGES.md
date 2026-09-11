# MDCT StackPort changes (vs upstream)

This tree is a local soft-fork of [DaviReisVieira/stackport](https://github.com/DaviReisVieira/stackport) for MDCT MiniStack DX. Nested `.git` was removed, so every file looks new in `macpro-mdct-tools`. Use this document to see where we diverge and why.

**Do not** open upstream PRs or push these patches to the StackPort project.

## Baseline

- Upstream tag: **v0.3.8** (`eb305c6eadb55011115e12f97613e2496b8f0f4b`)

---

## New files (to improve the DX for our MDCT specific use case)

### `ui/src/lib/resource-names.ts`

MiniStack names look like `app-api-ministack-determineCurrentUser` and `/aws/lambda/app-api-ministack-...`. Lists were unreadable and search only matched the full string.

| Function | What it does |
| --- | --- |
| `shortenResourceName` | Strips known prefixes (`/aws/lambda/`, `app-api-ministack-`, `ministack-`). |
| `middleEllipsis` | Truncates long leftovers with a middle ellipsis. |
| `matchesResourceFilter` | Token search against full and shortened names (case-insensitive). |
| `displayResourceName` | Shorten then ellipsis for list/detail titles (full name stays on `title=`). |

Used by Lambda, DynamoDB, and Logs list UIs.

### `ui/src/lib/coalesce-log-events.ts`

CloudWatch (and MiniStack) often store each newline of one `console.log` as its own event with the same timestamp, so a JSON dump became dozens of rows.

| Function | What it does |
| --- | --- |
| `isNewLogStatement` | Treats `START`/`END`/`REPORT RequestId:` and ISO-timestamped Lambda lines as a new statement. |
| `coalesceLogEvents` | Joins consecutive events on the same stream within 1ms unless they look like a new statement. |

Used by the Lambda Logs tab and the Logs browser event list.

### `ui/src/components/service-views/lambda/FunctionLogsPanel.tsx`

Upstream Lambda detail had **no Logs tab**. LocalStack-style DX needs logs on the function page.

| Function | What it does |
| --- | --- |
| `FunctionLogsPanel` | Loads `/aws/lambda/{FunctionName}` (or `LoggingConfig.LogGroup` if set) via `fetchGroupLogEvents`. Defaults to last 24 hours. Live mode polls every 3s and appends after the last timestamp. |
| `mergeEvents` | Dedupes live-tail pages. |
| `LogLine` | Renders one coalesced statement. |

**Why last 24h:** MiniStack `filter_log_events` with no `startTime` returns the oldest events first (often the first deploy) and often omits a useful `nextToken`, so live refresh looked frozen on day-one logs.

---

## Backend (to fix ministack compat issues)

### `backend/routes/logs.py`

| Function / route | Change | Why |
| --- | --- | --- |
| `GET /filter-events` → `filter_group_log_events` | Group-wide `filter_log_events` with `log_group_name` as a query param. Sorts events by timestamp. | An earlier `GET /groups/{name:path}/events` stole `/groups/.../streams/.../events` because FastAPI `{name:path}` is greedy. Stream names like `2026/08/12/[$LATEST]...` were swallowed into `name`, MiniStack looked up a bogus group, and the UI showed **streams with empty bodies**. |
| `get_log_events` (`/groups/{name}/streams/{stream}/events`) | Unchanged contract; must stay registered without a competing `{name:path}/events` route. | Stream tail uses `get_log_events` (`startFromHead=False`) when there is no filter pattern. |

### `backend/routes/dynamodb.py`

| Function | Change | Why |
| --- | --- | --- |
| `_build_filter_expression` | Builds DynamoDB `FilterExpression` for `=`, `begins_with`, `contains`. | Typing `contains` / `begins_with` into key value boxes was treated as a literal key. `contains` is not valid on a Query KeyCondition; it must be FilterExpression. Partition key Query is exact `=` only. |
| `scan_table` | Optional query params `filter_attribute`, `filter_operator`, `filter_value`, `filter_value_type`. When a filter is set, loops `scan` until a page of matches (or end of table), summing `ScannedCount`. Caps at 50 internal pages or 10k items scanned. Unfiltered Scan stays one call with `Limit`. | Scan had no filter UI/API. DynamoDB `Limit` is items read, not matches after `FilterExpression`, so a single page often returned `0 items (scanned 100)` while matching keys sat later in the table. |
| `query_table` | Same filter fields on `QueryRequest`, merged into expression names/values without colliding with `:pk` / `:sk`. Filtered Query loops the same way as filtered Scan; unfiltered Query stays one call. | Filter after KeyCondition. `Limit` has the same meaning on Query. |

### `backend/schemas/dynamodb.py`

`QueryRequest` gained `filter_attribute`, `filter_operator` (`=` / `begins_with` / `contains`), `filter_value`, `filter_value_type` (`S` / `N`).

### Other backend hunks in the full diff

`backend/main.py` / `lambda_svc.py` may show extra hunks vs v0.3.8 because the repo was forked in between their 3.7 and 3.8 release (SPA fallback, code download streaming). Treat those as tree drift unless you are debugging those features; they are not the MiniStack logs/filter work.

---

## Frontend wiring

### `ui/src/lib/api.ts`

| Function | Change | Why |
| --- | --- | --- |
| `fetchGroupLogEvents` | `GET /logs/filter-events?log_group_name=...` | Avoid the greedy path route; pass `start_time` for MiniStack. |
| `fetchDynamoDBItems` | Optional filter query params | Scan FilterExpression. |
| `queryDynamoDBTable` | JSON body includes filter fields | Query FilterExpression. |

`LogEvent` / `LogEventsResponse` in `ui/src/lib/types.ts`: optional `log_stream_name`; `log_stream` may be null for group-wide fetches. `DynamoDBQueryRequest` includes the filter fields.

### `ui/src/components/service-views/LambdaBrowser.tsx`

- Import `FunctionLogsPanel`, `displayResourceName`, `matchesResourceFilter`.
- List filter uses `matchesResourceFilter` instead of raw `includes` on `FunctionName`.
- Cards/detail titles use `displayResourceName` with the full name on `title`.
- New tab **Logs** next to Configuration, rendering `FunctionLogsPanel`.

### `ui/src/components/service-views/DynamoDBBrowser.tsx`

- Table search uses `matchesResourceFilter`; table titles use `displayResourceName`.
- State: `filterAttribute`, `filterOperator`, `filterValue`.
- Scan/query/pagination pass those into `fetchDynamoDBItems` / `queryDynamoDBTable`.
- FilterExpression row (`=`, `begins_with`, `contains`) for both Scan and Query.
- Partition key labeled 'exact =' so operators are not typed into the PK box.

### `ui/src/components/service-views/LogsBrowser.tsx`

- Group/stream lists: `matchesResourceFilter` + `displayResourceName`.
- Event pane: `displayEvents = coalesceLogEvents(events)`.
- Live tail: if the buffer is empty, do a full reload (upstream only polled when `events.length > 0`, so empty streams stayed empty).

---

## Outside this tree (launcher)

Not in `apps/stackport`, but required for the fork to actually serve these patches:

| File | Why |
| --- | --- |
| `macpro-mdct-tools/scripts/run-stackport.sh` | Uses `uv run` (local source), not `uv tool run` (cached wheel). `uv tool run` kept serving a stale package, so log-route fixes never loaded. Points at MiniStack `http://127.0.0.1:${MINISTACK_PORT:-4566}` with `mdct`/`mdct`. |
| `macpro-mdct-tools/scripts/build-stackport-ui.sh` | Builds `ui/dist` (gitignored). The FastAPI app serves that bundle. |

App repos (`./run stackport`, `MDCT_STACKPORT=1 ./run local`) only spawn that launcher.

---

## If you need to change logs again

1. Do not add `GET /groups/{name:path}/events`. Use `/filter-events` or a non-greedy path.
2. Always pass a `startTime` (or equivalent) against MiniStack.
3. Rebuild `ui/dist` and restart with `uv run` from this directory.
4. Keep this file in sync if the fork moves relative to v0.3.8 (or retarget the tag if you rebase onto a newer upstream, without sending patches upstream).
