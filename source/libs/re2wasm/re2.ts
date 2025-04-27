import AsyncLock from 'async-lock'
import './go_wasm/wasm_exec'

declare global {
	class globalThis {
		static compileRegexGo: (pattern: string) => number
		static testStringGo: (regexId: number, text: string) => string | null
	}
}

var WASM_LOADER_COMPLETED: boolean = false
var WASM_LOADER_LOCK = new AsyncLock()

function ensureRe2Wasm(): Promise<void> {
	if (WASM_LOADER_COMPLETED) {
		return Promise.resolve()
	}

	return WASM_LOADER_LOCK.acquire('wasm-loader', async () => {
		if (WASM_LOADER_COMPLETED) {
			return
		}

		const go = new Go()

		const wasm = new URL('re2.wasm', import.meta.url)
		const result = await WebAssembly.instantiateStreaming(fetch(wasm), go.importObject)

		go.run(result.instance)

		WASM_LOADER_COMPLETED = true
	})
}

export class GoRegexWrapper {
	static async compile(pattern: string): Promise<number> {
		await ensureRe2Wasm()
		if (typeof globalThis.compileRegexGo !== 'function') {
			throw new Error("Go WASM function 'compileRegexGo' is not loaded or available.")
		}
		return globalThis.compileRegexGo(pattern)
	}

	static async test(regexId: number, text: string): Promise<string | null> {
		await ensureRe2Wasm()
		if (typeof globalThis.testStringGo !== 'function') {
			throw new Error("Go WASM function 'testStringGo' is not loaded or available.")
		}
		return globalThis.testStringGo(regexId, text)
	}
}

export default GoRegexWrapper
