# Machine portability

Qq owns the reproducible workstation definition; private mutable state stays
outside Git. `migration-manifest.json` is the reviewed boundary between them.
It names every exact-transfer root, the session trees whose files are hashed,
the credential-bearing roots, the config links, and the narrow rsync excludes.

The destination account must be named `qqp`, with home `/home/qqp`. Git linked
worktrees, Pi transcripts, Codex transcripts, and Herdr agent metadata contain
absolute paths. Keeping the path identical turns those references back into
working references instead of trying to rewrite private histories.

## What is versioned

- `cockpit/pi/` contains the non-secret Pi settings, keybindings, sandbox, and
  trust policy. Pi auth and all transcripts remain in the private `.pi` root.
- `cockpit/codex/config.toml` contains the portable non-secret Codex policy.
  Codex auth, sessions, archives, history, SQLite state, goals, memories, and
  logs remain in the private `.codex` root.
- `cockpit/herdr/config.toml` and the existing terminal/shell files define the
  operator surface.
- `Brewfile` and `npm-globals.txt` record the current operator tool set.
- `apt-packages.txt` records the non-base Mint workbench packages, and
  `pipx-packages.txt` pins the two isolated Python tools (including the exact
  Spec Kit commit).
- `migration-manifest.json` is the exact private-transfer inventory. It contains
  paths and classifications, never credential or transcript contents.

Preview config ownership, then install the links after the exact transfer. An
existing file or foreign symlink is moved to a timestamped sibling backup before
the reviewed file is linked; nothing is silently discarded.

```bash
cd /home/qqp/projects/qq
bin/qq-machine-migrate install-config
bin/qq-machine-migrate install-config --apply
```

## Two-pass state transfer

Captures are private mode-700 directories below
`${XDG_STATE_HOME:-$HOME/.local/state}/qq/migration`. Their files are mode 600.
They contain a Herdr snapshot, a normalized open-cockpit plan, exact Git branch
and dirty-worktree state, session-file hashes, tool versions, and a self-hash
file. They are included in the transfer through `.local/state/qq`, but never in
Git.

First capture the live cockpit and make a warm copy while work continues:

```bash
cd /home/qqp/projects/qq
warm="$(bin/qq-machine-migrate capture)"
bin/qq-machine-migrate sync "$warm" qqp@THINKCENTRE --phase warm --dry-run
bin/qq-machine-migrate sync "$warm" qqp@THINKCENTRE --phase warm
```

The sync uses SSH plus archive/hard-link/ACL/xattr-preserving rsync, retains
relative paths, and does not use `--delete`. It transfers primary repositories,
all linked worktrees and their uncommitted files, local-only branches, ignored
project assets/caches, the external Backlog store, Pi/Codex/Herdr state, browser
profiles, project notes, and explicitly inventoried credentials. The target's
`.ssh/authorized_keys` is excluded so the migration cannot remove its access
path.

The final pass must run from a plain terminal after every agent has finished
writing. This cannot be done from one of the sessions being preserved.

```bash
herdr server stop
cd /home/qqp/projects/qq
final="$(bin/qq-machine-migrate capture --topology-from "$warm")"
bin/qq-machine-migrate sync "$final" qqp@THINKCENTRE --phase final
```

`--topology-from` is accepted only when the Herdr server is stopped. It reuses
the last live topology while re-reading Git state and re-hashing every Pi and
Codex transcript after shutdown. A live capture is deliberately rejected by
`--phase final`.

## Target bootstrap and resume

During Mint installation, create the `qqp` account. After first boot, enable the
LAN transfer path and copy this machine's SSH public key to it:

```bash
sudo apt update
sudo apt install openssh-server rsync git curl
sudo systemctl enable --now ssh
# Run from the old machine after confirming the target address:
ssh-copy-id qqp@THINKCENTRE
```

After the two rsync passes, install the versioned tool declarations and cockpit
links on the target. Install Homebrew for Linux from its official installer
first; its prefix remains `/home/linuxbrew/.linuxbrew`. Review package output
before accepting version changes. Ghostty came from an external apt package and
is intentionally a separate GUI install; any terminal can host Herdr meanwhile.

