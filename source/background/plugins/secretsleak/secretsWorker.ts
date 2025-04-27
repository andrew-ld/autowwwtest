import {worker} from 'workerpool'
import {FoundSecret, SECRET_LEAK_RULES_AHO_CORASICK, SECRET_LEAK_RULES_MAP, shannonEntropy} from './rules'

export async function findSecrets(dataAsBuffer: Buffer): Promise<FoundSecret[]> {
	const body = new TextDecoder().decode(dataAsBuffer)

	const foundKeywords = SECRET_LEAK_RULES_AHO_CORASICK.search(body)
	const testedRules = new Set()

	const result = []

	for (const keywordMatches of foundKeywords) {
		for (const keyword of keywordMatches[1]) {
			const rules = SECRET_LEAK_RULES_MAP.get(keyword)

			if (!rules) {
				continue
			}

			for (const rule of rules) {
				if (testedRules.has(rule.id)) {
					continue
				}

				testedRules.add(rule.id)

				const secret = await rule.findSecret(body)

				if (secret) {
					if (rule.entropy) {
						const secretEntropy = shannonEntropy(secret)

						if (secretEntropy < rule.entropy) {
							continue
						}
					}

					result.push({ruleId: rule.id, description: rule.description, secret: secret})
				}
			}
		}
	}

	return result
}

worker({
	findSecrets: findSecrets,
})
