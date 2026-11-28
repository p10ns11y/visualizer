#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' 'usage: scripts/sync-sources.sh <lib>' >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

lib="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
sources_root="${repo_root}/packages/sources"
pins="${sources_root}/PINS.tsv"
dest="${sources_root}/${lib}"

case "${dest}" in
  "${sources_root}/"*) ;;
  *)
    printf '%s\n' 'refusing to write outside packages/sources' >&2
    exit 1
    ;;
esac

if [[ ! -f "${pins}" ]]; then
  printf '%s\n' 'missing packages/sources/PINS.tsv' >&2
  exit 1
fi

url=''
sha=''
sub=''
while IFS="$(printf '\t')" read -r col_lib col_url col_sha col_sub _; do
  if [[ "${col_lib}" == 'lib' || -z "${col_lib}" ]]; then
    continue
  fi
  if [[ "${col_lib}" == "${lib}" ]]; then
    url="${col_url}"
    sha="${col_sha}"
    sub="${col_sub}"
  fi
done <"${pins}"

if [[ -z "${url}" || -z "${sha}" ]]; then
  printf '%s\n' "unknown lib: ${lib}" >&2
  exit 1
fi

case "${sha}" in
  *[!0-9a-f]*)
    printf '%s\n' 'pin sha is not hex' >&2
    exit 1
    ;;
esac

if [[ "${#sha}" -ne 40 ]]; then
  printf '%s\n' 'pin sha is not 40 hex digits' >&2
  exit 1
fi

work="$(mktemp -d)"
cleanup() {
  rm -rf "${work}"
}
trap cleanup EXIT

git init -q -b main "${work}/src"
git -C "${work}/src" remote add origin "${url}"
git -C "${work}/src" fetch --depth 1 origin "${sha}"
git -C "${work}/src" checkout --detach --quiet FETCH_HEAD
head_commit="$(git -C "${work}/src" rev-parse HEAD)"
if [[ "${head_commit}" != "${sha}" ]]; then
  printf '%s\n' 'fetched commit does not match the pin' >&2
  exit 1
fi

stage="${work}/stage"
mkdir -p "${stage}"
if [[ -z "${sub}" || "${sub}" == '.' ]]; then
  git -C "${work}/src" archive --format=tar HEAD | tar -x -C "${stage}"
else
  git -C "${work}/src" archive --format=tar "HEAD:${sub}" | tar -x -C "${stage}"
  for name in LICENSE LICENSE.md LICENSE.txt NOTICE NOTICE.md NOTICE.txt COPYING COPYING.md; do
    if [[ -f "${work}/src/${name}" && ! -e "${stage}/${name}" ]]; then
      cp -p "${work}/src/${name}" "${stage}/${name}"
    fi
  done
fi

while IFS= read -r -d '' dir; do
  rm -rf "${dir}"
done < <(find "${stage}" -depth \( -type d -o -type l \) \( -name node_modules -o -name dist -o -name build -o -name target -o -name .next -o -name coverage -o -name .turbo -o -name .cache -o -name .git \) -print0)

has_nul() {
  local file="$1"
  local dump
  dump="$(od -An -tx1 "${file}")"
  grep -Eq '(^|[[:space:]])00([[:space:]]|$)' <<<"${dump}"
}

while IFS= read -r -d '' file; do
  base="${file##*/}"
  case "${base}" in
    .env | .env.* | *.pem | *.key | id_rsa | id_rsa.* | id_ed25519 | id_ed25519.* | *.p12 | *.pfx | credentials.json | secrets.json | .netrc | *.kdbx)
      rm -f "${file}"
      continue
      ;;
  esac
  if has_nul "${file}"; then
    rm -f "${file}"
  fi
done < <(find "${stage}" -type f -print0)

