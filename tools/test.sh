#!/usr/bin/env bash
# The merge-gating Check loop, named once: ci.yml runs this script, and work
# orders cite it verbatim as their exact Check.
set -euo pipefail

for test_script in tests/test-*.sh; do
  bash "$test_script"
done
