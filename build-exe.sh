#!/usr/bin/env bash
# 배포용 말랑면접.exe와 배포 묶음(zip) 만들기 (Go 1.24+ 필요)
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(tr -d '[:space:]' < VERSION)"

# 버전이 한 곳이라도 다르면 멈춘다
grep -q "MALANG_VERSION = '$VERSION'" js/version.js || { echo "js/version.js 버전이 $VERSION 이 아님"; exit 1; }
grep -q "\"version\": \"$VERSION\"" package.json || { echo "package.json 버전이 $VERSION 이 아님"; exit 1; }

# 배포 전에 테스트부터
npm test --silent > /dev/null || { echo "테스트 실패: npm test 로 확인하세요"; exit 1; }

# 아이콘·버전 정보 (winres/winres.json의 버전 칸을 VERSION으로 채움)
command -v go-winres >/dev/null || [ -x "$(go env GOPATH)/bin/go-winres" ] || go install github.com/tc-hib/go-winres@latest
python3 - "$VERSION" <<'PY'
import json, sys
v = sys.argv[1]; four = v + '.0' * (3 - v.count('.'))
p = 'winres/winres.json'; d = json.load(open(p, encoding='utf-8'))
d['RT_MANIFEST']['#1']['0409']['identity']['version'] = four
ver = d['RT_VERSION']['#1']['0000']
ver['fixed']['file_version'] = ver['fixed']['product_version'] = four
for info in ver['info'].values():
    info['ProductVersion'] = info['FileVersion'] = v
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
PY
"$(go env GOPATH)/bin/go-winres" make --arch amd64

# -H windowsgui: 검은 콘솔 창 없이 실행
mkdir -p dist
GOOS=windows GOARCH=amd64 go build -trimpath \
  -ldflags "-s -w -H windowsgui -X main.version=v$VERSION" \
  -o "dist/말랑면접.exe" .

# 배포 묶음: exe + 사용법 + 글꼴 라이선스
PKG="dist/말랑면접_v$VERSION"
rm -rf "$PKG" "$PKG.zip"
mkdir -p "$PKG/라이선스"
cp "dist/말랑면접.exe" "$PKG/"
cp 배포/사용법.txt "$PKG/"
cp fonts/LICENSE-*.txt "$PKG/라이선스/"
(cd dist && python3 -c "
import os, sys, zipfile
root = sys.argv[1]
with zipfile.ZipFile(root + '.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, fs in os.walk(root):
        for f in sorted(fs):
            z.write(os.path.join(d, f))
" "말랑면접_v$VERSION")
echo "완료: dist/말랑면접.exe, $PKG.zip"
