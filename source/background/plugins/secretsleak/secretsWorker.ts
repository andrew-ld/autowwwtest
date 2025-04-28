import {worker} from 'workerpool'
import {FoundSecret, SECRET_LEAK_RULES_MAP, secretLeakRulesFindKeyword, shannonEntropy} from './rules'

export async function findSecrets(dataAsBuffer: Buffer): Promise<FoundSecret[] | null> {
	const body = new TextDecoder().decode(dataAsBuffer)
	const foundKeywords = await secretLeakRulesFindKeyword(body)

	if (!foundKeywords) {
		return null
	}

	const testedRules = new Set()
	const result = []
	const uniqueFoundKeywords = new Set(foundKeywords)

	for (const keyword of uniqueFoundKeywords) {
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

	if (!result.length) {
		return null
	}

	return result
}

worker({
	findSecrets: findSecrets,
})
