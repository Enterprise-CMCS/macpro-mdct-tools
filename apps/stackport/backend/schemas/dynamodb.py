"""Pydantic schemas for DynamoDB API requests."""

from typing import Any, Literal, Union

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    partition_key_value: str
    sort_key_value: str | None = None
    sort_key_operator: str = "="  # =, <, <=, >, >=, BETWEEN, BEGINS_WITH
    limit: int = 25
    filter_attribute: str | None = None
    filter_operator: Literal["=", "begins_with", "contains"] | None = None
    filter_value: str | None = None
    filter_value_type: Literal["S", "N"] = "S"


class PutItemRequest(BaseModel):
    item: dict[str, Any]
    item_format: Literal["dynamodb", "plain"] = "dynamodb"


class DeleteItemRequest(BaseModel):
    key: dict[str, Any]
    item_format: Literal["dynamodb", "plain"] = "dynamodb"


class _BatchOpPut(BaseModel):
    op: Literal["put"] = "put"
    item: dict[str, Any]


class _BatchOpDelete(BaseModel):
    op: Literal["delete"] = "delete"
    key: dict[str, Any]


class BatchWriteRequest(BaseModel):
    item_format: Literal["dynamodb", "plain"] = "dynamodb"
    operations: list[Union[_BatchOpPut, _BatchOpDelete]] = Field(min_length=1, max_length=25)
