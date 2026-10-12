#!/usr/bin/env bash
# Windows용 말랑면접.exe 만들기 (Go 1.24+ 필요)
set -euo pipefail
cd "$(dirname "$0")"
command -v go-winres >/dev/null || go install github.com/tc-hib/go-winres@latest
"$(go env GOPATH)/bin/go-winres" make --arch amd64   # 아이콘·버전 정보 (winres/)
mkdir -p dist
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "dist/말랑면접.exe" .
echo "완료: dist/말랑면접.exe"