normalize_abs() {
  local input="$1"
  local -a parts=()
  local part rest
  rest="${input#/}"
  while [[ -n "${rest}" ]]; do
    part="${rest%%/*}"
    if [[ "${rest}" == */* ]]; then
      rest="${rest#*/}"
    else
      rest=''
    fi
    case "${part}" in
      '' | .) ;;
      ..)
        if ((${#parts[@]} > 0)); then
          parts=("${parts[@]:0:${#parts[@]}-1}")
        fi
        ;;
      *) parts+=("${part}") ;;
    esac
  done
  local out='' p
  for p in ${parts[@]+"${parts[@]}"}; do
    out+="/${p}"
  done
  if [[ -z "${out}" ]]; then
    out='/'
  fi
  printf '%s\n' "${out}"
}

under_sources() {
  local path="$1"
  [[ "${path}" == "${sources_root}" || "${path}" == "${sources_root}/"* ]]
}

relative_to() {
  local from="$1"
  local to="$2"
  local -a from_parts=() to_parts=()
  local part rest i j rel
  rest="${from#/}"
  while [[ -n "${rest}" ]]; do
    part="${rest%%/*}"
    if [[ "${rest}" == */* ]]; then
      rest="${rest#*/}"
    else
      rest=''
    fi
    [[ -n "${part}" ]] && from_parts+=("${part}")
  done
  rest="${to#/}"
  while [[ -n "${rest}" ]]; do
    part="${rest%%/*}"
    if [[ "${rest}" == */* ]]; then
      rest="${rest#*/}"
    else
      rest=''
    fi
    [[ -n "${part}" ]] && to_parts+=("${part}")
  done
  i=0
  while ((i < ${#from_parts[@]} && i < ${#to_parts[@]})) && [[ "${from_parts[i]}" == "${to_parts[i]}" ]]; do
    i=$((i + 1))
  done
  rel=''
  for ((j = i; j < ${#from_parts[@]}; j++)); do
    rel+='../'
  done
  for ((j = i; j < ${#to_parts[@]}; j++)); do
    rel+="${to_parts[j]}"
    if ((j + 1 < ${#to_parts[@]})); then
      rel+='/'
    fi
  done
  if [[ -z "${rel}" ]]; then
    rel='.'
  fi
  printf '%s\n' "${rel%/}"
}

plugins_retarget() {
  local raw="$1"
  local -a bits=()
  local part rest idx rest_path
  rest="${raw}"
  while [[ -n "${rest}" ]]; do
    part="${rest%%/*}"
    if [[ "${rest}" == */* ]]; then
      rest="${rest#*/}"
    else
      rest=''
    fi
    bits+=("${part}")
  done
  idx=-1
  local n=0
  for part in ${bits[@]+"${bits[@]}"}; do
    if [[ "${part}" == 'plugins' ]]; then
      idx="${n}"
      break
    fi
    n=$((n + 1))
  done
  if [[ "${idx}" -lt 0 ]]; then
    printf '\n'
    return
  fi
  rest_path=''
  n=0
  for part in ${bits[@]+"${bits[@]}"}; do
    if ((n > idx)); then
      rest_path+="/${part}"
    fi
    n=$((n + 1))
  done
  normalize_abs "${sources_root}/plugins${rest_path}"
}

broken="${work}/broken.tsv"
: >"${broken}"

while IFS= read -r -d '' link; do
  raw="$(readlink "${link}")"
  rel_within="${link#"${stage}/"}"
  final_dir="$(dirname "${dest}/${rel_within}")"
  chosen=''
  if [[ "${raw}" == /* ]]; then
    lexical="$(normalize_abs "${raw}")"
  else
    lexical="$(normalize_abs "${final_dir}/${raw}")"
  fi
  mapped="$(plugins_retarget "${raw}")"
  if under_sources "${lexical}" && [[ -e "${lexical}" || -L "${lexical}" ]]; then
    chosen="${lexical}"
  elif [[ -n "${mapped}" ]] && under_sources "${mapped}" && { [[ -e "${mapped}" || -L "${mapped}" ]] || ! under_sources "${lexical}" || [[ ! -e "${lexical}" && ! -L "${lexical}" ]]; }; then
    if under_sources "${mapped}"; then
      chosen="${mapped}"
    fi
  elif under_sources "${lexical}"; then
    chosen="${lexical}"
  fi
  if [[ -n "${chosen}" ]]; then
    rel="$(relative_to "${final_dir}" "${chosen}")"
    ln -sfn "${rel}" "${link}"
  else
    rel_link="${link#"${stage}/"}"
    printf '%s\t%s\t%s\n' "${lib}" "${rel_link}" "${raw}" >>"${broken}"
    rm -f "${link}"
  fi
done < <(find "${stage}" -type l -print0)

record="${sources_root}/SYMLINKS.tsv"
kept="${work}/kept.tsv"
: >"${kept}"
if [[ -f "${record}" ]]; then
  while IFS="$(printf '\t')" read -r row_lib row_path row_target; do
    if [[ "${row_lib}" == 'lib' || -z "${row_lib}" || "${row_lib}" == "${lib}" ]]; then
      continue
    fi
    printf '%s\t%s\t%s\n' "${row_lib}" "${row_path}" "${row_target}" >>"${kept}"
  done <"${record}"
fi
cat "${broken}" >>"${kept}"
if [[ -s "${kept}" ]]; then
  sort -t "$(printf '\t')" -k1,1 -k2,2 "${kept}" >"${work}/sorted.tsv"
  {
    printf '%s\t%s\t%s\n' 'lib' 'path' 'target'
    cat "${work}/sorted.tsv"
  } >"${record}"
else
  rm -f "${record}"
fi

rm -rf "${dest}"
mkdir -p "${sources_root}"
mv "${stage}" "${dest}"
