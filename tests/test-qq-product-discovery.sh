#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-product-discovery"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
HELPER="$ROOT/bin/lib/qq_product_discovery.py"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

python3 - "$HELPER" "$tmp" <<'PY'
from dataclasses import FrozenInstanceError, fields
import importlib.util
import os
from pathlib import Path
import shutil
import stat
import sys

helper, scratch = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("qq_product_discovery_test", helper)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

assert helper.stat().st_mode & 0o111 == 0
assert not hasattr(module, "_main")
assert module.__all__ == ["Product", "ProductDiscoveryError", "discover_products"]


def render(product_id, collections, roots, schema="1", extra=""):
    lines = [
        f"schema_version: {schema}",
        f"id: {product_id}",
        "task_collections:",
        *(f"  - {value}" for value in collections),
        "resource_roots:",
        *(f"  - {value}" for value in roots),
    ]
    if extra:
        lines.append(extra)
    return "\n".join(lines) + "\n"


class Fixture:
    def __init__(self, name):
        self.base = scratch / name
        self.repo = self.base / "repo"
        self.store = self.base / "store"
        self.products = self.store / "products"
        self.resources = self.base / "resources"
        self.repo.mkdir(parents=True)
        self.products.mkdir(parents=True)
        self.resources.mkdir()
        for collection in ("qq", "deciq"):
            (self.store / collection).mkdir()
        self.qq_root = self.resources / "qq"
        self.deciq_root = self.resources / "deciq"
        self.deciq_logic_root = self.resources / "deciq-logic"
        for root in (self.qq_root, self.deciq_root, self.deciq_logic_root):
            root.mkdir()
        (self.repo / "backlog").symlink_to(self.store / "qq")
        self.write(
            "qq.yaml",
            render("qq", ["qq"], [self.qq_root]),
        )
        # Reverse the authority order so discovery must impose root ordering.
        self.write(
            "deciq.yaml",
            render(
                "deciq",
                ["deciq"],
                [self.deciq_logic_root, self.deciq_root],
            ),
        )

    def write(self, filename, text):
        (self.products / filename).write_text(text, encoding="utf-8")

    def clear_authorities(self):
        for path in self.products.glob("*.yaml"):
            path.unlink()


def snapshot(root):
    result = {}
    pending = [root]
    while pending:
        directory = pending.pop()
        for path in sorted(directory.iterdir(), key=lambda item: item.name):
            relative = str(path.relative_to(root))
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                result[relative] = ("link", os.readlink(path))
            elif stat.S_ISDIR(mode):
                result[relative] = ("directory", stat.S_IMODE(mode))
                pending.append(path)
            elif stat.S_ISREG(mode):
                result[relative] = ("file", stat.S_IMODE(mode), path.read_bytes())
            else:
                result[relative] = ("other", mode)
    return result


def expect_fixture_error(name, mutate, needles):
    fixture = Fixture(name)
    mutate(fixture)
    before = snapshot(fixture.base)
    try:
        module.discover_products(fixture.repo)
    except module.ProductDiscoveryError as error:
        message = str(error)
    else:
        raise AssertionError(f"{name}: invalid fixture was accepted")
    assert snapshot(fixture.base) == before, f"{name}: discovery mutated its fixture"
    for needle in needles:
        assert needle in message, f"{name}: expected {needle!r} in {message!r}"
    assert str(fixture.base) in message, f"{name}: diagnostic is not path-specific: {message}"


# Positive production seam: only an explicit Repository root and its backlog
# symlink select the store. Returned Product and membership order is stable.
positive = Fixture("positive")
positive_before = snapshot(positive.base)
products = module.discover_products(positive.repo)
assert products == (
    module.Product(
        id="deciq",
        task_collections=("deciq",),
        resource_roots=(str(positive.deciq_root), str(positive.deciq_logic_root)),
    ),
    module.Product(
        id="qq",
        task_collections=("qq",),
        resource_roots=(str(positive.qq_root),),
    ),
)
assert snapshot(positive.base) == positive_before
assert tuple(field.name for field in fields(module.Product)) == (
    "id", "task_collections", "resource_roots"
)
for forbidden in (
    "schema_version", "pane", "session", "claim", "lease", "message",
    "forecast", "live_state", "output",
):
    assert not hasattr(products[0], forbidden)
