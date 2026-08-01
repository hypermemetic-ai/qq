#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-mint-pxe"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
PXE="$(cd "$TESTS_DIR/.." && pwd -P)/bin/qq-mint-pxe"

python3 - "$PXE" <<'PY'
import importlib.machinery
import importlib.util
import ipaddress
import subprocess
import sys
from unittest import mock

path = sys.argv[1]
loader = importlib.machinery.SourceFileLoader("qq_mint_pxe", path)
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

grub = module.grub_config("192.168.40.224")
assert "(http,192.168.40.224:8088)/vmlinuz" in grub
assert "iso-url=http://192.168.40.224:8088/linuxmint.iso" in grub
assert "erase target only in installer" in grub

dnsmasq = module.dnsmasq_config(
    "wlan-test", ipaddress.ip_interface("192.168.40.224/24"), module.Path("/state/tftp")
)
assert "interface=wlan-test" in dnsmasq
assert "port=0" in dnsmasq
assert "dhcp-range=192.168.40.0,proxy,255.255.255.0" in dnsmasq
assert "dhcp-authoritative" not in dnsmasq
assert "x86-64_EFI" in dnsmasq and "BC_EFI" in dnsmasq

route = [{"dev": "wlan-test", "metric": 600}]
addresses = [{"addr_info": [{"family": "inet", "scope": "global", "local": "192.168.40.224", "prefixlen": 24}]}]
with mock.patch.object(module, "read_json_output", side_effect=[route, addresses]):
    interface, address = module.network_identity()
assert interface == "wlan-test"
assert str(address) == "192.168.40.224/24"

calls = []
status = """Status: active
[ 9] 67/udp on wlan-test ALLOW IN 192.168.40.0/24 # qq-mint-pxe
[12] 8088/tcp on wlan-test ALLOW IN 192.168.40.0/24 # qq-mint-pxe
"""
def fake_run(argv, **kwargs):
    calls.append(argv)
    return subprocess.CompletedProcess(argv, 0, status if argv[-2:] == ["status", "numbered"] else "", "")

with mock.patch.object(module, "run", side_effect=fake_run):
    module.remove_firewall_rules()
assert calls[-2][-1] == "12"
assert calls[-1][-1] == "9"
PY

printf '%s: pass\n' "$TEST_NAME"
