#!/usr/bin/env bash
set -u
umask 077

document=${QQ_BRIEF_GATE_DOCUMENT:?QQ_BRIEF_GATE_DOCUMENT is required}
decision=${QQ_BRIEF_GATE_DECISION:?QQ_BRIEF_GATE_DECISION is required}
glow=${QQ_BRIEF_GATE_GLOW:-/home/linuxbrew/.linuxbrew/bin/glow}

if [[ ! -f $document || -L $document ]]; then
  printf 'Delegate gate refused an unsafe ticket-and-note path.\n' >&2
  exit 1
fi
if [[ ! -x $glow ]]; then
  printf 'Brief gate requires Glow 2.1.2 at %s.\n' "$glow" >&2
  exit 1
fi

"$glow" -t "$document" || {
  printf 'Glow could not render the delegate ticket and note.\n' >&2
  exit 1
}

printf '\nDelegate this ticket with this note?  [a] approve   [c] cancel\n'
while true; do
  printf '> '
  IFS= read -r -n 1 choice || exit 1
  printf '\n'
  case $choice in
    a|A) outcome=approved; break ;;
    c|C) outcome=cancelled; break ;;
    *) printf 'Press a to approve or c to cancel.\n' ;;
  esac
done

temporary="${decision}.$$"
printf '%s\n' "$outcome" > "$temporary"
mv -f -- "$temporary" "$decision"
printf 'QQ_BRIEF_GATE_DECIDED\n'

# The delegate closes this plugin-owned pane after reading the decision.
trap 'exit 0' HUP INT TERM
while true; do sleep 3600 & wait $!; done
