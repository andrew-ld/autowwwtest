export interface DoHQuestion {
	name: string
	type: number
}

export interface DoHAnswer {
	name: string
	type: number
	TTL: number
	data: string
}

export interface DoHResponse {
	Status: number
	TC: boolean
	RD: boolean
	RA: boolean
	AD: boolean
	CD: boolean
	Question: DoHQuestion[]
	Answer?: DoHAnswer[]
	Authority?: DoHAnswer[]
	Additional?: DoHAnswer[]
	Comment?: string
}

export class DoHClient {
	private readonly dohServerUrl: string

	constructor(dohServerUrl: string) {
		this.dohServerUrl = dohServerUrl
	}

	async query(name: string, type: string | number): Promise<DoHResponse> {
		const queryParams = new URLSearchParams({
			name: name,
			type: type.toString(),
		})

		const requestUrl = `${this.dohServerUrl}?${queryParams.toString()}`

		const response = await fetch(requestUrl, {
			method: 'GET',
			headers: {
				Accept: 'application/dns-json',
			},
		})

		if (!response.ok) {
			throw new Error(`DoH query failed: HTTP ${response.status}`)
		}

		return await response.json()
	}
}
