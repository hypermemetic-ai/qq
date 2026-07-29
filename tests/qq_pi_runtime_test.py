#!/usr/bin/env python3
"""Hermetic coverage for bin/qq-pi-runtime."""

from __future__ import annotations

import copy
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tarfile
import tempfile
import threading
import time
import unittest
from unittest import mock
from typing import Any, Callable
import zipfile


ROOT = Path(__file__).resolve().parent.parent
ENGINE_PATH = ROOT / "bin" / "qq-pi-runtime"
loader = importlib.machinery.SourceFileLoader("qq_pi_runtime", str(ENGINE_PATH))
spec = importlib.util.spec_from_loader(loader.name, loader)
assert spec is not None
runtime = importlib.util.module_from_spec(spec)
sys.modules[loader.name] = runtime
loader.exec_module(runtime)
IDENTITY = "0.81.1+qq.execution-profile.2"


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class RuntimeFixture:
    def __init__(self, parent: Path):
        self.root = parent / "fixture-repo"
        self.root.mkdir()
        patch_dir = self.root / "patches" / "pi" / "v0.81.1"
        patch_dir.mkdir(parents=True)
        self.patch = patch_dir / "fixture.patch"
        self.patch.write_text("fixture patch\n", encoding="utf-8")
        manifest = json.loads((ROOT / "patches/pi/v0.81.1/manifest.json").read_text(encoding="utf-8"))
        manifest["patch"] = {
            "path": self.patch.name,
            "sha256": runtime._sha256_file(self.patch),
            "stripComponents": 1,
        }
        manifest["changedUpstreamPaths"] = ["file.txt"]
        self.manifest = manifest
        self.manifest_path = patch_dir / "manifest.json"
        self.write_manifest()
        self.spec = runtime.RuntimeSpec(
            repository_root=self.root,
            manifest_path=self.manifest_path,
            manifest=self.manifest,
            cache_root=parent / "cache",
            data_root=parent / "data",
        )
        self.engine = runtime.RuntimeEngine(self.spec)

    def write_manifest(self) -> None:
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def new_engine(self, *, opener=None) -> Any:
        return runtime.RuntimeEngine(
            runtime.RuntimeSpec(
                repository_root=self.root,
                manifest_path=self.manifest_path,
                manifest=self.manifest,
                cache_root=self.spec.cache_root,
                data_root=self.spec.data_root,
                opener=opener,
            )
        )

    def bundle(self, parent: Path, marker: str = "one", identity: str = IDENTITY) -> Path:
        bundle = parent / f"bundle-{marker}"
        bundle.mkdir()
        binary = bundle / "pi"
        binary.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            f"if [ \"${{1:-}}\" = --version ]; then printf '%s\\n' '{identity}'; exit 0; fi\n"
            "if [ -n \"${QQ_TEST_PI_LOG:-}\" ]; then printf '%s\\0' \"$@\" >>\"$QQ_TEST_PI_LOG\"; fi\n"
            "printf 'fixture-pi\\n'\n",
            encoding="utf-8",
        )
        binary.chmod(0o755)
        (bundle / "asset.txt").write_text(marker + "\n", encoding="utf-8")
        (bundle / "docs").mkdir()
        (bundle / "docs" / "readme.txt").write_text("fixture\n", encoding="utf-8")
        return bundle

    def artifact(self, parent: Path, marker: str = "one") -> Path:
        artifact = parent / f"artifact-{marker}.tar.gz"
        self.engine.create_artifact(self.bundle(parent, marker), artifact)
        return artifact


def repack(engine: Any, original: Path, output: Path, mutate: Callable[[Path, dict[str, Any]], Any]) -> None:
    with tempfile.TemporaryDirectory(dir=original.parent) as temporary_name:
        temporary = Path(temporary_name)
        extraction = temporary / "extracted"
        runtime._safe_extract_tar(original, extraction)
        wrapper = extraction / runtime.ARTIFACT_WRAPPER
        manifest_path = wrapper / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        mutate(wrapper, manifest)
        manifest_bytes = runtime._canonical_json(manifest)
        runtime._write_deterministic_artifact(output, manifest_bytes, wrapper / "bundle")


class RuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.temp = Path(self.temporary.name)
        self.fixture = RuntimeFixture(self.temp)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def assert_refuses(self, callback: Callable[[], Any], text: str | None = None) -> Any:
        with self.assertRaises(runtime.RuntimeFailure) as raised:
            callback()
        if text is not None:
            self.assertIn(text, str(raised.exception))
        return raised.exception

    def test_manifest_schema_platform_toolchain_source_and_patch_refusals(self) -> None:
        mutations = {
            "schema": lambda value: value.__setitem__("schemaVersion", 99),
            "platform": lambda value: value.__setitem__("supportedPlatforms", ["darwin-x64"]),
            "toolchain": lambda value: value["buildToolchain"]["node"].__setitem__("sha256", "x" * 64),
            "source": lambda value: value["upstream"]["sourceArchive"].__setitem__("sha256", "z" * 64),
            "identity": lambda value: value["patchedIdentity"].__setitem__("reportedVersion", "0.81.1"),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                changed = copy.deepcopy(self.fixture.manifest)
                mutate(changed)
                broken_spec = runtime.dataclasses.replace(self.fixture.spec, manifest=changed)
                self.assert_refuses(lambda: runtime.RuntimeEngine(broken_spec))
        self.fixture.patch.write_text("changed\n", encoding="utf-8")
        self.assert_refuses(lambda: self.fixture.new_engine(), "patch digest")

    def _malicious_tar(self, member: tarfile.TarInfo, content: bytes = b"x") -> Path:
        archive = self.temp / f"bad-{len(list(self.temp.glob('bad-*')))}.tar"
        with tarfile.open(archive, "w") as output:
            if member.isreg():
                member.size = len(content)
                output.addfile(member, io.BytesIO(content))
            else:
                output.addfile(member)
        return archive

    def test_safe_archive_extraction_rejection_matrix(self) -> None:
        cases: list[tuple[str, tarfile.TarInfo]] = []
        for name in ("/absolute", "../traversal", "a//b", "a/./b"):
            cases.append((name, tarfile.TarInfo(name)))
        link = tarfile.TarInfo("link")
        link.type = tarfile.SYMTYPE
        link.linkname = "target"
        cases.append(("symlink", link))
        hardlink = tarfile.TarInfo("hardlink")
        hardlink.type = tarfile.LNKTYPE
        hardlink.linkname = "target"
        cases.append(("hardlink", hardlink))
        fifo = tarfile.TarInfo("fifo")
        fifo.type = tarfile.FIFOTYPE
        cases.append(("fifo", fifo))
        for label, member in cases:
            with self.subTest(label=label):
                archive = self._malicious_tar(member)
                self.assert_refuses(lambda: runtime._safe_extract_tar(archive, self.temp / f"out-{label.replace('/', '_')}"))
        duplicate = self.temp / "duplicate.tar"
        with tarfile.open(duplicate, "w") as output:
            for value in (b"one", b"two"):
                member = tarfile.TarInfo("same")
                member.size = len(value)
                output.addfile(member, io.BytesIO(value))
        self.assert_refuses(lambda: runtime._safe_extract_tar(duplicate, self.temp / "duplicate-out"), "duplicate")
        overwrite = self.temp / "overwrite.tar"
        with tarfile.open(overwrite, "w") as output:
            first = tarfile.TarInfo("a")
            first.size = 1
            output.addfile(first, io.BytesIO(b"x"))
            second = tarfile.TarInfo("a/b")
            second.size = 1
            output.addfile(second, io.BytesIO(b"y"))
        self.assert_refuses(lambda: runtime._safe_extract_tar(overwrite, self.temp / "overwrite-out"))
        bad_zip = self.temp / "link.zip"
        with zipfile.ZipFile(bad_zip, "w") as output:
            member = zipfile.ZipInfo("link")
            member.create_system = 3
            member.external_attr = (stat.S_IFLNK | 0o777) << 16
            output.writestr(member, "target")
        self.assert_refuses(lambda: runtime._safe_extract_zip(bad_zip, self.temp / "zip-out"), "not a regular")

    def test_mountinfo_parser_recognizes_same_device_bind_and_escaped_paths(self) -> None:
        content = (
            b"40 1 0:44 / /tmp/xdg\\040root rw,relatime - ext4 /dev/root rw\n"
            b"41 40 0:44 /different-inode /tmp/xdg\\040root/archives/bind"
            b"\\011tab\\012line\\134slash rw,relatime - ext4 /dev/root rw\n"
        )
        with mock.patch.object(runtime.os.path, "ismount", side_effect=AssertionError("must not be used")):
            points = runtime._parse_mountinfo_mount_points(content)
        self.assertEqual(
            points,
            frozenset(
                {
                    b"/tmp/xdg root",
                    b"/tmp/xdg root/archives/bind\ttab\nline\\slash",
                }
            ),
        )
        source_dash = b"101 99 0:45 / /run/example rw,nosuid - tmpfs - rw,size=1m\n"
        self.assertEqual(runtime._parse_mountinfo_mount_points(source_dash), frozenset({b"/run/example"}))
        malformed_records = (
            b"",
            b"1 2 bad / /tmp rw - ext4 /dev/root rw\n",
            b"1 2 0:1 / /bad\\777 rw - ext4 x rw\n",
            b"101 99 0:45 / /run/example rw,nosuid tmpfs source rw,size=1m\n",
            b"101 99 0:45 / /run/example rw,nosuid - shared:1 - tmpfs source rw,size=1m\n",
        )
        for malformed in malformed_records:
            with self.subTest(malformed=malformed):
                self.assert_refuses(lambda malformed=malformed: runtime._parse_mountinfo_mount_points(malformed))

        missing = self.temp / "missing-mountinfo"
        with mock.patch.object(runtime, "MOUNTINFO_PATH", missing):
            self.assert_refuses(
                lambda: runtime._require_mount_free_tree(self.temp / "child", "synthetic child"),
                "cannot read Linux mount topology",
            )
        missing.write_bytes(b"malformed\n")
        with mock.patch.object(runtime, "MOUNTINFO_PATH", missing):
            self.assert_refuses(
                lambda: runtime._require_mount_free_tree(self.temp / "child", "synthetic child"),
                "malformed",
            )

    def test_mount_topology_refuses_fixed_children_before_side_effects(self) -> None:
        cache = self.fixture.spec.cache_root
        data = self.fixture.spec.data_root
        cache.mkdir(mode=0o700)
        data.mkdir(mode=0o700)
        archives = cache / "archives"
        npm_cache = cache / "npm-cache"
        generations = data / "generations"
        for path in (archives, npm_cache, generations):
            path.mkdir(mode=0o700)
            (path / "sentinel").write_text("preserve", encoding="utf-8")

        archive_spec = {"url": "https://example.invalid/source", "sha256": digest(b"source")}
        requested: list[str] = []
        engine = self.fixture.new_engine(opener=lambda url: (requested.append(url), io.BytesIO(b"source"))[1])
        archive_mounts = frozenset({os.fsencode(archives / "same-device-bind")})
        with mock.patch.object(runtime, "_mountinfo_mount_points", return_value=archive_mounts):
            self.assert_refuses(
                lambda: engine._fetch_archive("source", archive_spec, archives / "source.tar.gz"),
                "contains a mount point",
            )
            self.assert_refuses(engine._require_build_cache, "contains a mount point")
        self.assertEqual(requested, [])
        self.assertEqual((archives / "sentinel").read_text(encoding="utf-8"), "preserve")
        self.assertFalse((archives / "source.tar.gz").exists())

        candidate = cache / ".npm-cache-candidate-test"
        candidate.mkdir(mode=0o700)
        (candidate / "sentinel").write_text("candidate", encoding="utf-8")
        npm_mounts = frozenset({os.fsencode(npm_cache)})
        with mock.patch.object(runtime, "_mountinfo_mount_points", return_value=npm_mounts):
            self.assert_refuses(engine._npm_cache_root, "contains a mount point")
            self.assert_refuses(
                lambda: engine._publish_cache_directory(candidate, npm_cache),
                "contains a mount point",
            )
        self.assertEqual((npm_cache / "sentinel").read_text(encoding="utf-8"), "preserve")
        self.assertEqual((candidate / "sentinel").read_text(encoding="utf-8"), "candidate")

        artifact = self.fixture.artifact(self.temp, "mount-publication")
        generation_mounts = frozenset({os.fsencode(generations / "same-device-bind")})
        with mock.patch.object(runtime, "_mountinfo_mount_points", return_value=generation_mounts):
            self.assert_refuses(lambda: engine.install(artifact), "contains a mount point")
        self.assertEqual((generations / "sentinel").read_text(encoding="utf-8"), "preserve")
        self.assertFalse(os.path.lexists(data / "current"))

        workspace = cache / runtime.BUILD_WORKSPACE_NAME
        workspace.mkdir(mode=0o700)
        (workspace / "sentinel").write_text("preserve", encoding="utf-8")
        workspace_mounts = frozenset({os.fsencode(workspace / "same-device-bind")})
        with mock.patch.object(runtime, "_mountinfo_mount_points", return_value=workspace_mounts):
            self.assert_refuses(
                lambda: runtime._remove_build_workspace(workspace, cache, missing_ok=False),
                "contains a mount point",
            )
        self.assertEqual((workspace / "sentinel").read_text(encoding="utf-8"), "preserve")

        owning_roots = frozenset({os.fsencode(cache), os.fsencode(data)})
        with mock.patch.object(runtime, "_mountinfo_mount_points", return_value=owning_roots):
            self.assertEqual(engine._archive_root(create=False), archives)
            self.assertEqual(engine._npm_cache_root(), npm_cache)
            self.assertEqual(engine._generation_root(create=False), generations)

    def test_generation_nested_mount_refuses_verification_rollback_and_execution(self) -> None:
        first = self.fixture.engine.install(self.fixture.artifact(self.temp, "mount-one"))
        second = self.fixture.engine.install(self.fixture.artifact(self.temp, "mount-two"))
        data = self.fixture.spec.data_root
        generations = data / "generations"
        sentinel = generations / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")
        current_before = os.readlink(data / "current")
        previous_before = os.readlink(data / "previous")
        self.assertEqual(current_before, f"generations/{second['generation']}")
        self.assertEqual(previous_before, f"generations/{first['generation']}")
        mounts = frozenset({os.fsencode(generations / second["generation"] / "bundle" / "bind")})
        with mock.patch.object(runtime, "_mountinfo_mount_points", return_value=mounts):
            self.assert_refuses(self.fixture.engine.verify_active, "contains a mount point")
            self.assert_refuses(self.fixture.engine.rollback, "contains a mount point")
            with mock.patch.object(runtime.os, "execv") as execute:
                self.assert_refuses(lambda: self.fixture.engine.execute(["--version"]), "contains a mount point")
                execute.assert_not_called()
        self.assertEqual(os.readlink(data / "current"), current_before)
        self.assertEqual(os.readlink(data / "previous"), previous_before)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")

    def test_fetch_digest_exact_url_and_atomic_publication(self) -> None:
        good = b"exact archive"
        url = "https://example.invalid/exact.tar.gz"
        archive_spec = {"url": url, "sha256": digest(good), "topLevelDirectory": "source"}
        seen: list[str] = []

        def opener(requested: str):
            seen.append(requested)
            return io.BytesIO(good)

        engine = self.fixture.new_engine(opener=opener)
        destination = next(path for label, _spec, path in engine.archive_specs if label == "source")
        engine._fetch_archive("source", archive_spec, destination)
        self.assertEqual(destination.read_bytes(), good)
        self.assertEqual(seen, [url])
        destination.write_bytes(b"known old corrupt state")
        bad_engine = self.fixture.new_engine(opener=lambda _url: io.BytesIO(b"mismatch"))
        self.assert_refuses(
            lambda: bad_engine._fetch_archive("source", archive_spec, destination),
            "digest mismatch",
        )
        self.assertEqual(destination.read_bytes(), b"known old corrupt state")
        self.assertEqual(list(destination.parent.glob("*.part-*")), [])

    def test_archive_and_npm_cache_roots_refuse_escaping_writable_and_foreign_state(self) -> None:
        cache = self.fixture.spec.cache_root
        cache.mkdir(mode=0o700)
        unrelated = self.temp / "unrelated-cache"
        unrelated.mkdir()
        sentinel = unrelated / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")
        archives = cache / "archives"
        destination = archives / "pi-source.tar.gz"
        archive_spec = {"url": "https://example.invalid/source", "sha256": digest(b"source")}
        requested: list[str] = []
        engine = self.fixture.new_engine(opener=lambda url: (requested.append(url), io.BytesIO(b"source"))[1])

        archives.symlink_to(unrelated, target_is_directory=True)
        self.assert_refuses(lambda: engine._fetch_archive("source", archive_spec, destination), "not a real directory")
        self.assertEqual(requested, [])
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")
        archives.unlink()

        archives.mkdir(mode=0o700)
        archives.chmod(0o777)
        self.assert_refuses(lambda: engine._fetch_archive("source", archive_spec, destination), "group/world-writable")
        self.assertEqual(requested, [])
        archives.chmod(0o700)

        original_lstat = Path.lstat

        def foreign_archive(path: Path):
            result = original_lstat(path)
            if path == archives:
                values = list(result)
                values[4] = os.geteuid() + 1
                return os.stat_result(values)
            return result

        with mock.patch.object(Path, "lstat", foreign_archive):
            self.assert_refuses(lambda: engine._archive_root(create=False), "foreign-owned")
        archives.rmdir()

        npm_cache = cache / "npm-cache"
        npm_cache.symlink_to(unrelated, target_is_directory=True)
        self.assert_refuses(engine._npm_cache_root, "not a real directory")
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")
        npm_cache.unlink()
        npm_cache.mkdir(mode=0o700)
        npm_cache.chmod(0o777)
        self.assert_refuses(engine._npm_cache_root, "group/world-writable")

    def test_patch_check_apply_and_preimage_mismatch(self) -> None:
        source = self.temp / "source"
        source.mkdir()
        (source / "file.txt").write_text("before\n", encoding="utf-8")
        patch = (
            "--- a/file.txt\n"
            "+++ b/file.txt\n"
            "@@ -1 +1 @@\n"
            "-before\n"
            "+after\n"
        )
        self.fixture.patch.write_text(patch, encoding="utf-8")
        self.fixture.manifest["patch"]["sha256"] = runtime._sha256_file(self.fixture.patch)
        self.fixture.write_manifest()
        engine = self.fixture.new_engine()
        # _apply_patch's identity check needs the patched package manifest.
        package = source / "packages" / "coding-agent"
        package.mkdir(parents=True)
        (package / "package.json").write_text(
            json.dumps({"version": "0.81.1", "piConfig": {"buildIdentity": "qq.execution-profile.2"}}),
            encoding="utf-8",
        )
        engine._apply_patch(source)
        self.assertEqual((source / "file.txt").read_text(encoding="utf-8"), "after\n")
        self.assert_refuses(lambda: engine._apply_patch(source), "preimage/apply mismatch")

    def test_missing_and_mismatched_offline_cache_refusal_and_network_boundary(self) -> None:
        self.assert_refuses(lambda: self.fixture.engine._require_build_cache(), "archive cache root is missing")
        environment = self.fixture.engine._offline_environment(
            self.temp / "offline-env",
            Path("/tools/node"),
            Path("/tools/bun"),
            self.temp / "npm-cache",
        )
        self.assertEqual(environment["npm_config_offline"], "true")
        self.assertEqual(environment["PI_OFFLINE"], "1")
        for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
            self.assertEqual(environment[name], "http://127.0.0.1:9")
        self.assertEqual(environment["NO_PROXY"], "")
        blocked = runtime.subprocess.run(
            [sys.executable, "-c", "import socket; socket.socket(socket.AF_INET)"],
            preexec_fn=runtime._disable_network,
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(blocked.returncode, 0)
        self.assertIn("Network is unreachable", blocked.stderr)

    def test_deterministic_fixture_artifacts_and_inspection(self) -> None:
        bundle_one = self.fixture.bundle(self.temp, "deterministic")
        bundle_two = self.temp / "bundle-copy"
        shutil.copytree(bundle_one, bundle_two)
        first = self.temp / "first.tar.gz"
        second = self.temp / "second.tar.gz"
        first_result = self.fixture.engine.create_artifact(bundle_one, first)
        second_result = self.fixture.engine.create_artifact(bundle_two, second)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        self.assertEqual(first_result["generation"], second_result["generation"])
        inspected = self.fixture.engine.inspect_artifact(first)
        self.assertTrue(inspected["valid"])
        self.assertEqual(inspected["artifactSha256"], runtime._sha256_file(first))

    def test_artifact_provenance_inventory_type_mode_digest_identity_refusals(self) -> None:
        original = self.fixture.artifact(self.temp)
        def inventory_file(manifest: dict, path: str = "asset.txt") -> dict:
            return next(record for record in manifest["inventory"] if record["path"] == path)

        invalid: dict[str, Callable[[Path, dict[str, Any]], Any]] = {
            "artifact-schema": lambda _wrapper, manifest: manifest.__setitem__("schemaVersion", 99),
            "patch-provenance": lambda _wrapper, manifest: manifest["provenance"].__setitem__(
                "patchSha256", "0" * 64
            ),
            "source-provenance": lambda _wrapper, manifest: manifest["provenance"].__setitem__(
                "sourceArchiveSha256", "0" * 64
            ),
            "node-provenance": lambda _wrapper, manifest: manifest["provenance"]["node"].__setitem__(
                "sha256", "0" * 64
            ),
            "bun-provenance": lambda _wrapper, manifest: manifest["provenance"]["bun"].__setitem__(
                "version", "0.0.0"
            ),
            "platform-provenance": lambda _wrapper, manifest: manifest["provenance"].__setitem__(
                "platform", "darwin-x64"
            ),
            "model-data-provenance": lambda _wrapper, manifest: manifest["provenance"][
                "offlineModelData"
            ].__setitem__("archiveSha256", "0" * 64),
            "extra": lambda wrapper, _manifest: (wrapper / "bundle" / "extra").write_text("x"),
            "missing": lambda wrapper, _manifest: (wrapper / "bundle" / "asset.txt").unlink(),
            "digest": lambda wrapper, _manifest: (wrapper / "bundle" / "asset.txt").write_text("changed"),
            "mode": lambda wrapper, _manifest: (wrapper / "bundle" / "asset.txt").chmod(0o600),
            "binary-mode": lambda wrapper, _manifest: (wrapper / "bundle" / "pi").chmod(0o644),
            "type": lambda wrapper, _manifest: (
                (wrapper / "bundle" / "asset.txt").unlink(),
                (wrapper / "bundle" / "asset.txt").mkdir(),
            ),
            "declared-mode": lambda _wrapper, manifest: inventory_file(manifest).__setitem__("mode", 0o777),
            "declared-size": lambda _wrapper, manifest: inventory_file(manifest).__setitem__("size", 999),
            "declared-digest": lambda _wrapper, manifest: inventory_file(manifest).__setitem__(
                "sha256", "0" * 64
            ),
        }
        for name, mutation in invalid.items():
            with self.subTest(name=name):
                output = self.temp / f"invalid-{name}.tar.gz"
                repack(self.fixture.engine, original, output, mutation)
                self.assert_refuses(lambda output=output: self.fixture.engine.inspect_artifact(output))

        stock = self.temp / "stock.tar.gz"

        def stock_identity(wrapper: Path, manifest: dict) -> None:
            binary = wrapper / "bundle" / "pi"
            binary.write_text("#!/usr/bin/env bash\nprintf '0.81.1\\n'\n", encoding="utf-8")
            binary.chmod(0o755)
            manifest["inventory"] = runtime._inventory(wrapper / "bundle")

        repack(self.fixture.engine, original, stock, stock_identity)
        self.assert_refuses(lambda: self.fixture.engine.inspect_artifact(stock), "identity is not exactly")

    def test_install_verify_generation_switch_idempotence_and_failed_install(self) -> None:
        first = self.fixture.artifact(self.temp, "first")
        second = self.fixture.artifact(self.temp, "second")
        installed_first = self.fixture.engine.install(first)
        self.assertTrue(installed_first["activated"])
        repeated = self.fixture.engine.install(first)
        self.assertTrue(repeated["idempotent"])
        self.assertFalse((self.fixture.spec.data_root / "previous").exists())
        installed_second = self.fixture.engine.install(second)
        self.assertTrue(installed_second["activated"])
        current_before = os.readlink(self.fixture.spec.data_root / "current")
        self.assertEqual(os.readlink(self.fixture.spec.data_root / "previous"), f"generations/{installed_first['generation']}")
        self.assertTrue(self.fixture.engine.verify_active()["valid"])
        broken = self.temp / "broken.tar.gz"
        broken.write_bytes(b"not an artifact")
        self.assert_refuses(lambda: self.fixture.engine.install(broken))
        self.assertEqual(os.readlink(self.fixture.spec.data_root / "current"), current_before)
        active_asset = self.fixture.spec.data_root / current_before / "bundle" / "asset.txt"
        active_asset.write_text("tampered\n", encoding="utf-8")
        self.assert_refuses(lambda: self.fixture.engine.install(first), "inventory")
        self.assertEqual(os.readlink(self.fixture.spec.data_root / "current"), current_before)

    def test_exact_trusted_prior_generation_upgrades_rolls_back_and_rolls_forward(self) -> None:
        prior_identity = "0.81.1+qq.execution-profile.1"
        prior_provenance = copy.deepcopy(self.fixture.engine._provenance())
        prior_provenance["buildEngineVersion"] = 2
        prior_provenance["patchSha256"] = "5" * 64
        prior_provenance["patchedIdentity"] = {
            "packageVersion": "0.81.1",
            "buildIdentity": "qq.execution-profile.1",
            "reportedVersion": prior_identity,
        }
        prior_digest = runtime._sha256_bytes(runtime._canonical_json(prior_provenance))
        self.fixture.manifest["trustedPriorProvenanceSha256"] = [prior_digest]
        self.fixture.write_manifest()
        engine = self.fixture.new_engine()

        prior_bundle = self.fixture.bundle(self.temp, "trusted-prior", prior_identity)
        runtime._normalize_bundle_modes(prior_bundle)
        prior_manifest = {
            "schemaVersion": runtime.ARTIFACT_SCHEMA_VERSION,
            "provenance": prior_provenance,
            "inventory": runtime._inventory(prior_bundle),
        }
        prior_bytes = runtime._canonical_json(prior_manifest)
        prior_artifact = self.temp / "trusted-prior.tar.gz"
        runtime._write_deterministic_artifact(prior_artifact, prior_bytes, prior_bundle)

        installed_prior = engine.install(prior_artifact)
        self.assertEqual(installed_prior["identity"], prior_identity)
        self.assertEqual(engine.verify_active()["identity"], prior_identity)
        current_artifact = self.fixture.artifact(self.temp, "current-after-prior")
        installed_current = engine.install(current_artifact)
        self.assertEqual(installed_current["identity"], IDENTITY)
        self.assertEqual(engine.verify_active()["identity"], IDENTITY)
        rolled_back = engine.rollback()
        self.assertEqual(rolled_back["identity"], prior_identity)
        self.assertEqual(rolled_back["generation"], installed_prior["generation"])
        rolled_forward = engine.rollback()
        self.assertEqual(rolled_forward["identity"], IDENTITY)
        self.assertEqual(rolled_forward["generation"], installed_current["generation"])

        unknown_manifest = copy.deepcopy(prior_manifest)
        unknown_manifest["provenance"]["buildEngineVersion"] = 1
        unknown_artifact = self.temp / "unknown-prior.tar.gz"
        runtime._write_deterministic_artifact(
            unknown_artifact,
            runtime._canonical_json(unknown_manifest),
            prior_bundle,
        )
        self.assert_refuses(lambda: engine.inspect_artifact(unknown_artifact), "neither current nor an exact trusted prior")

    def test_active_verify_and_execute_do_not_write_installed_runtime(self) -> None:
        artifact = self.fixture.artifact(self.temp, "read-only-active")
        installed = self.fixture.engine.install(artifact)
        binary = installed["binary"]
        real_temporary_directory = tempfile.TemporaryDirectory
        probe_parents: list[Path | None] = []

        def temporary_directory(*args: Any, **kwargs: Any) -> Any:
            parent = kwargs.get("dir")
            self.assertNotEqual(parent, self.fixture.spec.data_root)
            probe_parents.append(parent)
            return real_temporary_directory(*args, **kwargs)

        with mock.patch.object(runtime.tempfile, "TemporaryDirectory", side_effect=temporary_directory):
            self.assertTrue(self.fixture.engine.verify_active()["valid"])
            with mock.patch.object(runtime.os, "execv") as execute:
                self.fixture.engine.execute(["--version"])
            execute.assert_called_once_with(binary, [binary, "--version"])
        self.assertEqual(probe_parents, [None, None])

    def test_install_and_rollback_keep_colocated_identity_scratch(self) -> None:
        first_artifact = self.fixture.artifact(self.temp, "colocated-one")
        second_artifact = self.fixture.artifact(self.temp, "colocated-two")
        unavailable_ambient_tmp = self.temp / "absent-ambient-tmp"
        with mock.patch.object(tempfile, "tempdir", str(unavailable_ambient_tmp)):
            first = self.fixture.engine.install(first_artifact)
            second = self.fixture.engine.install(second_artifact)
            rolled_back = self.fixture.engine.rollback()
        self.assertEqual(rolled_back["generation"], first["generation"])
        self.assertEqual(
            os.readlink(self.fixture.spec.data_root / "previous"),
            f"generations/{second['generation']}",
        )
        self.assertFalse(unavailable_ambient_tmp.exists())

    def test_generation_root_refuses_before_install_or_rollback_mutation(self) -> None:
        artifact = self.fixture.artifact(self.temp, "generation-root")
        data = self.fixture.spec.data_root
        data.mkdir(mode=0o700)
        unrelated = self.temp / "unrelated-generations"
        unrelated.mkdir()
        sentinel = unrelated / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")
        generations = data / "generations"
        generations.symlink_to(unrelated, target_is_directory=True)
        self.assert_refuses(lambda: self.fixture.engine.install(artifact), "not a real directory")
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")
        self.assertEqual(sorted(path.name for path in unrelated.iterdir()), ["sentinel"])
        self.assertFalse(os.path.lexists(data / "current"))
        generations.unlink()

        generations.write_text("wrong type", encoding="utf-8")
        self.assert_refuses(lambda: self.fixture.engine.install(artifact), "generation root")
        self.assertEqual(generations.read_text(encoding="utf-8"), "wrong type")
        generations.unlink()

        first = self.fixture.engine.install(artifact)
        second_artifact = self.fixture.artifact(self.temp, "generation-root-second")
        second = self.fixture.engine.install(second_artifact)
        current_before = os.readlink(data / "current")
        previous_before = os.readlink(data / "previous")
        generations.chmod(0o777)
        self.assert_refuses(self.fixture.engine.rollback, "group/world-writable")
        self.assert_refuses(self.fixture.engine.verify_active, "group/world-writable")
        self.assertEqual(os.readlink(data / "current"), current_before)
        self.assertEqual(os.readlink(data / "previous"), previous_before)
        self.assertEqual(current_before, f"generations/{second['generation']}")
        self.assertEqual(previous_before, f"generations/{first['generation']}")
        generations.chmod(0o700)

        original_lstat = Path.lstat

        def foreign_generation_root(path: Path):
            result = original_lstat(path)
            if path == generations:
                values = list(result)
                values[4] = os.geteuid() + 1
                return os.stat_result(values)
            return result

        with mock.patch.object(Path, "lstat", foreign_generation_root):
            self.assert_refuses(lambda: self.fixture.engine._generation_root(create=False), "foreign-owned")

        empty = self.temp / "missing-generation-root"
        empty.mkdir()
        missing_fixture = RuntimeFixture(empty)
        self.assert_refuses(missing_fixture.engine.verify_active, "generation root is missing")
        self.assertFalse(os.path.lexists(missing_fixture.spec.data_root / "generations"))

    def _fresh_installed(self, marker: str = "valid") -> tuple[RuntimeFixture, Path, dict]:
        nested = self.temp / marker
        nested.mkdir()
        fixture = RuntimeFixture(nested)
        artifact = fixture.artifact(nested, marker)
        result = fixture.engine.install(artifact)
        return fixture, artifact, result

    def test_verify_traversal_owner_writable_extra_missing_tamper_and_stock_refusals(self) -> None:
        mutations = {
            "traversal": lambda fixture, generation: (
                (fixture.spec.data_root / "current").unlink(),
                (fixture.spec.data_root / "current").symlink_to("../outside"),
            ),
            "writable": lambda fixture, generation: (
                fixture.spec.data_root / "generations" / generation / "bundle" / "asset.txt"
            ).chmod(0o666),
            "extra": lambda fixture, generation: (
                fixture.spec.data_root / "generations" / generation / "bundle" / "extra"
            ).write_text("x"),
            "missing": lambda fixture, generation: (
                fixture.spec.data_root / "generations" / generation / "bundle" / "asset.txt"
            ).unlink(),
            "tamper": lambda fixture, generation: (
                fixture.spec.data_root / "generations" / generation / "bundle" / "asset.txt"
            ).write_text("tampered"),
        }
        for name, mutation in mutations.items():
            with self.subTest(name=name):
                fixture, _artifact, result = self._fresh_installed(name)
                mutation(fixture, result["generation"])
                self.assert_refuses(lambda fixture=fixture: fixture.engine.verify_active())

        fixture, _artifact, result = self._fresh_installed("foreign")
        generation_path = fixture.spec.data_root / "generations" / result["generation"]
        with mock.patch.object(runtime.os, "geteuid", return_value=os.geteuid() + 1):
            self.assert_refuses(lambda: fixture.engine._verify_owner_modes(generation_path), "foreign-owned")

        fixture, _artifact, result = self._fresh_installed("stock")
        generation_path = fixture.spec.data_root / "generations" / result["generation"]
        binary = generation_path / "bundle" / "pi"
        binary.write_text("#!/usr/bin/env bash\nprintf '0.81.1\\n'\n", encoding="utf-8")
        binary.chmod(0o755)
        manifest_path = generation_path / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["inventory"] = runtime._inventory(generation_path / "bundle")
        manifest_bytes = runtime._canonical_json(manifest)
        new_generation = digest(manifest_bytes)
        manifest_path.write_bytes(manifest_bytes)
        new_path = generation_path.parent / new_generation
        generation_path.rename(new_path)
        (fixture.spec.data_root / "current").unlink()
        (fixture.spec.data_root / "current").symlink_to(f"generations/{new_generation}")
        self.assert_refuses(lambda: fixture.engine.verify_active(), "identity is not exactly")

    def test_rollback_roll_forward_and_invalid_previous_no_mutation(self) -> None:
        first = self.fixture.artifact(self.temp, "rollback-one")
        second = self.fixture.artifact(self.temp, "rollback-two")
        one = self.fixture.engine.install(first)
        two = self.fixture.engine.install(second)
        rolled = self.fixture.engine.rollback()
        self.assertEqual(rolled["generation"], one["generation"])
        self.assertEqual(os.readlink(self.fixture.spec.data_root / "previous"), f"generations/{two['generation']}")
        forward = self.fixture.engine.rollback()
        self.assertEqual(forward["generation"], two["generation"])
        current_before = os.readlink(self.fixture.spec.data_root / "current")
        previous = self.fixture.spec.data_root / "previous"
        previous_before = os.readlink(previous)
        previous.unlink()
        previous.symlink_to("../escape")
        self.assert_refuses(lambda: self.fixture.engine.rollback())
        self.assertEqual(os.readlink(self.fixture.spec.data_root / "current"), current_before)
        self.assertEqual(os.readlink(previous), "../escape")
        previous.unlink()
        self.assert_refuses(lambda: self.fixture.engine.rollback(), "missing")
        self.assertEqual(os.readlink(self.fixture.spec.data_root / "current"), current_before)
        self.assertNotEqual(previous_before, "")

    def test_deterministic_build_workspace_reuse_cleanup_and_unrelated_path_refusal(self) -> None:
        cache = self.fixture.spec.cache_root
        cache.mkdir(mode=0o700)
        expected = cache.resolve() / runtime.BUILD_WORKSPACE_NAME
        observed: list[Path] = []
        with runtime._exclusive_lock(cache):
            expected.mkdir(mode=0o700)
            (expected / "interrupted-build-residue").write_text("stale", encoding="utf-8")
            with runtime._deterministic_build_workspace(cache) as workspace:
                observed.append(workspace)
                self.assertEqual(workspace, expected)
                self.assertFalse((workspace / "interrupted-build-residue").exists())
                (workspace / "first-build").write_text("temporary", encoding="utf-8")
            self.assertFalse(os.path.lexists(expected))
            with runtime._deterministic_build_workspace(cache) as workspace:
                observed.append(workspace)
                (workspace / "second-build").write_text("temporary", encoding="utf-8")
            self.assertFalse(os.path.lexists(expected))
        self.assertEqual(observed, [expected, expected])

        expected.mkdir(mode=0o700)
        expected.chmod(0o770)
        with runtime._exclusive_lock(cache):
            self.assert_refuses(
                lambda: runtime._deterministic_build_workspace(cache).__enter__(),
                "group/world-writable",
            )
        self.assertTrue(expected.is_dir())
        expected.chmod(0o700)
        expected.rmdir()

        unrelated = self.temp / "unrelated"
        unrelated.mkdir()
        sentinel = unrelated / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")
        expected.symlink_to(unrelated, target_is_directory=True)
        with runtime._exclusive_lock(cache):
            self.assert_refuses(
                lambda: runtime._deterministic_build_workspace(cache).__enter__(),
                "not a real directory",
            )
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")
        expected.unlink()

        with runtime._exclusive_lock(cache):
            with self.assertRaises(runtime.RuntimeFailure):
                with runtime._deterministic_build_workspace(cache) as workspace:
                    shutil.rmtree(workspace)
                    workspace.symlink_to(unrelated, target_is_directory=True)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")
        expected.unlink()

        self.assert_refuses(
            lambda: self.fixture.engine.build(expected / "must-not-survive.tar.gz"),
            "may not be inside",
        )

    def test_build_uses_stable_workspace_path_and_cleans(self) -> None:
        engine = self.fixture.engine
        cache = self.fixture.spec.cache_root
        expected = cache.resolve() / runtime.BUILD_WORKSPACE_NAME
        allocations: list[Path] = []

        def extract_source(_archive: Path, parent: Path) -> Path:
            allocations.append(parent)
            return parent / "source"

        with (
            mock.patch.object(engine, "_check_platform"),
            mock.patch.object(engine, "_require_build_cache"),
            mock.patch.object(engine, "_extract_source", side_effect=extract_source),
            mock.patch.object(engine, "_apply_patch"),
            mock.patch.object(
                engine,
                "_extract_toolchain",
                side_effect=lambda parent: (parent / "node", parent / "npm", parent / "bun"),
            ),
            mock.patch.object(engine, "_offline_environment", return_value={}),
            mock.patch.object(engine, "_run_build_commands", return_value=self.temp / "bundle"),
            mock.patch.object(engine, "create_artifact", return_value={"valid": True}),
            mock.patch.object(runtime.shutil, "copytree"),
        ):
            self.assertEqual(engine.build(self.temp / "mock-one.tar.gz"), {"valid": True})
            self.assertFalse(os.path.lexists(expected))
            self.assertEqual(engine.build(self.temp / "mock-two.tar.gz"), {"valid": True})
            self.assertFalse(os.path.lexists(expected))
        self.assertEqual(allocations, [expected, expected])

    def test_install_and_rollback_lock_serialization(self) -> None:
        parent = self.temp / "serialized-state"
        intervals: list[tuple[str, float, float]] = []
        intervals_lock = threading.Lock()
        first_entered = threading.Event()

        def operation(name: str, wait_for_first: bool) -> None:
            if wait_for_first:
                first_entered.wait()
            started = time.monotonic()
            with runtime._exclusive_lock(parent):
                entered = time.monotonic()
                if name == "install":
                    first_entered.set()
                    time.sleep(0.15)
                left = time.monotonic()
            with intervals_lock:
                intervals.append((name, entered, left))
            self.assertGreaterEqual(entered, started)

        install = threading.Thread(target=operation, args=("install", False))
        rollback = threading.Thread(target=operation, args=("rollback", True))
        install.start()
        rollback.start()
        install.join()
        rollback.join()
        observed = {name: (entered, left) for name, entered, left in intervals}
        self.assertGreaterEqual(observed["rollback"][0], observed["install"][1])

    def test_path_wrapper_prefers_verified_runtime_and_never_runs_stock(self) -> None:
        cache_home = self.temp / "production-cache-home"
        data_home = self.temp / "production-data-home"
        production = runtime.RuntimeSpec.production()
        production = runtime.dataclasses.replace(
            production,
            cache_root=cache_home / "qq" / "pi-runtime",
            data_root=data_home / "qq" / "pi-runtime",
        )
        engine = runtime.RuntimeEngine(production)
        bundle = self.temp / "production-bundle"
        bundle.mkdir()
        binary = bundle / "pi"
        binary.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            f"if [ \"${{1:-}}\" = --version ]; then echo '{IDENTITY}'; exit 0; fi\n"
            "printf '%s\\0' \"$@\" >>\"$QQ_TEST_PI_LOG\"\n",
            encoding="utf-8",
        )
        binary.chmod(0o755)
        artifact = self.temp / "production-artifact.tar.gz"
        engine.create_artifact(bundle, artifact)
        engine.install(artifact)
        home = self.temp / "launch-home"
        fake_bin = self.temp / "stock-bin"
        home.mkdir()
        fake_bin.mkdir()
        stock_counter = self.temp / "stock-counter"
        stock = fake_bin / "pi"
        stock.write_text(f"#!/usr/bin/env bash\necho stock >>'{stock_counter}'\n", encoding="utf-8")
        stock.chmod(0o755)
        environment = {
            "HOME": str(home),
            "XDG_CACHE_HOME": str(cache_home),
            "XDG_DATA_HOME": str(data_home),
            "QQ_HOME": str(ROOT),
            "PATH": f"{fake_bin}:/usr/bin:/bin",
        }
        command = (
            f"source '{ROOT / 'cockpit/shell/file-navigation.bash'}'; "
            "command -v pi; pi --version"
        )
        result = runtime.subprocess.run(
            ["/usr/bin/bash", "-c", command],
            env=environment,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(result.stdout.splitlines(), [str(ROOT / "bin/pi"), IDENTITY])
        self.assertFalse(stock_counter.exists())

        # Delegated children must use the adapter worktree's exact wrapper even
        # when both PATH and QQ_PI_BIN select stock Pi.
        launcher_tmp = self.temp / "launcher-tmp"
        session_root = launcher_tmp / "pi-subagent-sessions"
        runtime_root = launcher_tmp / "dispatch-runtime"
        session_root.mkdir(parents=True, mode=0o700)
        config = home / ".pi/agent/extensions/subagent/config.json"
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({"defaultSessionDir": str(session_root)}), encoding="utf-8")
        delegated_log = self.temp / "delegated-pi-args"
        node_binary = shutil.which("node")
        self.assertIsNotNone(node_binary)
        delegated_environment = {
            **environment,
            "PATH": f"{fake_bin}:{ROOT / 'bin'}:/usr/bin:/bin",
            "QQ_NODE_BIN": node_binary,
            "QQ_PI_BIN": str(stock),
            "TMPDIR": str(launcher_tmp),
            "QQ_DISPATCH_RUNTIME_ROOT": str(runtime_root),
            "QQ_DISPATCH_TIMEOUT": "5s",
            "PI_SUBAGENT_TRUSTED_AGENT_PATHS": json.dumps({
                role: str(ROOT / "delegation/manifests/agents" / f"{role}.md")
                for role in ("implementer", "observer", "researcher", "reviewer")
            }),
            "PI_SUBAGENT_CHILD_AGENT": "reviewer",
            "PI_SUBAGENT_RUN_ID": "runtime-path-test",
            "PI_SUBAGENT_CHILD_INDEX": "0",
            "QQ_TEST_PI_LOG": str(delegated_log),
            "XDG_STATE_HOME": str(self.temp / "state"),
        }
        direct_arguments = runtime.subprocess.run(
            [str(ROOT / "bin/pi"), "--approve", "--offline", "--json"],
            cwd=ROOT,
            env=delegated_environment,
            text=True,
            capture_output=True,
        )
        self.assertEqual(direct_arguments.returncode, 0, direct_arguments.stderr)
        delegated_log.unlink(missing_ok=True)
        delegated = runtime.subprocess.run(
            [str(ROOT / "bin/qq-dispatch"), "--json"],
            cwd=ROOT,
            env=delegated_environment,
            text=True,
            capture_output=True,
        )
        self.assertEqual(
            delegated.returncode,
            0,
            f"stderr={delegated.stderr!r} stdout={delegated.stdout!r} "
            f"log={delegated_log.read_bytes() if delegated_log.exists() else None!r} "
            f"stock={stock_counter.read_text() if stock_counter.exists() else None!r}",
        )
        delegated_args = delegated_log.read_bytes().split(b"\0")
        self.assertIn(b"--approve", delegated_args)
        self.assertIn(b"--offline", delegated_args)
        self.assertFalse(stock_counter.exists())

        current = production.data_root / "current"
        current_target = os.readlink(current)
        current.unlink()
        refused = runtime.subprocess.run(
            ["/usr/bin/bash", "-c", command],
            env=environment,
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("refusing", refused.stderr)
        self.assertFalse(stock_counter.exists())
        current.symlink_to(current_target)
        active_binary = production.data_root / current_target / "bundle" / "pi"
        with active_binary.open("a", encoding="utf-8") as output:
            output.write("# corrupt\n")
        corrupt = runtime.subprocess.run(
            ["/usr/bin/bash", "-c", command],
            env=environment,
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(corrupt.returncode, 0)
        self.assertIn("refusing", corrupt.stderr)
        self.assertFalse(stock_counter.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
