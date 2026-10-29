//go:build !windows

package main

import (
	"fmt"
	"os"
)

// 윈도우가 아닌 곳(개발·테스트용)에서는 터미널에 출력한다.
func say(msg string) { fmt.Println(msg) }

func fail(msg string) {
	fmt.Println("문제가 생겼어요:", msg)
	os.Exit(1)
}