assert isinstance(products, tuple)
assert isinstance(products[0].task_collections, tuple)
assert isinstance(products[0].resource_roots, tuple)
try:
    products[0].id = "changed"
except FrozenInstanceError:
    pass
else:
    raise AssertionError("Product values are mutable")
try:
    products[0].task_collections[0] = "changed"
except TypeError:
    pass
else:
    raise AssertionError("Product membership is mutable")

ordering = Fixture("membership-ordering")
(ordering.store / "zeta").mkdir()
ordering.write(
    "qq.yaml",
    render("qq", ["zeta", "qq"], [ordering.qq_root]),
)
ordered_qq = next(
    product for product in module.discover_products(ordering.repo) if product.id == "qq"
)
assert ordered_qq.task_collections == ("qq", "zeta")

# Repository/store availability and ambiguity fail closed.
missing_repo = scratch / "missing-repository"
try:
    module.discover_products(missing_repo)
except module.ProductDiscoveryError as error:
    assert str(missing_repo) in str(error) and "does not exist" in str(error)
else:
    raise AssertionError("missing Repository was accepted")
try:
    module.discover_products(Path("relative-repository"))
except module.ProductDiscoveryError as error:
    assert "must be absolute" in str(error)
else:
    raise AssertionError("relative Repository input inferred state from cwd")

expect_fixture_error(
    "missing-backlog",
    lambda fixture: (fixture.repo / "backlog").unlink(),
    ("backlog", "mount is missing"),
)

def regular_backlog(fixture):
    (fixture.repo / "backlog").unlink()
    (fixture.repo / "backlog").mkdir()
expect_fixture_error(
    "ambiguous-backlog", regular_backlog,
    ("backlog", "ambiguous", "expected one symlink mount"),
)

def dangling_backlog(fixture):
    (fixture.repo / "backlog").unlink()
    (fixture.repo / "backlog").symlink_to(fixture.base / "absent" / "qq")
expect_fixture_error(
    "unavailable-store", dangling_backlog,
    ("absent", "does not exist"),
)

def store_symlink(fixture):
    actual = fixture.base / "actual-store"
    fixture.store.rename(actual)
    fixture.store.symlink_to(actual)
expect_fixture_error(
    "symlink-store", store_symlink,
    ("store", "symlink ambiguity"),
)

def missing_products(fixture):
    shutil.rmtree(fixture.products)
expect_fixture_error(
    "missing-products", missing_products,
    ("products", "does not exist"),
)

def nondirectory_products(fixture):
    shutil.rmtree(fixture.products)
    fixture.products.write_text("not a directory\n", encoding="utf-8")
expect_fixture_error(
    "nondirectory-products", nondirectory_products,
    ("products", "not a directory"),
)

def symlink_products(fixture):
    actual = fixture.base / "actual-products"
    fixture.products.rename(actual)
    fixture.products.symlink_to(actual)
expect_fixture_error(
    "symlink-products", symlink_products,
    ("products", "symlink ambiguity"),
)

# Version, key, shape, identity, and per-record uniqueness validation.
expect_fixture_error(
    "unknown-version",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["qq"], [fixture.qq_root], schema="2")),
    ("qq.yaml", "unknown Product schema_version 2"),
)
expect_fixture_error(
    "version-type",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["qq"], [fixture.qq_root], schema='"1"')),
    ("qq.yaml", "integer 1", "another YAML type"),
)
for live_key in (
    "pane_id", "session_id", "claim_id", "message_id", "forecast",
    "lease", "live_state", "output",
):
    expect_fixture_error(
        f"unknown-{live_key}",
        lambda fixture, key=live_key: fixture.write(
            "qq.yaml", render("qq", ["qq"], [fixture.qq_root], extra=f"{key}: forbidden")
        ),
        ("qq.yaml", f"unknown Product key '{live_key}'"),
    )

