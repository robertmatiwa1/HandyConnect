#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
OUTPUT_NAME="handyconnect-files"
ARCHIVE_PATH="${ROOT_DIR}/${OUTPUT_NAME}.tar.gz"
BASE64_TEXT_PATH="${ARCHIVE_PATH}.base64.txt"

cd "${ROOT_DIR}"

rm -f "${ARCHIVE_PATH}" "${BASE64_TEXT_PATH}"

TEMP_ARCHIVE="$(mktemp "${OUTPUT_NAME}.XXXXXXXX.tar.gz")"

tar -czf "${TEMP_ARCHIVE}" \
  package.json \
  tsconfig.json \
  next.config.js \
  next-env.d.ts \
  .eslintrc.json \
  middleware.ts \
  components \
  lib \
  pages \
  styles

base64 "${TEMP_ARCHIVE}" > "${BASE64_TEXT_PATH}"

if [[ "${KEEP_BINARY_ARCHIVE:-false}" == "true" ]]; then
  mv "${TEMP_ARCHIVE}" "${ARCHIVE_PATH}"
else
  rm -f "${TEMP_ARCHIVE}"
fi

cat <<ARCHIVE_MESSAGE
Created text-safe archive payload: ${BASE64_TEXT_PATH}

To reconstruct the binary tarball locally, run:

  base64 -d ${OUTPUT_NAME}.tar.gz.base64.txt > ${OUTPUT_NAME}.tar.gz

Set KEEP_BINARY_ARCHIVE=true when invoking the script if you would also like the binary tarball
to remain alongside the Base64 text file.
ARCHIVE_MESSAGE
