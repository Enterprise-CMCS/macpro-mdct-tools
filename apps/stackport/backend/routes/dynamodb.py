import base64
import json
import logging
from typing import Any

from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.aws_client import get_client
from backend.cache import cache
from backend.routes.common import EndpointInfo, get_endpoint_info
from backend.schemas.dynamodb import BatchWriteRequest, DeleteItemRequest, PutItemRequest, QueryRequest

logger = logging.getLogger(__name__)

_serializer = TypeSerializer()

# DynamoDB Limit is items *read*, not matches after FilterExpression. Loop internally
# until a page of matches is filled, but cap so a rare filter cannot hang MiniStack.
_FILTERED_MAX_PAGES = 50
_FILTERED_MAX_SCANNED = 10_000


def _plain_to_dynamodb_item(plain: dict[str, Any]) -> dict[str, Any]:
    return {k: _serializer.serialize(v) for k, v in plain.items()}



def _encode_start_key(key: dict[str, Any] | None) -> str | None:
    if not key:
        return None
    return base64.b64encode(json.dumps(key).encode("utf-8")).decode("utf-8")


def _decode_start_key(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        logger.debug("Invalid exclusive_start_key", exc_info=True)
        return None


def _item_primary_key(
    item: dict[str, Any],
    partition_key: str | None,
    sort_key: str | None,
) -> dict[str, Any] | None:
    if not partition_key or partition_key not in item:
        return None
    key = {partition_key: item[partition_key]}
    if sort_key and sort_key in item:
        key[sort_key] = item[sort_key]
    return key


def _collect_filtered_pages(
    operation: Any,
    params: dict[str, Any],
    limit: int,
    *,
    partition_key: str | None = None,
    sort_key: str | None = None,
) -> tuple[list[dict[str, Any]], int, dict[str, Any] | None]:
    """Repeat scan/query until `limit` matches, the table is exhausted, or a safety cap."""
    items: list[dict[str, Any]] = []
    scanned_count = 0
    last_evaluated_key: dict[str, Any] | None = None
    pages = 0

    while (
        len(items) < limit
        and pages < _FILTERED_MAX_PAGES
        and scanned_count < _FILTERED_MAX_SCANNED
    ):
        pages += 1
        page_params = dict(params)
        if last_evaluated_key:
            page_params["ExclusiveStartKey"] = last_evaluated_key
        resp = operation(**page_params)
        page_items = resp.get("Items", [])
        items.extend(page_items)
        scanned_count += int(resp.get("ScannedCount", len(page_items)))
        last_evaluated_key = resp.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    next_key = last_evaluated_key
    if len(items) > limit:
        sliced_key = _item_primary_key(items[limit - 1], partition_key, sort_key)
        if sliced_key:
            next_key = sliced_key
        items = items[:limit]

    return items, scanned_count, next_key


def _build_filter_expression(
    attribute: str | None,
    operator: str | None,
    value: str | None,
    value_type: str = "S",
) -> tuple[str | None, dict[str, str], dict[str, Any]]:
    """Build a FilterExpression for Scan/Query (=, begins_with, contains)."""
    if not attribute or not operator or value is None or value == "":
        return None, {}, {}

    names = {"#fattr": attribute}
    values: dict[str, Any] = {":fval": {value_type: value}}
    if operator == "=":
        expr = "#fattr = :fval"
    elif operator == "begins_with":
        expr = "begins_with(#fattr, :fval)"
    elif operator == "contains":
        expr = "contains(#fattr, :fval)"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported filter operator: {operator}")
    return expr, names, values


def _get_partition_sort_keys(dynamodb: Any, table_name: str) -> tuple[str | None, str | None]:
    table_resp = dynamodb.describe_table(TableName=table_name)
    key_schema = table_resp["Table"].get("KeySchema", [])
    partition_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "HASH"), None)
    sort_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "RANGE"), None)
    return partition_key, sort_key


def _require_key_attributes(
    attrs: dict[str, Any],
    partition_key: str | None,
    sort_key: str | None,
    *,
    label: str,
) -> None:
    if not partition_key:
        raise HTTPException(status_code=400, detail="Table has no partition key in key schema")
    if partition_key not in attrs:
        raise HTTPException(status_code=400, detail=f"Missing {label} attribute: {partition_key!r}")
    if sort_key and sort_key not in attrs:
        raise HTTPException(status_code=400, detail=f"Missing {label} attribute: {sort_key!r}")


