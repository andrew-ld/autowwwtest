import {
	IPlugin,
	IPluginFactory,
	PluginNotificationCreator,
	PluginNotificationPriority,
	PluginSettingDefinition,
	SuggestedSettings,
} from '../../pluginsManager'
import {FoundSecret} from './rules'
import Filter, {MurmurHash3} from 'bloom-filter'
import Pool from 'workerpool/types/Pool'
import {pool} from 'workerpool'
import AsyncLock from 'async-lock'

class SecretsLeakPlugin extends IPlugin {
	private bloomFilter: Filter
	private pool: Pool
	private notificationLock: AsyncLock

	private settings: {
		bloomFilterSize: number
		workerPoolSize: number
		disabledRules: string
		mutedRules: string
		interceptRequestHeaders: boolean
		interceptResponseBody: boolean
	} & SuggestedSettings

	private disabledRules: Set<String>
	private mutedRules: Set<String>

	private notificationCreator: PluginNotificationCreator

	constructor(settings: Record<string, any> & SuggestedSettings, notificationCreator: PluginNotificationCreator) {
		super()
		this.settings = settings as typeof this.settings
		this.disabledRules = new Set(this.settings.disabledRules.split(','))
		this.mutedRules = new Set(this.settings.mutedRules.split(','))
		this.notificationCreator = notificationCreator
		this.bloomFilter = Filter.create(this.settings.bloomFilterSize, 0.01)
		this.pool = pool(new URL('./secretsWorker.ts', import.meta.url).href, {
			maxWorkers: this.settings.workerPoolSize,
			minWorkers: 1,
		})
		this.notificationLock = new AsyncLock()
	}

	shutdownPool() {
		this.pool.terminate(true)
	}

	async onRequestCreated(details: browser.webRequest._OnSendHeadersDetails): Promise<void> {
		if (!this.settings.interceptRequestHeaders) {
			return
		}

		const data: (string | undefined)[] = [details.url, details.originUrl]

		if (details.requestHeaders) {
			for (const header of details.requestHeaders) {
				data.push(header.name)
				data.push(header.value)
			}
		}

		await this.searchForSecrets(Buffer.from(data.filter(d => d).join(' ')), details.url)
	}

	async onResponseBodyReceived(
		details: browser.webRequest._OnBeforeRequestDetails,
		event: browser.webRequest._StreamFilterOndataEvent,
	): Promise<void> {
		if (!this.settings.interceptResponseBody) {
			return
		}

		if (!event.data.byteLength) {
			return
		}

		await this.searchForSecrets(Buffer.from(event.data), details.url)
	}

	private async searchForSecrets(data: Buffer, url: string) {
		if (!data.length) {
			return
		}

		if (this.bloomFilter.contains(data)) {
			return
		}

		this.bloomFilter.insert(data)

		const secrets = (await this.pool.exec('findSecrets', [data])) as FoundSecret[] | null

		if (!secrets?.length) {
			return
		}

		this.notificationLock.acquire('notification', () => {
			const promises = secrets.map(secret => {
				return this.handlePotentialNotification(url, secret)
			})

			return Promise.all(promises)
		})
	}

	private async handlePotentialNotification(url: string, secret: FoundSecret): Promise<void> {
		if (this.disabledRules.has(secret.ruleId)) {
			return
		}

		const hostname = new URL(url).hostname

		const rateLimitKey = `${hostname}:${secret.ruleId}:${MurmurHash3(0x69, Buffer.from(secret.secret))}`
		const rateLimitMillis = this.settings.suggestedNotificationRateLimit * 60 * 1000

		const canCreateNotification = await this.notificationCreator.notificationRateLimitWithTTL(
			rateLimitKey,
			rateLimitMillis,
		)

		if (!canCreateNotification) {
			return
		}

		await this.notify(hostname, secret, url)
	}

	private async notify(hostname: string, secret: FoundSecret, url: string): Promise<void> {
		let priority = PluginNotificationPriority.URGENT

		if (this.mutedRules.has(secret.ruleId)) {
			priority = PluginNotificationPriority.SILENT
		}

		await this.notificationCreator.createNotification(priority, {
			title: `Potential Secret Leak Detected (${secret.ruleId})`,
			description: `Possible leak matching "${secret.description}" (${secret.secret}) found on ${hostname}.`,
			url: url,
		})
	}
}

export class SecretsLeakPluginFactory implements IPluginFactory {
	private latestInstance: SecretsLeakPlugin | null = null

	getPluginId(): string {
		return 'SecretsLeak'
	}

	getSettingsDefinitions(): Record<string, PluginSettingDefinition> {
		return {
			bloomFilterSize: {
				type: 'number',
				default: 1024 * 1024,
				min: 1024,
			},
			workerPoolSize: {
				type: 'number',
				default: 8,
				min: 1,
				max: Math.max(navigator.hardwareConcurrency || 16, 8),
			},
			disabledRules: {
				type: 'string',
				default: 'jwt,jwt-base64',
			},
			mutedRules: {
				type: 'string',
				default: 'vault-service-token',
			},
			interceptRequestHeaders: {
				type: 'boolean',
				default: true,
			},
			interceptResponseBody: {
				type: 'boolean',
				default: true,
			},
		}
	}

	async newInstance(
		settings: Record<string, any> & SuggestedSettings,
		notificationCreator: PluginNotificationCreator,
	): Promise<IPlugin> {
		this.latestInstance?.shutdownPool()
		return (this.latestInstance = new SecretsLeakPlugin(settings, notificationCreator))
	}
}
