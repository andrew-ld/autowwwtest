import {
	IPlugin,
	IPluginFactory,
	PluginNotificationCreator,
	PluginNotificationPriority,
	PluginSettingDefinition,
	SuggestedSettings,
} from '../../pluginsManager'
import AsyncLock from 'async-lock'

class OpenRedirectPlugin extends IPlugin {
	private settings: SuggestedSettings & {onlyGetRequests: boolean}
	private notificationCreator: PluginNotificationCreator
	private notificationLock: AsyncLock

	constructor(settings: Record<string, any> & SuggestedSettings, notificationCreator: PluginNotificationCreator) {
		super()
		this.settings = settings as typeof this.settings
		this.notificationCreator = notificationCreator
		this.notificationLock = new AsyncLock()
	}

	private getHeaderValue(headers: browser.webRequest.HttpHeaders, headerName: string): string | undefined {
		const header = headers.find(h => h.name.toLowerCase() === headerName.toLowerCase())
		return header?.value
	}

	async onResponseHeadersReceived(details: browser.webRequest._OnHeadersReceivedDetails): Promise<void> {
		if (!details.responseHeaders) {
			return
		}

		if (this.settings.onlyGetRequests && details.method !== 'GET') {
			return
		}

		const isRedirect = details.statusCode >= 300 && details.statusCode < 400
		if (!isRedirect) {
			return
		}

		const locationHeader = this.getHeaderValue(details.responseHeaders, 'location')
		if (!locationHeader) {
			return
		}

		const originalUrl = new URL(details.url)
		const locationUrl = new URL(locationHeader, details.url)

		if (originalUrl.hostname === locationUrl.hostname) {
			return
		}

		let redirectPartialString = locationUrl.hostname

		if (locationUrl.pathname !== '/') {
			redirectPartialString += locationUrl.pathname
		}

		if (!originalUrl.pathname.includes(redirectPartialString) && !originalUrl.search.includes(redirectPartialString)) {
			return
		}

		const message = `Potential external redirect: The site redirected from '${originalUrl.hostname}' to a different domain '${locationUrl.hostname}' present in the origin url ('${originalUrl}'). Review if this redirect is intended and secure.`

		this.notificationLock.acquire('notification', () => {
			return this.handlePotentialNotification(details.url, message, originalUrl.hostname)
		})
	}

	private async handlePotentialNotification(
		url: string,
		notificationDescription: string,
		hostname: string,
	): Promise<void> {
		const rateLimitMillis = this.settings.suggestedNotificationRateLimit * 60 * 1000

		const canCreateNotification = await this.notificationCreator.notificationRateLimitWithTTL(hostname, rateLimitMillis)

		if (!canCreateNotification) {
			return
		}

		await this.notify(hostname, notificationDescription, url)
	}

	private async notify(hostname: string, description: string, url: string): Promise<void> {
		const priority =
			this.settings.suggestedNotificationPriority === 'silent'
				? PluginNotificationPriority.SILENT
				: PluginNotificationPriority.REGULAR

		await this.notificationCreator.createNotification(priority, {
			title: `Potential External Redirect (${hostname})`,
			description: description,
			url: url,
		})
	}
}

export class OpenRedirectPluginFactory implements IPluginFactory {
	getPluginId(): string {
		return 'OpenRedirect'
	}

	getSettingsDefinitions(): Record<string, PluginSettingDefinition> {
		return {
			onlyGetRequests: {
				type: 'boolean',
				default: true,
			},
		}
	}

	async newInstance(
		settings: Record<string, any> & SuggestedSettings,
		notificationCreator: PluginNotificationCreator,
	): Promise<IPlugin> {
		return new OpenRedirectPlugin(settings, notificationCreator)
	}
}
