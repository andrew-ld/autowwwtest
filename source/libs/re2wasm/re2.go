package main

import (
	"fmt"
	"regexp"
	"sync"
	"syscall/js"
)

var (
	compiledRegexes = make(map[int]*regexp.Regexp)
	regexIDCounter  int
	mapMutex        sync.Mutex
)

func compileRegexGo(this js.Value, args []js.Value) interface{} {
	if len(args) != 1 {
		panic("compileRegexGo: expected 1 argument (pattern string)")
	}
	if args[0].Type() != js.TypeString {
		panic("compileRegexGo: argument must be a string")
	}

	pattern := args[0].String()

	compiledRegexp, err := regexp.Compile(pattern)
	if err != nil {
		panic(fmt.Sprintf("compileRegexGo: invalid pattern '%s': %v", pattern, err))
	}

	mapMutex.Lock()
	defer mapMutex.Unlock()

	regexIDCounter++
	id := regexIDCounter
	compiledRegexes[id] = compiledRegexp

	return js.ValueOf(id)
}

func testStringGo(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		panic("testStringGo: expected 2 arguments (regexId int, text string)")
	}
	if args[0].Type() != js.TypeNumber {
		panic("testStringGo: first argument (regexId) must be a number")
	}
	if args[1].Type() != js.TypeString {
		panic("testStringGo: second argument (text) must be a string")
	}

	id := args[0].Int()
	text := args[1].String()

	mapMutex.Lock()
	compiledRegexp, ok := compiledRegexes[id]
	mapMutex.Unlock()

	if !ok {
		panic(fmt.Sprintf("testStringGo: regex with ID %d not found", id))
	}

	match := compiledRegexp.FindString(text)

	if len(match) == 0 {
		return js.ValueOf(nil)
	}

	return js.ValueOf(match)
}

func main() {
	fmt.Println("Go WebAssembly Regex Bridge Initialized")

	js.Global().Set("compileRegexGo", js.FuncOf(compileRegexGo))
	js.Global().Set("testStringGo", js.FuncOf(testStringGo))

	<-make(chan bool)
}
