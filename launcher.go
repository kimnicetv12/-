// 말랑 면접 실행기 (Windows용 exe)
//
// 화면 파일과 글꼴을 exe 안에 담아 두고, 내 컴퓨터 안에서만 접속되는 작은 웹 서버를 띄운 뒤
// 크롬(없으면 엣지)을 앱 창으로 연다. 창을 닫으면 잠시 후 실행기도 스스로 꺼진다.
// 배포용 빌드는 검은 콘솔 창 없이 돌고, 문제가 생기면 알림 창으로 알린다(launcher_windows.go).
//
// 빌드: ./build-exe.sh  →  dist/말랑면접.exe
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

//go:embed index.html style.css js/*.js fonts
var webFiles embed.FS

// 빌드할 때 -ldflags "-X main.version=..." 으로 넣는다
var version = "dev"

// 포트를 고정해야 브라우저가 마이크 권한·연습 기록·저장한 키를 기억한다.
const port = 47615

const pingPath = "/__malang/ping"

var (
	mu       sync.Mutex
	lastPing time.Time
)

func main() {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	url := fmt.Sprintf("http://%s/?launcher=1", addr)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// 이미 실행 중이면 창만 하나 더 연다
		if alreadyRunning(addr) {
			say("말랑 면접이 이미 실행 중이에요. 창을 하나 더 열게요.")
			openBrowser(url)
			return
		}
		fail(fmt.Sprintf("다른 프로그램이 %d번 포트를 쓰고 있어서 시작할 수 없어요.\n그 프로그램을 끄거나 컴퓨터를 다시 켠 뒤 실행해 주세요.\n\n(%v)", port, err))
	}

	sub, _ := fs.Sub(webFiles, ".")
	mux := http.NewServeMux()
	mux.HandleFunc(pingPath, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		lastPing = time.Now()
		mu.Unlock()
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/__malang/version", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(version))
	})
	mux.Handle("/", cacheRules(http.FileServer(http.FS(sub))))

	go func() {
		if err := http.Serve(ln, mux); err != nil {
			fail(err.Error())
		}
	}()

	say(fmt.Sprintf("말랑 면접 %s 실행 중 · 창이 안 열리면 크롬 주소창에 http://%s 를 넣으세요. 면접 창을 닫으면 저절로 꺼져요.", version, addr))

	openBrowser(url)
	waitUntilClosed()
}

// 화면이 10초마다 신호를 보낸다. 한 번이라도 신호가 온 뒤 40초 동안 끊기면 창이 닫힌 것으로 본다.
func waitUntilClosed() {
	started := time.Now()
	for range time.Tick(5 * time.Second) {
		mu.Lock()
		last := lastPing
		mu.Unlock()
		if last.IsZero() {
			// 창이 끝내 안 열려도 10분 뒤에는 정리한다
			if time.Since(started) > 10*time.Minute {
				return
			}
			continue
		}
		if time.Since(last) > 40*time.Second {
			return
		}
	}
}

func alreadyRunning(addr string) bool {
	client := http.Client{Timeout: time.Second}
	res, err := client.Get("http://" + addr + pingPath)
	if err != nil {
		return false
	}
	res.Body.Close()
	return res.StatusCode == http.StatusOK
}

// 화면 파일은 새 버전이 바로 반영되게 매번 새로 읽고, 글꼴은 바뀌지 않으니 하루 동안 재사용한다
func cacheRules(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/fonts/") {
			w.Header().Set("Cache-Control", "max-age=86400")
		} else {
			w.Header().Set("Cache-Control", "no-store")
		}
		h.ServeHTTP(w, r)
	})
}

// 크롬 → 엣지 순으로 '앱 창'(주소창 없는 창)으로 연다. 둘 다 없으면 기본 브라우저.
func openBrowser(url string) {
	if runtime.GOOS != "windows" {
		for _, cmd := range []string{"xdg-open", "open"} {
			if exec.Command(cmd, url).Start() == nil {
				return
			}
		}
		return
	}
	for _, exe := range browserCandidates() {
		if _, err := os.Stat(exe); err == nil {
			if exec.Command(exe, "--app="+url, "--window-size=520,900").Start() == nil {
				return
			}
		}
	}
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func browserCandidates() []string {
	var out []string
	roots := []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData")}
	for _, r := range roots {
		if r != "" {
			out = append(out, filepath.Join(r, `Google\Chrome\Application\chrome.exe`))
		}
	}
	for _, r := range roots {
		if r != "" {
			out = append(out, filepath.Join(r, `Microsoft\Edge\Application\msedge.exe`))
		}
	}
	return out
}
