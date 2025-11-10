#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "${ROOT_DIR}"

BASE_REF="${1:-}"
BUNDLE_NAME="${2:-handyconnect-pr.bundle}"
PATCH_NAME="${3:-handyconnect-pr.patch}"
BUNDLE_BASE64_NAME="${BUNDLE_NAME}.base64.txt"
PATCH_BASE64_NAME="${PATCH_NAME}.base64.txt"

if [[ -z "${BASE_REF}" ]]; then
  # Default to the first commit when no base is provided.
  BASE_REF="$(git rev-list --max-parents=0 HEAD | tail -n 1)"
fi

if ! git rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
  cat <<ERR >&2
Base reference "${BASE_REF}" could not be resolved. Provide a valid commit, tag, or branch.
Example: npm run prepare-pr -- <base-branch>
ERR
  exit 1
fi

if ! git merge-base --is-ancestor "${BASE_REF}" HEAD; then
  cat <<ERR >&2
The base reference "${BASE_REF}" is not an ancestor of HEAD. Ensure you are targeting the
branch you want to propose changes against.
ERR
  exit 1
fi

if [[ "$(git rev-parse "${BASE_REF}")" == "$(git rev-parse HEAD)" ]]; then
  cat <<ERR
No new commits exist after ${BASE_REF}. Add changes or choose an earlier base to generate PR
artifacts.
ERR
  exit 0
fi

BUNDLE_PATH="${ROOT_DIR}/${BUNDLE_NAME}"
BUNDLE_BASE64_PATH="${ROOT_DIR}/${BUNDLE_BASE64_NAME}"
PATCH_PATH="${ROOT_DIR}/${PATCH_NAME}"
PATCH_BASE64_PATH="${ROOT_DIR}/${PATCH_BASE64_NAME}"

rm -f "${BUNDLE_PATH}" "${BUNDLE_BASE64_PATH}" "${PATCH_PATH}" "${PATCH_BASE64_PATH}"

echo "Preparing PR artifacts from ${BASE_REF}..HEAD"

# Generate a git bundle that includes all commits after the base reference.
TEMP_BUNDLE="$(mktemp "${BUNDLE_NAME}.XXXXXXXX")"
trap 'rm -f "${TEMP_BUNDLE}"' EXIT
git bundle create "${TEMP_BUNDLE}" "${BASE_REF}"..HEAD
base64 "${TEMP_BUNDLE}" > "${BUNDLE_BASE64_PATH}"
if [[ "${KEEP_BINARY_BUNDLE:-false}" == "true" ]]; then
  mv "${TEMP_BUNDLE}" "${BUNDLE_PATH}"
else
  rm -f "${TEMP_BUNDLE}" "${BUNDLE_PATH}"
fi
trap - EXIT

# Produce a patch file that can be applied without git history.
git diff --binary "${BASE_REF}"..HEAD > "${PATCH_PATH}"
base64 "${PATCH_PATH}" > "${PATCH_BASE64_PATH}"

cat <<SUMMARY
Created pull request artifacts:
   Bundle payload: ${BUNDLE_BASE64_PATH}
    Recreate with: base64 -d ${BUNDLE_BASE64_NAME} > ${BUNDLE_NAME}
    (Set KEEP_BINARY_BUNDLE=true to keep the binary bundle alongside the text payload.)
   Patch:  ${PATCH_PATH}
    Base64 copy: ${PATCH_BASE64_PATH}
    Apply with: git apply ${PATCH_NAME}

Both artifacts include Base64-encoded text files so they can be shared through binary-restricted
channels. Decode them locally to restore the original git bundle or patch when needed.
SUMMARY
