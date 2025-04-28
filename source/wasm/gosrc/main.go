package main

import (
	"fmt"
	"regexp"
	"sync"
	"syscall/js"
)

type CompiledMatcher struct {
	matcher    *Matcher
	dictionary []string
}

var (
	compiledRegexes          = make(map[int]*regexp.Regexp)
	compiledRegexesIDCounter int
	compiledRegexesMutex     sync.Mutex

	ahocorasickMatchers          = make(map[int]*CompiledMatcher)
	ahocorasickMatchersIDCounter int
	ahocorasickMatchersMutex     sync.Mutex
)

func createAhocorasickGo(this js.Value, args []js.Value) interface{} {
	if len(args) != 1 {
		panic("createAhocorasickGo: expected 1 argument (list of strings)")
	}
	if args[0].Type() != js.TypeObject || !args[0].InstanceOf(js.Global().Get("Array")) {
		panic("createAhocorasickGo: argument must be an array of strings")
	}

	jsKeywords := args[0]
	keywordsLen := jsKeywords.Length()
	goKeywords := make([]string, keywordsLen)

	for i := range keywordsLen {
		val := jsKeywords.Index(i)
		if val.Type() != js.TypeString {
			panic(fmt.Sprintf("createAhocorasickGo: array element at index %d must be a string", i))
		}
		goKeywords[i] = val.String()
	}

	matcher := NewStringMatcher(goKeywords)

	ahocorasickMatchersMutex.Lock()
	defer ahocorasickMatchersMutex.Unlock()

	ahocorasickMatchersIDCounter++
	id := ahocorasickMatchersIDCounter
	ahocorasickMatchers[id] = &CompiledMatcher{matcher: matcher, dictionary: goKeywords}

	return js.ValueOf(id)
}

func matchAhocorasickGo(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		panic("matchAhocorasickGo: expected 2 arguments (matcherId int, text string)")
	}
	if args[0].Type() != js.TypeNumber {
		panic("matchAhocorasickGo: first argument (matcherId) must be a number")
	}
	if args[1].Type() != js.TypeString {
		panic("matchAhocorasickGo: second argument (text) must be a string")
	}

	id := args[0].Int()
	text := args[1].String()

	ahocorasickMatchersMutex.Lock()
	matcher, ok := ahocorasickMatchers[id]
	ahocorasickMatchersMutex.Unlock()

	if !ok {
		panic(fmt.Sprintf("matchAhocorasickGo: matcher with ID %d not found", id))
	}

	matchesIndexes := matcher.matcher.Match([]byte(text))

	if len(matchesIndexes) == 0 {
		return js.ValueOf(nil)
	}

	jsArray := js.Global().Get("Array").New(len(matchesIndexes))

	for i := range len(matchesIndexes) {
		jsArray.SetIndex(i, js.ValueOf(matcher.dictionary[matchesIndexes[i]]))
	}

	return jsArray
}

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

	compiledRegexesMutex.Lock()
	defer compiledRegexesMutex.Unlock()

	compiledRegexesIDCounter++
	id := compiledRegexesIDCounter
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

	compiledRegexesMutex.Lock()
	compiledRegexp, ok := compiledRegexes[id]
	compiledRegexesMutex.Unlock()

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
	fmt.Println("Go Bridge Initialized")

	js.Global().Set("createAhocorasickGo", js.FuncOf(createAhocorasickGo))
	js.Global().Set("matchAhocorasickGo", js.FuncOf(matchAhocorasickGo))

	js.Global().Set("compileRegexGo", js.FuncOf(compileRegexGo))
	js.Global().Set("testRegexGo", js.FuncOf(testStringGo))

	<-make(chan bool)
}
