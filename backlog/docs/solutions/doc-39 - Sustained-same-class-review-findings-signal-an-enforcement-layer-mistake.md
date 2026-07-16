---
id: doc-39
title: Sustained same-class review findings signal an enforcement-layer mistake
type: guide
created_date: '2026-07-14 17:02'
updated_date: '2026-07-14 17:04'
tags:
  - solution
  - review
  - design
  - enforcement
---
# Sustained same-class review findings signal an enforcement-layer mistake

## Symptom

Ten adversarial fresh-context review rounds on the merge-guard Change each
produced new blocking findings of one class: divergences between the guard's
Python approximation of bash lexing and bash itself — wrapper unwrapping, GNU
time operands, fd-redirect adjacency, ampersand redirections, option-value
interleaving, reserved-word arithmetic, backslash-newline splicing, spliced
heredoc delimiters, expanding-body splicing. The per-round finding count
(6 → 2 → 1 → 1 → 1 → 2) reached zero only in the tenth round.

## Root cause

The guard enforces "only the operator merges" on the raw command string,
before the shell collapses its ambiguity. At that layer the correctness
specification is "reproduce bash's lexer", which is effectively unbounded, so
every fixed finding exposes an adjacent one. The finding rate measured a
design property of the chosen enforcement layer, not implementation
sloppiness — the reviewer and the fixes were both sound.

## Resolution

Treat sustained same-class findings across review rounds as a design smell:
stop patching and question the layer before buying the next fix. Enforce an
invariant where its ambiguity has already collapsed — at exec time where argv
is resolved, or at the resource that owns the invariant (branch protection,
credential separation). Keep a string-level guard only as a drift-net: a
declared threat model, out-of-scope finding classes owner-declined by
default, and no ambition to be a security boundary. The doctrine ancestor is
the error-prone-module rule (McConnell / Capers Jones): past a defect-density
threshold, redesign beats patching.

## Verification

T-32 / PR #79 delivery history: review rounds four through ten, every
bypass confirmed by controlled bash execution before fixing and every fix
re-verified by a fresh delta review, ending in SHIP with no surviving
findings. A cited field survey (2026-07-14, three delegated investigations)
found no shipped review tool with any convergence rule and traced the
redesign-over-patching doctrine to the error-prone-module literature.
