"""Strict, read-only discovery of Product authorities from a Repository store mount."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re
import stat
from typing import Final


__all__ = ["Product", "ProductDiscoveryError", "discover_products"]

_ID_RE: Final = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")
_KEY_RE: Final = re.compile(
    r"(?P<key>[A-Za-z_][A-Za-z0-9_-]*):(?:(?P<space> )(?P<value>.*))?\Z"
)
_REQUIRED_KEYS: Final = frozenset(
    {"schema_version", "id", "task_collections", "resource_roots"}
)
_LIST_KEYS: Final = frozenset({"task_collections", "resource_roots"})
_MAX_AUTHORITY_BYTES: Final = 64 * 1024
_UNSUPPORTED_LINE_SEPARATOR_RE: Final = re.compile("[\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]")


class ProductDiscoveryError(ValueError):
    """A Product authority or its configured store is unavailable or ambiguous."""


@dataclass(frozen=True, slots=True)
class Product:
    """Stable, immutable Product identity and membership."""

    id: str
    task_collections: tuple[str, ...]
    resource_roots: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _Record:
    product: Product
    path: Path


def _refuse(path: Path, detail: str) -> ProductDiscoveryError:
    return ProductDiscoveryError(f"{path}: {detail}")


def _reject_symlink_components(path: Path, label: str) -> None:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError as error:
            raise _refuse(path, f"{label} does not exist (missing {current})") from error
        except OSError as error:
            raise _refuse(path, f"cannot inspect {label} component {current}: {error}") from error
        if stat.S_ISLNK(mode):
            raise _refuse(path, f"{label} has symlink ambiguity at {current}")


def _require_canonical_directory(path: Path, label: str) -> Path:
    if not path.is_absolute():
        raise _refuse(path, f"{label} must be absolute")
    if os.path.normpath(os.fspath(path)) != os.fspath(path):
        raise _refuse(path, f"{label} is not a canonical path")

    _reject_symlink_components(path, label)
    try:
        mode = path.lstat().st_mode
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise _refuse(path, f"cannot resolve {label}: {error}") from error
    if not stat.S_ISDIR(mode):
        raise _refuse(path, f"{label} is not a directory")
    if resolved != path:
        raise _refuse(path, f"{label} is not canonical (resolves to {resolved})")
    return path


def _repository_root(repository_root: str | os.PathLike[str]) -> Path:
    try:
        raw = os.fspath(repository_root)
    except TypeError as error:
        raise ProductDiscoveryError(
            "Repository root must be one explicit absolute filesystem path"
        ) from error
    if not isinstance(raw, str) or not raw:
        raise ProductDiscoveryError(
            "Repository root must be one explicit absolute filesystem path"
        )
    return _require_canonical_directory(Path(raw), "Repository root")


def _resolve_store(repository_root: Path) -> tuple[Path, Path]:
    backlog = repository_root / "backlog"
    try:
        backlog_mode = backlog.lstat().st_mode
    except FileNotFoundError as error:
        raise _refuse(backlog, "configured Backlog store mount is missing") from error
    except OSError as error:
        raise _refuse(backlog, f"cannot inspect configured Backlog store mount: {error}") from error
    if not stat.S_ISLNK(backlog_mode):
        raise _refuse(
            backlog,
            "configured Backlog store is ambiguous; expected one symlink mount to a task collection",
        )

    try:
        target_text = os.readlink(backlog)
    except OSError as error:
        raise _refuse(backlog, f"cannot read configured Backlog store mount: {error}") from error
    target = Path(target_text)
    if not target.is_absolute():
        target = repository_root / target
    target = Path(os.path.normpath(os.fspath(target)))
    collection = _require_canonical_directory(target, "configured Backlog task collection")

    try:
        resolved_backlog = backlog.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise _refuse(backlog, f"configured Backlog store mount is unavailable: {error}") from error
    if resolved_backlog != collection:
        raise _refuse(
            backlog,
            f"configured Backlog store mount resolves ambiguously to {resolved_backlog}",
        )

    store = _require_canonical_directory(collection.parent, "configured qq-store root")
    products = _require_canonical_directory(store / "products", "Product authority directory")
    return store, products


def _authority_paths(products: Path) -> tuple[Path, ...]:
    try:
        entries = tuple(products.iterdir())
    except OSError as error:
        raise _refuse(products, f"cannot list Product authority directory: {error}") from error

    authorities: list[Path] = []
    for path in sorted(entries, key=lambda item: item.name):
        if not path.name.endswith(".yaml"):
            continue
        product_id = path.name.removesuffix(".yaml")
        if _ID_RE.fullmatch(product_id) is None:
            raise _refuse(
                path,
                "Product authority filename must be products/<product-id>.yaml with a canonical Product ID",
            )
        try:
            mode = path.lstat().st_mode
        except OSError as error:
            raise _refuse(path, f"cannot inspect Product authority file: {error}") from error
        if stat.S_ISLNK(mode):
            raise _refuse(path, "Product authority file has symlink ambiguity")
        if not stat.S_ISREG(mode):
            raise _refuse(path, "Product authority path is not a regular file")
        authorities.append(path)

    if not authorities:
        raise _refuse(products, "no Product authorities matching products/<product-id>.yaml")
    return tuple(authorities)


def _read_authority(path: Path) -> str:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise _refuse(path, f"cannot open Product authority as a non-symlink file: {error}") from error

    try:
        mode = os.fstat(descriptor).st_mode
        if not stat.S_ISREG(mode):
            raise _refuse(path, "Product authority path is not a regular file")
        with os.fdopen(descriptor, "rb", closefd=True) as authority:
            descriptor = -1
            raw = authority.read(_MAX_AUTHORITY_BYTES + 1)
    except OSError as error:
        raise _refuse(path, f"cannot read Product authority: {error}") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)

    if len(raw) > _MAX_AUTHORITY_BYTES:
        raise _refuse(path, f"Product authority exceeds {_MAX_AUTHORITY_BYTES} bytes")
    try:
        text = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise _refuse(path, f"Product authority is not valid UTF-8 at byte {error.start}") from error
    if "\x00" in text:
        raise _refuse(path, "Product authority contains a NUL byte")
    separator = _UNSUPPORTED_LINE_SEPARATOR_RE.search(text)
    if separator is not None:
        raise _refuse(
            path,
            f"Product authority contains unsupported line separator U+{ord(separator.group()):04X}",
        )
    return text


def _parse_mapping(path: Path, text: str) -> dict[str, str | list[str]]:
    values: dict[str, str | list[str]] = {}
    active_list: str | None = None
    lines = text.splitlines()
    if not lines:
        raise _refuse(path, "Product authority is empty")

    for line_number, line in enumerate(lines, start=1):
        location = Path(f"{path}:{line_number}")
        if not line or "\t" in line or line.rstrip(" ") != line:
            raise _refuse(location, "unsupported blank, tab, or trailing whitespace in strict Product YAML")

        if line.startswith("  - "):
            if active_list is None:
                raise _refuse(location, "sequence item appears outside a Product membership key")
            item = line[4:]
            if not item or item != item.strip() or " #" in item or ": " in item:
                raise _refuse(location, "malformed or ambiguous plain sequence scalar")
            current = values[active_list]
            assert isinstance(current, list)
            current.append(item)
            continue
        if line[0].isspace() or line.startswith("-"):
            raise _refuse(location, "malformed Product mapping or sequence indentation")

        match = _KEY_RE.fullmatch(line)
        if match is None:
            raise _refuse(location, "malformed strict Product YAML mapping entry")
        key = match.group("key")
        if key in values:
            raise _refuse(location, f"duplicate YAML key {key!r}")
        if key not in _REQUIRED_KEYS:
            raise _refuse(location, f"unknown Product key {key!r}")

        scalar = match.group("value") if match.group("space") is not None else None
        if key in _LIST_KEYS:
            if scalar is not None:
                raise _refuse(location, f"{key} must be a block sequence, not a scalar")
            values[key] = []
            active_list = key
        else:
            if scalar is None or not scalar or scalar != scalar.strip():
                raise _refuse(location, f"{key} must be one nonempty plain scalar")
            values[key] = scalar
            active_list = None

    missing = sorted(_REQUIRED_KEYS.difference(values))
    if missing:
        raise _refuse(path, f"missing required Product key(s): {', '.join(missing)}")
    return values


def _require_unique(path: Path, key: str, values: list[str]) -> None:
    if not values:
        raise _refuse(path, f"{key} must contain at least one value")
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise _refuse(path, f"{key} contains duplicate value {value!r}")
        seen.add(value)


def _parse_record(path: Path) -> _Record:
    values = _parse_mapping(path, _read_authority(path))
    schema_version = values["schema_version"]
    product_id = values["id"]
    task_collections = values["task_collections"]
    resource_roots = values["resource_roots"]
    assert isinstance(schema_version, str)
    assert isinstance(product_id, str)
    assert isinstance(task_collections, list)
    assert isinstance(resource_roots, list)

    if schema_version != "1":
        if re.fullmatch(r"-?(?:0|[1-9][0-9]*)", schema_version):
            raise _refuse(path, f"unknown Product schema_version {schema_version}; supported version is 1")
        raise _refuse(path, "schema_version must be the integer 1, not another YAML type")
    if _ID_RE.fullmatch(product_id) is None:
        raise _refuse(path, f"malformed Product ID {product_id!r}")

    _require_unique(path, "task_collections", task_collections)
    _require_unique(path, "resource_roots", resource_roots)
    for collection in task_collections:
        if _ID_RE.fullmatch(collection) is None:
            raise _refuse(path, f"malformed task-collection name {collection!r}")

    return _Record(
        Product(
            id=product_id,
            task_collections=tuple(sorted(task_collections)),
            resource_roots=tuple(sorted(resource_roots)),
        ),
        path,
    )


def _validate_record_identities(records: tuple[_Record, ...]) -> None:
    by_id: dict[str, Path] = {}
    for record in records:
        prior = by_id.get(record.product.id)
        if prior is not None:
            raise _refuse(
                record.path,
                f"duplicate Product ID {record.product.id!r}; already declared by {prior}",
            )
        by_id[record.product.id] = record.path

    for record in records:
        filename_id = record.path.name.removesuffix(".yaml")
        if record.product.id != filename_id:
            raise _refuse(
                record.path,
                f"filename Product ID {filename_id!r} does not match record ID {record.product.id!r}",
            )


def _validate_membership_conflicts(records: tuple[_Record, ...]) -> None:
    collections: dict[str, _Record] = {}
    roots: dict[str, _Record] = {}
    for record in records:
        for collection in record.product.task_collections:
            prior = collections.get(collection)
            if prior is not None:
                raise _refuse(
                    record.path,
                    f"task collection {collection!r} conflicts with Product {prior.product.id!r} in {prior.path}",
                )
            collections[collection] = record
        for root in record.product.resource_roots:
            prior = roots.get(root)
            if prior is not None:
                raise _refuse(
                    record.path,
                    f"resource root {root!r} conflicts with Product {prior.product.id!r} in {prior.path}",
                )
            roots[root] = record


def _validate_membership_paths(store: Path, records: tuple[_Record, ...]) -> None:
    for record in records:
        for collection in record.product.task_collections:
            _require_canonical_directory(
                store / collection,
                f"task collection {collection!r} declared by {record.path}",
            )
        for root in record.product.resource_roots:
            root_path = Path(root)
            if not root_path.is_absolute():
                raise _refuse(
                    record.path,
                    f"resource root {root!r} must be absolute",
                )
            if os.path.normpath(root) != root:
                raise _refuse(
                    record.path,
                    f"resource root {root!r} is not canonical",
                )
            _require_canonical_directory(
                root_path,
                f"resource root {root!r} declared by {record.path}",
            )


def discover_products(repository_root: str | os.PathLike[str]) -> tuple[Product, ...]:
    """Discover immutable Product membership from an explicit Repository root."""

    repository = _repository_root(repository_root)
    store, products = _resolve_store(repository)
    records = tuple(_parse_record(path) for path in _authority_paths(products))
    _validate_record_identities(records)
    _validate_membership_conflicts(records)
    _validate_membership_paths(store, records)
    return tuple(record.product for record in sorted(records, key=lambda item: item.product.id))