def missing_key(fixture):
    fixture.write(
        "qq.yaml",
        "schema_version: 1\nid: qq\ntask_collections:\n  - qq\n",
    )
expect_fixture_error(
    "missing-key", missing_key,
    ("qq.yaml", "missing required Product key(s): resource_roots"),
)

def duplicate_key(fixture):
    fixture.write(
        "qq.yaml",
        render("qq", ["qq"], [fixture.qq_root]) + "id: qq\n",
    )
expect_fixture_error(
    "duplicate-key", duplicate_key,
    ("qq.yaml", "duplicate YAML key 'id'"),
)

def scalar_list(fixture):
    fixture.write(
        "qq.yaml",
        f"schema_version: 1\nid: qq\ntask_collections: qq\nresource_roots:\n  - {fixture.qq_root}\n",
    )
expect_fixture_error(
    "malformed-type", scalar_list,
    ("qq.yaml", "task_collections must be a block sequence, not a scalar"),
)
expect_fixture_error(
    "malformed-structure",
    lambda fixture: fixture.write("qq.yaml", "---\nschema_version: 1\n"),
    ("qq.yaml", "malformed Product"),
)
for codepoint in (0x0B, 0x0C, 0x1C, 0x1D, 0x1E, 0x85, 0x2028, 0x2029):
    expect_fixture_error(
        f"unsupported-line-separator-{codepoint:04x}",
        lambda fixture, value=chr(codepoint): fixture.write(
            "qq.yaml",
            render("qq", ["qq"], [fixture.qq_root]).replace("\n", value, 1),
        ),
        ("qq.yaml", f"unsupported line separator U+{codepoint:04X}"),
    )

def malformed_utf8(fixture):
    (fixture.products / "qq.yaml").write_bytes(b"schema_version: 1\nid: \xff\n")
expect_fixture_error(
    "malformed-utf8", malformed_utf8,
    ("qq.yaml", "not valid UTF-8"),
)
expect_fixture_error(
    "malformed-id",
    lambda fixture: fixture.write("qq.yaml", render("Bad_ID", ["qq"], [fixture.qq_root])),
    ("qq.yaml", "malformed Product ID"),
)

def malformed_filename(fixture):
    (fixture.products / "qq.yaml").rename(fixture.products / "Bad_ID.yaml")
expect_fixture_error(
    "malformed-filename", malformed_filename,
    ("Bad_ID.yaml", "filename", "canonical Product ID"),
)
expect_fixture_error(
    "malformed-collection",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["Bad_Name"], [fixture.qq_root])),
    ("qq.yaml", "malformed task-collection name"),
)
expect_fixture_error(
    "filename-id-mismatch",
    lambda fixture: fixture.write("qq.yaml", render("other", ["qq"], [fixture.qq_root])),
    ("qq.yaml", "filename Product ID 'qq'", "record ID 'other'"),
)

def duplicate_product_id(fixture):
    fixture.clear_authorities()
    for collection in ("one", "two"):
        (fixture.store / collection).mkdir()
    one_root = fixture.resources / "one"
    two_root = fixture.resources / "two"
    one_root.mkdir()
    two_root.mkdir()
    fixture.write("one.yaml", render("duplicate", ["one"], [one_root]))
    fixture.write("two.yaml", render("duplicate", ["two"], [two_root]))
expect_fixture_error(
    "duplicate-product-id", duplicate_product_id,
    ("two.yaml", "duplicate Product ID 'duplicate'", "one.yaml"),
)
expect_fixture_error(
    "empty-collections",
    lambda fixture: fixture.write("qq.yaml", render("qq", [], [fixture.qq_root])),
    ("qq.yaml", "task_collections must contain at least one value"),
)
expect_fixture_error(
    "empty-roots",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["qq"], [])),
    ("qq.yaml", "resource_roots must contain at least one value"),
)
expect_fixture_error(
    "duplicate-collection",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["qq", "qq"], [fixture.qq_root])),
    ("qq.yaml", "task_collections contains duplicate value 'qq'"),
)
expect_fixture_error(
    "duplicate-root",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["qq"], [fixture.qq_root, fixture.qq_root])),
    ("qq.yaml", "resource_roots contains duplicate value"),
)

