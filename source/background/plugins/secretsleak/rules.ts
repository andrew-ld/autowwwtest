import WasmWrapper from '../../../wasm'
import * as RAW_RULES from './rules.json'

export interface SecretRule {
	id: string
	description: string
	findSecret: (test: string) => Promise<string | null>
	entropy: number | null
}

export interface FoundSecret {
	ruleId: string
	description: string
	secret: string
}

export function shannonEntropy(data: string): number {
	if (!data.length) {
		return 0
	}

	const charCounts: Record<string, number> = {}
	const dataLength = data.length

	for (let i = 0; i < dataLength; i++) {
		const char = data[i]
		charCounts[char] = (charCounts[char] || 0) + 1
	}

	let entropy = 0
	const invLength = 1.0 / dataLength

	for (const char in charCounts) {
		const count = charCounts[char]
		const freq = count * invLength
		if (freq > 0) {
			entropy -= freq * Math.log2(freq)
		}
	}

	return entropy
}

export const SECRET_LEAK_RULES_MAP = new Map<string, SecretRule[]>()

RAW_RULES.forEach(r => {
	let lazyCompiledRegexId: number | undefined = undefined

	async function findSecret(test: string): Promise<string | null> {
		if (lazyCompiledRegexId === undefined) {
			lazyCompiledRegexId = await WasmWrapper.compileRegex(r.regex)
		}
		return await WasmWrapper.testRegex(lazyCompiledRegexId, test)
	}

	const rule = {...r, findSecret}

	for (const keyword of r.keywords) {
		const rules = SECRET_LEAK_RULES_MAP.get(keyword)

		if (rules) {
			rules.push(rule)
		} else {
			SECRET_LEAK_RULES_MAP.set(keyword, [rule])
		}
	}
})

let ahoCorasickLazyCompiledRuleId: number | undefined = undefined

export async function secretLeakRulesFindKeyword(text: string): Promise<string[] | null> {
	if (ahoCorasickLazyCompiledRuleId === undefined) {
		ahoCorasickLazyCompiledRuleId = await WasmWrapper.createAhocorasick([
			...new Set(RAW_RULES.map(r => r.keywords).flat()),
		])
	}

	return await WasmWrapper.matchAhocorasick(ahoCorasickLazyCompiledRuleId, text)
}