def _coerce_item_dict(raw: dict[str, Any], item_format: str) -> dict[str, Any]:
    if item_format == "plain":
        try:
            return _plain_to_dynamodb_item(raw)
        except TypeError as e:
            raise HTTPException(status_code=400, detail=f"Could not convert plain item to DynamoDB types: {e}") from e
    return raw


def _coerce_key_dict(raw: dict[str, Any], item_format: str) -> dict[str, Any]:
    if item_format == "plain":
        try:
            return _plain_to_dynamodb_item(raw)
        except TypeError as e:
            raise HTTPException(status_code=400, detail=f"Could not convert plain key to DynamoDB types: {e}") from e
    return raw


def _invalidate_table_item_count(table_name: str, endpoint_url: str | None) -> None:
    cache.delete(f"{endpoint_url}:dynamodb:item_count:{table_name}")


def _client_error_message(exc: ClientError) -> str:
    err = exc.response.get("Error", {})
    return err.get("Message", err.get("Code", str(exc)))

router = APIRouter()


def _get_table_item_count(table_name: str, endpoint_url: str | None) -> int:
    """Return item count for a table. Cached 30s."""
    cache_key = f"{endpoint_url}:dynamodb:item_count:{table_name}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    dynamodb = get_client("dynamodb", endpoint_url)
    try:
        resp = dynamodb.describe_table(TableName=table_name)
        item_count = resp["Table"].get("ItemCount", 0)
        cache.set(cache_key, item_count, ttl=30)
        return item_count
    except Exception:
        logger.debug("Failed to get item count for %s", table_name, exc_info=True)
        return 0


@router.get("/tables")
def list_tables(ep: EndpointInfo = Depends(get_endpoint_info)):
    dynamodb = get_client("dynamodb", **ep.client_kwargs())
    paginator = dynamodb.get_paginator("list_tables")
    table_names = []

    for page in paginator.paginate():
        table_names.extend(page.get("TableNames", []))

    tables = []
    for name in table_names:
        try:
            resp = dynamodb.describe_table(TableName=name)
            table = resp["Table"]
            item_count = table.get("ItemCount", 0)
            table_size = table.get("TableSizeBytes", 0)

            key_schema = table.get("KeySchema", [])
            partition_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "HASH"), None)
            sort_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "RANGE"), None)

            tables.append(
                {
                    "name": name,
                    "status": table.get("TableStatus", "UNKNOWN"),
                    "item_count": item_count,
                    "size_bytes": table_size,
                    "partition_key": partition_key,
                    "sort_key": sort_key,
                    "billing_mode": table.get("BillingModeSummary", {}).get("BillingMode", "PROVISIONED"),
                    "created": table.get("CreationDateTime").isoformat() if table.get("CreationDateTime") else None,
                }
            )
        except Exception:
            logger.debug("Failed to describe table %s", name, exc_info=True)
            continue

    return {"tables": tables}


@router.get("/tables/{name}")
def get_table_detail(name: str, ep: EndpointInfo = Depends(get_endpoint_info)):
    dynamodb = get_client("dynamodb", **ep.client_kwargs())

    try:
        resp = dynamodb.describe_table(TableName=name)
        table = resp["Table"]

        key_schema = table.get("KeySchema", [])
        attribute_defs = {attr["AttributeName"]: attr["AttributeType"] for attr in table.get("AttributeDefinitions", [])}

        partition_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "HASH"), None)
        sort_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "RANGE"), None)

        return {
            "name": name,
            "status": table.get("TableStatus", "UNKNOWN"),
            "item_count": table.get("ItemCount", 0),
            "size_bytes": table.get("TableSizeBytes", 0),
            "partition_key": partition_key,
            "partition_key_type": attribute_defs.get(partition_key) if partition_key else None,
            "sort_key": sort_key,
            "sort_key_type": attribute_defs.get(sort_key) if sort_key else None,
            "billing_mode": table.get("BillingModeSummary", {}).get("BillingMode", "PROVISIONED"),
            "created": table.get("CreationDateTime").isoformat() if table.get("CreationDateTime") else None,
            "attribute_definitions": attribute_defs,
            "key_schema": key_schema,
            "global_secondary_indexes": table.get("GlobalSecondaryIndexes", []),
            "local_secondary_indexes": table.get("LocalSecondaryIndexes", []),
        }
    except Exception as e:
        logger.error("Failed to get table detail for %s: %s", name, e, exc_info=True)
        return {"error": str(e)}