# Cross-Product ownership is exclusive and deterministic.
expect_fixture_error(
    "collection-conflict",
    lambda fixture: fixture.write("deciq.yaml", render("deciq", ["qq"], [fixture.deciq_root])),
    ("qq.yaml", "task collection 'qq' conflicts", "Product 'deciq'", "deciq.yaml"),
)
expect_fixture_error(
    "root-conflict",
    lambda fixture: fixture.write("deciq.yaml", render("deciq", ["deciq"], [fixture.qq_root])),
    ("qq.yaml", "resource root", "conflicts with Product 'deciq'", "deciq.yaml"),
)

# Collection and resource-root paths must exist as canonical real directories.
def missing_collection(fixture):
    (fixture.store / "deciq").rmdir()
expect_fixture_error(
    "missing-collection", missing_collection,
    ("deciq", "task collection", "does not exist"),
)
def file_collection(fixture):
    (fixture.store / "deciq").rmdir()
    (fixture.store / "deciq").write_text("not a directory\n", encoding="utf-8")
expect_fixture_error(
    "file-collection", file_collection,
    ("deciq", "task collection", "not a directory"),
)
def symlink_collection(fixture):
    (fixture.store / "deciq").rmdir()
    target = fixture.base / "actual-deciq-collection"
    target.mkdir()
    (fixture.store / "deciq").symlink_to(target)
expect_fixture_error(
    "symlink-collection", symlink_collection,
    ("deciq", "task collection", "symlink ambiguity"),
)
expect_fixture_error(
    "relative-root",
    lambda fixture: fixture.write("qq.yaml", render("qq", ["qq"], ["relative/root"])),
    ("qq.yaml", "resource root 'relative/root' must be absolute"),
)
def missing_root(fixture):
    absent = fixture.resources / "absent"
    fixture.write("qq.yaml", render("qq", ["qq"], [absent]))
expect_fixture_error(
    "missing-root", missing_root,
    ("absent", "resource root", "does not exist"),
)
def file_root(fixture):
    value = fixture.resources / "file"
    value.write_text("not a directory\n", encoding="utf-8")
    fixture.write("qq.yaml", render("qq", ["qq"], [value]))
expect_fixture_error(
    "file-root", file_root,
    ("file", "resource root", "not a directory"),
)
def noncanonical_root(fixture):
    value = f"{fixture.resources}/qq/../qq"
    fixture.write("qq.yaml", render("qq", ["qq"], [value]))
expect_fixture_error(
    "noncanonical-root", noncanonical_root,
    ("qq.yaml", "resource root", "not canonical"),
)
def symlink_root(fixture):
    link = fixture.resources / "linked-root"
    link.symlink_to(fixture.qq_root)
    fixture.write("qq.yaml", render("qq", ["qq"], [link]))
expect_fixture_error(
    "symlink-root", symlink_root,
    ("linked-root", "resource root", "symlink ambiguity"),
)
def symlink_authority(fixture):
    target = fixture.base / "qq-authority.yaml"
    (fixture.products / "qq.yaml").rename(target)
    (fixture.products / "qq.yaml").symlink_to(target)
expect_fixture_error(
    "symlink-authority", symlink_authority,
    ("qq.yaml", "authority file has symlink ambiguity"),
)
def no_authorities(fixture):
    fixture.clear_authorities()
    (fixture.products / "product-v1.schema.json").write_text("{}\n", encoding="utf-8")
expect_fixture_error(
    "no-authorities", no_authorities,
    ("products", "no Product authorities"),
)
PY

printf 'test-qq-product-discovery: pass\n'
