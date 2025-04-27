import AhoCorasick from 'ahocorasick'
import GoRegexWrapper from '../../../libs/re2wasm/re2'
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
			lazyCompiledRegexId = await GoRegexWrapper.compile(r.regex)
		}
		return await GoRegexWrapper.test(lazyCompiledRegexId, test)
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

export const SECRET_LEAK_RULES_AHO_CORASICK = new AhoCorasick(RAW_RULES.map(r => r.keywords).flat())
