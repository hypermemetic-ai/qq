#!/usr/bin/env bash
# Resolve qq's configurable external tools consistently for Bash and Python
# callers. Source this file and call qq_resolve_bin, or execute it with one
# tool name to receive a NUL-delimited path and PATH-prepend record.

qq_resolve_bin() {
  if [ "$#" -ne 1 ]; then
    QQ_BIN_ERROR="usage: qq_resolve_bin <tool>"
    return 2
  fi

  local tool="$1"
  local env_name override found directory candidate qq_bin_result
  local fallback_directories=(
    /home/linuxbrew/.linuxbrew/bin
    /opt/homebrew/bin
  )

  QQ_BIN_ERROR=""
  QQ_BIN_PATH_PREPEND=""
  QQ_BIN_RESULT=""

  if [[ ! "$tool" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*$ ]]; then
    QQ_BIN_ERROR="invalid tool name: $tool"
    return 2
  fi

  env_name="QQ_${tool^^}_BIN"
  env_name="${env_name//-/_}"
  override="${!env_name-}"
  if [ -n "$override" ]; then
    if [[ "$override" != /* ]] || [ ! -f "$override" ] || [ ! -x "$override" ]; then
      QQ_BIN_ERROR="$env_name must be an absolute executable file"
      return 1
    fi
    qq_bin_result="$override"
  else
    found="$(command -v -- "$tool" 2>/dev/null || true)"
    if [ -n "$found" ] && [ -f "$found" ] && [ -x "$found" ]; then
      qq_bin_result="$found"
    else
      qq_bin_result=""
      for directory in "${fallback_directories[@]}"; do
        candidate="$directory/$tool"
        if [ -f "$candidate" ] && [ -x "$candidate" ]; then
          qq_bin_result="$candidate"
          QQ_BIN_PATH_PREPEND="$directory"
          case ":${PATH:-}:" in
            *":$directory:"*) ;;
            *)
              PATH="$directory${PATH:+:$PATH}"
              export PATH
              ;;
          esac
          break
        fi
      done
    fi
  fi

  if [ -z "$qq_bin_result" ]; then
    QQ_BIN_ERROR="$tool not found; set $env_name to its absolute path"
    return 1
  fi
  QQ_BIN_RESULT="$qq_bin_result"
}

qq_bin_main() {
  if [ "$#" -ne 1 ]; then
    printf 'qq-bin: usage: qq-bin <tool>\n' >&2
    return 2
  fi
  if ! qq_resolve_bin "$1"; then
    printf 'qq-bin: %s\n' "$QQ_BIN_ERROR" >&2
    return 1
  fi
  printf '%s\0%s\0' "$QQ_BIN_RESULT" "$QQ_BIN_PATH_PREPEND"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  qq_bin_main "$@"
fi