@router.get("/tables/{name}/items")
def scan_table(
    name: str,
    limit: int = Query(default=25, ge=1, le=100, description="Max items per page"),
    exclusive_start_key: str = Query(default=None, description="Base64 encoded last evaluated key for pagination"),
    filter_attribute: str = Query(default=None, description="Attribute name for FilterExpression"),
    filter_operator: str = Query(default=None, description="Filter operator: =, begins_with, contains"),
    filter_value: str = Query(default=None, description="Filter value"),
    filter_value_type: str = Query(default="S", description="DynamoDB attribute type for filter value (S or N)"),
    ep: EndpointInfo = Depends(get_endpoint_info),
):
    dynamodb = get_client("dynamodb", **ep.client_kwargs())

    scan_params: dict[str, Any] = {
        "TableName": name,
        "Limit": limit,
    }

    filter_expr, filter_names, filter_values = _build_filter_expression(
        filter_attribute, filter_operator, filter_value, filter_value_type or "S"
    )
    if filter_expr:
        scan_params["FilterExpression"] = filter_expr
        scan_params["ExpressionAttributeNames"] = filter_names
        scan_params["ExpressionAttributeValues"] = filter_values

    start_key = _decode_start_key(exclusive_start_key)
    if start_key:
        scan_params["ExclusiveStartKey"] = start_key

    try:
        if filter_expr:
            partition_key, sort_key = None, None
            try:
                partition_key, sort_key = _get_partition_sort_keys(dynamodb, name)
            except Exception:
                logger.debug("Could not read key schema for filtered scan of %s", name, exc_info=True)
            items, scanned_count, last_evaluated_key = _collect_filtered_pages(
                dynamodb.scan,
                scan_params,
                limit,
                partition_key=partition_key,
                sort_key=sort_key,
            )
        else:
            resp = dynamodb.scan(**scan_params)
            items = resp.get("Items", [])
            scanned_count = resp.get("ScannedCount", len(items))
            last_evaluated_key = resp.get("LastEvaluatedKey")

        return {
            "table": name,
            "items": items,
            "count": len(items),
            "scanned_count": scanned_count,
            "next_token": _encode_start_key(last_evaluated_key),
        }
    except Exception as e:
        logger.error("Failed to scan table %s: %s", name, e, exc_info=True)
        return {"error": str(e), "items": [], "count": 0}



@router.post("/tables/{name}/query")
def query_table(name: str, request: QueryRequest, ep: EndpointInfo = Depends(get_endpoint_info)):
    dynamodb = get_client("dynamodb", **ep.client_kwargs())

    try:
        # Get table key schema
        table_resp = dynamodb.describe_table(TableName=name)
        table = table_resp["Table"]
        key_schema = table.get("KeySchema", [])
        attribute_defs = {attr["AttributeName"]: attr["AttributeType"] for attr in table.get("AttributeDefinitions", [])}

        partition_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "HASH"), None)
        sort_key = next((k["AttributeName"] for k in key_schema if k["KeyType"] == "RANGE"), None)

        if not partition_key:
            return {"error": "No partition key found in table schema", "items": [], "count": 0}

        partition_key_type = attribute_defs.get(partition_key, "S")

        # Build key condition expression
        key_condition = f"#{partition_key} = :pk"
        expression_attr_names = {f"#{partition_key}": partition_key}
        expression_attr_values = {":pk": {partition_key_type: request.partition_key_value}}

        if sort_key and request.sort_key_value:
            sort_key_type = attribute_defs.get(sort_key, "S")
            if request.sort_key_operator == "=":
                key_condition += f" AND #{sort_key} = :sk"
                expression_attr_values[":sk"] = {sort_key_type: request.sort_key_value}
            elif request.sort_key_operator in ("<", "<=", ">", ">="):
                key_condition += f" AND #{sort_key} {request.sort_key_operator} :sk"
                expression_attr_values[":sk"] = {sort_key_type: request.sort_key_value}
            elif request.sort_key_operator == "BEGINS_WITH":
                key_condition += f" AND begins_with(#{sort_key}, :sk)"
                expression_attr_values[":sk"] = {sort_key_type: request.sort_key_value}
            expression_attr_names[f"#{sort_key}"] = sort_key

        filter_expr, filter_names, filter_values = _build_filter_expression(
            request.filter_attribute,
            request.filter_operator,
            request.filter_value,
            request.filter_value_type,
        )
        if filter_expr:
            # Avoid colliding with key expression placeholders
            for k, v in filter_names.items():
                expression_attr_names[k] = v
            for k, v in filter_values.items():
                expression_attr_values[k] = v

        query_params = {
            "TableName": name,
            "KeyConditionExpression": key_condition,
            "ExpressionAttributeNames": expression_attr_names,
            "ExpressionAttributeValues": expression_attr_values,
            "Limit": request.limit,
        }
        if filter_expr:
            query_params["FilterExpression"] = filter_expr
            items, scanned_count, last_evaluated_key = _collect_filtered_pages(
                dynamodb.query,
                query_params,
                request.limit,
                partition_key=partition_key,
                sort_key=sort_key,
            )
        else:
            resp = dynamodb.query(**query_params)
            items = resp.get("Items", [])
            scanned_count = resp.get("ScannedCount", len(items))
            last_evaluated_key = resp.get("LastEvaluatedKey")

        return {
            "table": name,
            "items": items,
            "count": len(items),
            "scanned_count": scanned_count,
            "next_token": _encode_start_key(last_evaluated_key),
        }
    except Exception as e:
        logger.error("Failed to query table %s: %s", name, e, exc_info=True)
        return {"error": str(e), "items": [], "count": 0}