```bash
cd /home/qqp/projects/qq
sudo apt install $(< machine/apt-packages.txt)
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv bash)"
brew bundle --file machine/Brewfile
xargs --no-run-if-empty npm install --global < machine/npm-globals.txt
xargs --no-run-if-empty --max-args=1 pipx install < machine/pipx-packages.txt
bin/qq-machine-migrate install-config --apply
bin/qq-pi-runtime verify
final=/home/qqp/.local/state/qq/migration/CAPTURE_PRINTED_BY_FINAL_STEP
bin/qq-machine-migrate verify "$final"
```

Start a fresh, empty Herdr server, preview the reconstruction, and then apply it:

```bash
bin/qq-machine-migrate restore-layout "$final"
bin/qq-machine-migrate restore-layout "$final" --apply
bin/qq-machine-migrate verify "$final" --live
```

The captured cockpit currently means five tabs in `qq`, three in `deciq`, and
two in `~`. Pi tabs are started with their exact session paths; Codex tabs are
started with `codex resume <session-id>`; board and shell tabs are reconstructed;
labels, active tabs, and final focus are restored. Process memory and terminal
scrollback are not portable, but the durable conversations and semantic working
state are.

## Mint over the LAN

The staged image is Linux Mint 22.3 Cinnamon at
`~/Downloads/linuxmint-22.3-cinnamon-64bit.iso`. Its checksum file has a valid
signature from fingerprint
`27DE B156 44C6 B3CF 3BD7 D291 300F 846B A25B AE09`, and its verified SHA-256 is:

```text
a081ab202cfda17f6924128dbd2de8b63518ac0531bcfe3f1a1b88097c459bd4
```

The implemented primary boot chain is:

```text
ThinkCentre UEFI network boot
  -> dnsmasq proxyDHCP + TFTP on the old machine
  -> Microsoft-signed shim + Canonical-signed network GRUB
  -> Mint kernel/initrd and ISO over local HTTP
  -> interactive Mint installer on the ThinkCentre
```

ProxyDHCP leaves the router as the LAN's address authority. Signed shim/GRUB is
the first path so Secure Boot can remain enabled; the installed iPXE payload is
an unsigned diagnostic fallback. GRUB loads Mint casper with
`boot=casper ip=dhcp iso-url=http://SOURCE/...iso`. The regular 22.3 image is the
first choice; the HWE image is a fallback only if it cannot boot the hardware.

`bin/qq-mint-pxe` owns the complete one-time service lifecycle. `stage` verifies
the entire ISO again, verifies both EFI signatures, extracts the ISO kernel and
initrd, and syntax-checks a non-authoritative dnsmasq configuration. `start`
adds narrowly scoped, tagged UFW rules and starts transient HTTP and proxy-DHCP
services. `stop` removes the services and every tagged firewall rule.

```bash
bin/qq-mint-pxe stage
bin/qq-mint-pxe start
bin/qq-mint-pxe status
# Keep it running through installation, then:
bin/qq-mint-pxe stop
```

The Windows OOBE/Microsoft-account flow never needs to complete. Power the
ThinkCentre off, start it while tapping Lenovo's one-time boot-menu key (usually
F12), and select its UEFI IPv4/PXE Ethernet entry.

Before touching the target disk, these must be known:

1. the booted live environment is visibly the ThinkCentre, not the old laptop;
2. the operator's explicit disk disposition is recorded;
3. the old laptop remains intact as the complete rollback source.

The operator authorized erasing Windows and using the full ThinkCentre disk on
2026-08-01. The graphical installer remains interactive, so the physical disk
selection is still visible before it commits. No unattended partitioning is
part of this procedure. Exact model/firmware inspection is needed only if the
generic signed UEFI path does not appear or does not boot.

Primary references: the [Mint 22.3 download page](https://linuxmint.com/download.php),
[Cinnamon edition page](https://linuxmint.com/edition.php?id=326),
[HWE guidance](https://linuxmint.com/hwe.php),
[ISO verification guide](https://linuxmint-installation-guide.readthedocs.io/en/latest/verify.html),
[installation guide](https://linuxmint-installation-guide.readthedocs.io/en/latest/install.html),
and [iPXE UEFI chainloading guide](https://ipxe.org/howto/chainloading).
