//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"
)

// 배포용 exe는 콘솔 창이 없으므로(-H windowsgui) 평소 안내는 띄우지 않고, 문제만 알림 창으로 보여 준다.
var messageBox = syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")

const (
	mbOK        = 0x00000000
	mbIconError = 0x00000010
	mbTopMost   = 0x00040000
)

func say(string) {}

func fail(msg string) {
	title, _ := syscall.UTF16PtrFromString("말랑 면접")
	text, _ := syscall.UTF16PtrFromString("문제가 생겼어요.\n\n" + msg)
	messageBox.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbOK|mbIconError|mbTopMost)
	os.Exit(1)
}