@router.api_route("/tables/{name}/items", methods=["POST", "PUT"])
def put_table_item(
    name: str,
    request: PutItemRequest,
    ep: EndpointInfo = Depends(get_endpoint_info),
) -> dict[str, Any]:
    """Create or replace an item (DynamoDB PutItem)."""
    dynamodb = get_client("dynamodb", **ep.client_kwargs())
    try:
        partition_key, sort_key = _get_partition_sort_keys(dynamodb, name)
    except Exception as e:
        logger.error("put_item describe failed for %s: %s", name, e, exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to read table: {e}") from e

    item = _coerce_item_dict(request.item, request.item_format)
    _require_key_attributes(item, partition_key, sort_key, label="item")

    try:
        dynamodb.put_item(TableName=name, Item=item)
    except ClientError as e:
        msg = _client_error_message(e)
        logger.error("put_item %s: %s", name, e, exc_info=True)
        raise HTTPException(status_code=400, detail=msg) from e

    _invalidate_table_item_count(name, ep.url)
    return {"ok": True, "table": name}


@router.delete("/tables/{name}/items")
def delete_table_item(
    name: str,
    request: DeleteItemRequest,
    ep: EndpointInfo = Depends(get_endpoint_info),
) -> dict[str, Any]:
    dynamodb = get_client("dynamodb", **ep.client_kwargs())
    try:
        partition_key, sort_key = _get_partition_sort_keys(dynamodb, name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read table: {e}") from e

    key = _coerce_key_dict(request.key, request.item_format)
    _require_key_attributes(key, partition_key, sort_key, label="key")

    try:
        dynamodb.delete_item(TableName=name, Key=key)
    except ClientError as e:
        msg = _client_error_message(e)
        raise HTTPException(status_code=400, detail=msg) from e

    _invalidate_table_item_count(name, ep.url)
    return {"ok": True, "table": name}


@router.post("/tables/{name}/items/batch")
def batch_write_items(
    name: str,
    request: BatchWriteRequest,
    ep: EndpointInfo = Depends(get_endpoint_info),
) -> dict[str, Any]:
    dynamodb = get_client("dynamodb", **ep.client_kwargs())
    try:
        partition_key, sort_key = _get_partition_sort_keys(dynamodb, name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read table: {e}") from e

    batch_requests: list[dict[str, Any]] = []
    for op in request.operations:
        if op.op == "put":
            item = _coerce_item_dict(op.item, request.item_format)
            _require_key_attributes(item, partition_key, sort_key, label="item")
            batch_requests.append({"PutRequest": {"Item": item}})
        else:
            key = _coerce_key_dict(op.key, request.item_format)
            _require_key_attributes(key, partition_key, sort_key, label="key")
            batch_requests.append({"DeleteRequest": {"Key": key}})

    try:
        resp = dynamodb.batch_write_item(RequestItems={name: batch_requests})
    except ClientError as e:
        msg = _client_error_message(e)
        raise HTTPException(status_code=400, detail=msg) from e

    _invalidate_table_item_count(name, ep.url)

    uproc = resp.get("UnprocessedItems", {})
    if uproc:
        return {
            "ok": True,
            "table": name,
            "unprocessed": uproc,
            "message": "Some items were not processed; retry with returned keys.",
        }

    return {"ok": True, "table": name, "unprocessed": {}}
