#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' 'usage: scripts/fetch-ref.sh <lib>' >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

lib="$1"
url=''
ref=''

case "${lib}" in
  xstate)
    url='https://github.com/statelyai/xstate'
    ref='xstate@6.0.0-beta.5'
    ;;
  adaptate)
    url='https://github.com/p10ns11y/adaptate'
    ref='main'
    ;;
  *)
    usage
    exit 1
    ;;
esac

cache_root="${XDG_CACHE_HOME:-${HOME}/.cache}/visualizer-refs"
dest="${cache_root}/${lib}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
link="${repo_root}/repos/${lib}"

case "${dest}" in
  "${cache_root}"/*) ;;
  *)
    printf '%s\n' 'refusing to use a cache path outside visualizer-refs' >&2
    exit 1
    ;;
esac

case "${link}" in
  "${repo_root}/repos/"*) ;;
  *)
    printf '%s\n' 'refusing to link outside repos' >&2
    exit 1
    ;;
esac

url_key() {
  local raw="$1"
  raw="${raw%.git}"
  raw="${raw#*://}"
  raw="${raw#*@}"
  printf '%s\n' "${raw}"
}

at_pinned_ref() {
  local remote_url head_commit tag_commit head_ref
  [[ -d "${dest}/.git" ]] || return 1
  remote_url="$(git -C "${dest}" remote get-url origin 2>/dev/null)" || return 1
  [[ "$(url_key "${remote_url}")" == "$(url_key "${url}")" ]] || return 1
  head_commit="$(git -C "${dest}" rev-parse HEAD 2>/dev/null)" || return 1
  if git -C "${dest}" show-ref --verify --quiet "refs/tags/${ref}"; then
    tag_commit="$(git -C "${dest}" rev-parse "refs/tags/${ref}^{}" 2>/dev/null)" || return 1
    [[ "${head_commit}" == "${tag_commit}" ]]
    return
  fi
  head_ref="$(git -C "${dest}" symbolic-ref --quiet HEAD 2>/dev/null || true)"
  if [[ "${head_ref}" == "refs/heads/${ref}" ]]; then
    return 0
  fi
  git -C "${dest}" tag --points-at HEAD | grep -Fxq "${ref}"
}

link_ready() {
  [[ -L "${link}" ]] || return 1
  [[ "$(readlink "${link}")" == "${dest}" ]]
}

mkdir -p "${cache_root}" "${repo_root}/repos"

if ! at_pinned_ref; then
  rm -rf "${dest}"
  git clone --depth 1 --branch "${ref}" "${url}" "${dest}"
fi

if ! link_ready; then
  if [[ -e "${link}" || -L "${link}" ]]; then
    rm -rf "${link}"
  fi
  ln -s "${dest}" "${link}"
fi
