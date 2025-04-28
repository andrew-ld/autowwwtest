import AsyncLock from 'async-lock'
import './golib/wasm_exec'

declare global {
	class globalThis {
		static compileRegexGo: (pattern: string) => number
		static testRegexGo: (regexId: number, text: string) => string | null
		static createAhocorasickGo: (patterns: string[]) => number
		static matchAhocorasickGo: (ahocorasickId: number, text: string) => string[] | null
	}
}

var WASM_LOADER_COMPLETED: boolean = false
var WASM_LOADER_LOCK = new AsyncLock()

function ensureWebAssemblyLoaded(): Promise<void> {
	if (WASM_LOADER_COMPLETED) {
		return Promise.resolve()
	}

	return WASM_LOADER_LOCK.acquire('wasm-loader', async () => {
		if (WASM_LOADER_COMPLETED) {
			return
		}

		const go = new Go()

		const wasm = new URL('lib.wasm', import.meta.url)
		const result = await WebAssembly.instantiateStreaming(fetch(wasm), go.importObject)

		go.run(result.instance)

		WASM_LOADER_COMPLETED = true
	})
}

export class WasmWrapper {
	static async compileRegex(pattern: string): Promise<number> {
		await ensureWebAssemblyLoaded()
		if (typeof globalThis.compileRegexGo !== 'function') {
			throw new Error("Go WASM function 'compileRegexGo' is not loaded or available.")
		}
		return globalThis.compileRegexGo(pattern)
	}

	static async testRegex(regexId: number, text: string): Promise<string | null> {
		await ensureWebAssemblyLoaded()
		if (typeof globalThis.testRegexGo !== 'function') {
			throw new Error("Go WASM function 'testStringGo' is not loaded or available.")
		}
		return globalThis.testRegexGo(regexId, text)
	}

	static async createAhocorasick(patterns: string[]): Promise<number> {
		await ensureWebAssemblyLoaded()
		if (typeof globalThis.createAhocorasickGo !== 'function') {
			throw new Error("Go WASM function 'createAhocorasickGo' is not loaded or available.")
		}
		return globalThis.createAhocorasickGo(patterns)
	}

	static async matchAhocorasick(ahocorasickId: number, text: string): Promise<string[] | null> {
		await ensureWebAssemblyLoaded()
		if (typeof globalThis.matchAhocorasickGo !== 'function') {
			throw new Error("Go WASM function 'matchAhocorasickGo' is not loaded or available.")
		}
		return globalThis.matchAhocorasickGo(ahocorasickId, text)
	}
}

export default WasmWrapper
