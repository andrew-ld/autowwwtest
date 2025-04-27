import {
	IPlugin,
	IPluginFactory,
	PluginNotificationCreator,
	PluginNotificationPriority,
	PluginSettingDefinition,
	SuggestedSettings,
} from '../../pluginsManager'
import AsyncLock from 'async-lock'
import {LRUCache} from 'lru-cache'
import pLimit, {LimitFunction} from 'p-limit'

interface DotFile {
	enabledByDefault?: boolean
	key: string
	filename: string
	content: string[]
}

class DotFilesLeakPlugin implements IPlugin {
	static calculateDotFileSettingsKey(dotFile: DotFile): string {
		return 'check' + dotFile.key.charAt(0).toUpperCase() + dotFile.key.substring(1)
	}

	static DOT_FILES: DotFile[] = [
		{
			key: 'gitVcs',
			filename: '.git/HEAD',
			content: ['ref: '],
			enabledByDefault: true,
		},
		{
			key: 'envFile',
			filename: '.env',
			content: ['='],
		},
		{
			key: 'svnVcs',
			filename: '.svn/wc.db',
			content: ['SQLite'],
		},
		{
			key: 'ghVcs',
			filename: '.hg/store/00manifest.i',
			content: [
				'\u0000\u0000\u0000\u0001',
				'\u0000\u0001\u0000\u0001',
				'\u0000\u0002\u0000\u0001',
				'\u0000\u0003\u0000\u0001',
			],
		},
	]

	private settings: {
		lruCacheSize: number
		concurrency: number
		timeout: number
	} & SuggestedSettings

	private notificationCreator: PluginNotificationCreator
	private notificationLock: AsyncLock
	private lruCache: LRUCache<string, true>
	private dotFiles: DotFile[]
	private concurrencyLimiter: LimitFunction

	constructor(settings: Record<string, any> & SuggestedSettings, notificationCreator: PluginNotificationCreator) {
		this.settings = settings as typeof this.settings
		this.notificationCreator = notificationCreator
		this.notificationLock = new AsyncLock()
		this.lruCache = new LRUCache({maxSize: this.settings.lruCacheSize, sizeCalculation: () => 1})
		this.dotFiles = DotFilesLeakPlugin.DOT_FILES.filter(
			d => settings[DotFilesLeakPlugin.calculateDotFileSettingsKey(d)],
		)
		this.concurrencyLimiter = pLimit(this.settings.concurrency)
	}

	async onResponseHeadersReceived(details: browser.webRequest._OnHeadersReceivedDetails): Promise<void> {
		if (!this.dotFiles.length) {
			return
		}

		const url = new URL(details.url)

		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			return
		}

		const cacheKey = `${url.protocol}:${url.hostname}`

		if (this.lruCache.get(cacheKey)) {
			return
		}

		this.lruCache.set(cacheKey, true)

		this.dotFiles.forEach(async d => {
			this.concurrencyLimiter(() => this.verifyDotFile(url, d)).catch(console.error)
		})
	}

	private async verifyDotFile(url: URL, dotFile: DotFile) {
		const dotFileUrl = `${url.protocol}//${url.hostname}/${dotFile.filename}`

		let responseText: string

		try {
			const response = await fetch(dotFileUrl, {signal: AbortSignal.timeout(this.settings.timeout), redirect: 'manual'})

			if (response.status !== 200) {
				return
			}

			responseText = await response.text()
		} catch (e) {
			console.log('unable to fetch dotfile', dotFileUrl, e)
			return
		}

		if (!dotFile.content.find(c => responseText.includes(c))) {
			return
		}

		this.notificationLock.acquire('notification', () => {
			this.handlePotentialNotification(url.hostname, dotFile, dotFileUrl)
		})
	}

	private async handlePotentialNotification(hostname: string, dotFile: DotFile, dotFileUrl: string) {
		const rateLimitKey = `${hostname}:${dotFile.key}`
		const rateLimitMillis = this.settings.suggestedNotificationRateLimit * 60 * 1000

		const canCreateNotification = await this.notificationCreator.notificationRateLimitWithTTL(
			rateLimitKey,
			rateLimitMillis,
		)

		if (!canCreateNotification) {
			return
		}

		await this.notify(hostname, dotFile, dotFileUrl)
	}

	private async notify(hostname: string, dotFile: DotFile, dotFileUrl: string): Promise<void> {
		const priority =
			this.settings.suggestedNotificationPriority === 'silent'
				? PluginNotificationPriority.SILENT
				: PluginNotificationPriority.REGULAR

		await this.notificationCreator.createNotification(priority, {
			title: `Potential Dotfile Exposure on ${hostname}`,
			description: `The file "${dotFile.filename}" was found publicly accessible on ${hostname}. Dotfiles often contain sensitive data, posing a security risk.`,
			url: dotFileUrl,
		})
	}

	async onRequestErrorOccurred(): Promise<void> {}
	async onResponseBodyReceived(): Promise<void> {}
}

export class DotFilesLeakPluginFactory implements IPluginFactory {
	getPluginId(): string {
		return 'DotFilesLeak'
	}

	getSettingsDefinitions(): Record<string, PluginSettingDefinition> {
		const result: Record<string, PluginSettingDefinition> = {
			lruCacheSize: {
				type: 'number',
				default: 1024 * 8,
				min: 1024,
			},
			concurrency: {
				type: 'number',
				default: 16,
				min: 8,
				max: 128,
			},
			timeout: {
				type: 'number',
				default: 1024,
				min: 512,
				max: 1024 * 4,
			},
		}

		DotFilesLeakPlugin.DOT_FILES.forEach(d => {
			result[DotFilesLeakPlugin.calculateDotFileSettingsKey(d)] = {
				type: 'boolean',
				default: d.enabledByDefault!!,
			}
		})

		return result
	}

	async newInstance(
		settings: Record<string, any> & SuggestedSettings,
		notificationCreator: PluginNotificationCreator,
	): Promise<IPlugin> {
		return new DotFilesLeakPlugin(settings, notificationCreator)
	}
}
