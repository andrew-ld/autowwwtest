import {
	IPlugin,
	IPluginFactory,
	PluginNotificationCreator,
	PluginNotificationPriority,
	PluginSettingDefinition,
	SuggestedSettings,
} from '../../pluginsManager'
import {FoundSecret} from './rules'
import Filter from 'bloom-filter'
import Pool from 'workerpool/types/Pool'
import {pool} from 'workerpool'
import AsyncLock from 'async-lock'
import murmurhash from 'murmurhash'

class SecretsLeakPlugin implements IPlugin {
	private bloomFilter: Filter
	private pool: Pool
	private notificationLock: AsyncLock

	private settings: {
		bloomFilterSize: number
		workerPoolSize: number
	} & SuggestedSettings

	private notificationCreator: PluginNotificationCreator

	constructor(settings: Record<string, any> & SuggestedSettings, notificationCreator: PluginNotificationCreator) {
		this.settings = settings as typeof this.settings
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

	async onResponseBodyReceived(
		details: browser.webRequest._OnBeforeRequestDetails,
		event: browser.webRequest._StreamFilterOndataEvent,
	): Promise<void> {
		if (!event.data.byteLength) {
			return
		}

		const dataAsBuffer = Buffer.from(event.data)

		if (this.bloomFilter.contains(dataAsBuffer)) {
			return
		}

		this.bloomFilter.insert(dataAsBuffer)

		const secrets = (await this.pool.exec('findSecrets', [dataAsBuffer])) as FoundSecret[]

		if (!secrets.length) {
			return
		}

		this.notificationLock.acquire('notification', () => {
			const promises = secrets.map(secret => {
				return this.handlePotentialNotification(details.url, secret)
			})

			return Promise.all(promises)
		})
	}

	private async handlePotentialNotification(url: string, secret: FoundSecret): Promise<void> {
		const hostname = new URL(url).hostname
		const rateLimitKey = `${hostname}:${secret.ruleId}:${murmurhash.v3(secret.secret, 0x69)}`
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
		await this.notificationCreator.createNotification(PluginNotificationPriority.URGENT, {
			title: `Potential Secret Leak Detected (${secret.ruleId})`,
			description: `Possible leak matching "${secret.description}" (${secret.secret}) found on ${hostname}.`,
			url: url,
		})
	}

	async onResponseHeadersReceived(): Promise<void> {}
	async onRequestErrorOccurred(): Promise<void> {}
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
