import {parse as tldtsParse} from 'tldts'
import {
	IPlugin,
	IPluginFactory,
	PluginNotificationCreator,
	PluginNotificationPriority,
	PluginSettingDefinition,
	SuggestedSettings,
} from '../../pluginsManager'
import AsyncLock from 'async-lock'
import {DoHClient, DoHResponse} from './doh'
import {LRUCache} from 'lru-cache'

class DomainTakeoverPlugin implements IPlugin {
	private settings: {
		dohServer: keyof typeof DomainTakeoverPluginFactory.DOH_SERVERS
		lruCacheSize: number
	} & SuggestedSettings

	private notificationCreator: PluginNotificationCreator
	private notificationLock: AsyncLock
	private lruCache: LRUCache<string, true>
	private resolver: DoHClient

	constructor(settings: Record<string, any> & SuggestedSettings, notificationCreator: PluginNotificationCreator) {
		this.settings = settings as typeof this.settings
		this.notificationCreator = notificationCreator
		this.notificationLock = new AsyncLock()
		this.resolver = new DoHClient(DomainTakeoverPluginFactory.DOH_SERVERS[this.settings.dohServer])
		this.lruCache = new LRUCache({maxSize: this.settings.lruCacheSize, sizeCalculation: () => 1})
	}

	async onRequestErrorOccurred(details: browser.webRequest._OnErrorOccurredDetails): Promise<void> {
		if (details.ip) {
			return
		}

		const originUrl = details.originUrl

		if (!originUrl) {
			return
		}

		if (details.error !== 'NS_ERROR_UNKNOWN_HOST') {
			return
		}

		const parsedUrl = tldtsParse(details.url)

		if (parsedUrl.isIp) {
			return
		}

		if (parsedUrl.isPrivate) {
			return
		}

		const domain = parsedUrl.domain

		if (!domain) {
			return
		}

		if (this.lruCache.get(domain)) {
			return
		}

		this.lruCache.set(domain, true)

		let nameservers: DoHResponse

		try {
			nameservers = await this.resolver.query(domain, 'NS')
		} catch (e) {
			console.error('unable to request doh', this.settings.dohServer, domain, e)
			return
		}

		if (nameservers.Status !== 3) {
			return
		}

		this.notificationLock.acquire('notification', () => {
			return this.handlePotentialNotification(domain, originUrl)
		})
	}

	private async handlePotentialNotification(requestedDomain: string, originUrl: string) {
		const originHostname = new URL(originUrl).hostname
		const rateLimitKey = `${originHostname}:${requestedDomain}`
		const rateLimitMillis = this.settings.suggestedNotificationRateLimit * 60 * 1000

		const canCreateNotification = await this.notificationCreator.notificationRateLimitWithTTL(
			rateLimitKey,
			rateLimitMillis,
		)

		if (!canCreateNotification) {
			return
		}

		await this.notify(requestedDomain, originUrl, originHostname)
	}

	private async notify(requestedDomain: string, originUrl: string, originHostname: string): Promise<void> {
		const priority =
			this.settings.suggestedNotificationPriority === 'silent'
				? PluginNotificationPriority.SILENT
				: PluginNotificationPriority.REGULAR

		await this.notificationCreator.createNotification(priority, {
			title: `Potential request from ${originHostname} to an unregistered domain (${requestedDomain})`,
			description: `${originHostname} initiated a request to ${requestedDomain}, which may not be registered. This could indicate a vulnerability to domain takeover.`,
			url: originUrl,
		})
	}

	async onResponseHeadersReceived(): Promise<void> {}
	async onResponseBodyReceived(): Promise<void> {}
}

export class DomainTakeoverPluginFactory implements IPluginFactory {
	static DOH_SERVERS = {
		google: 'https://dns.google/resolve',
		cloudflare: 'https://cloudflare-dns.com/dns-query',
	}

	getPluginId(): string {
		return 'DomainTakeover'
	}

	getSettingsDefinitions(): Record<string, PluginSettingDefinition> {
		return {
			dohServer: {
				type: 'enum',
				default: 'cloudflare',
				values: Object.keys(DomainTakeoverPluginFactory.DOH_SERVERS),
			},
			lruCacheSize: {
				type: 'number',
				default: 1024 * 4,
				min: 1024,
			},
		}
	}

	async newInstance(
		settings: Record<string, any> & SuggestedSettings,
		notificationCreator: PluginNotificationCreator,
	): Promise<IPlugin> {
		return new DomainTakeoverPlugin(settings, notificationCreator)
	}
}
