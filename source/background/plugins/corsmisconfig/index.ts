import {
	IPlugin,
	IPluginFactory,
	PluginNotificationCreator,
	PluginNotificationPriority,
	PluginSettingDefinition,
	SuggestedSettings,
} from '../../pluginsManager'
import AsyncLock from 'async-lock'

enum CorsIssueType {
	WILDCARD_ORIGIN = 'wildcard_origin',
	NULL_ORIGIN = 'null_origin',
	INVALID_CREDENTIALS_COMBO = 'invalid_credentials_combo',
}

class CorsMisconfigPlugin extends IPlugin {
	private settings: SuggestedSettings & {onlyIfCookiesArePresent: boolean; onlyIfAllowCredentials: boolean}
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

		const acao = this.getHeaderValue(details.responseHeaders, 'access-control-allow-origin')
		const acac = this.getHeaderValue(details.responseHeaders, 'access-control-allow-credentials')

		let issue: {type: CorsIssueType; message: string} | null = null

		if (acao === '*') {
			if (acac === 'true') {
				issue = {
					type: CorsIssueType.INVALID_CREDENTIALS_COMBO,
					message: `The site uses 'Access-Control-Allow-Origin: *' together with 'Access-Control-Allow-Credentials: true'. This is an invalid and insecure combination.`,
				}
			} else {
				issue = {
					type: CorsIssueType.WILDCARD_ORIGIN,
					message: `The site uses 'Access-Control-Allow-Origin: *'. This allows any website to make requests and read the response, which can be a security risk.`,
				}
			}
		} else if (acao === 'null') {
			issue = {
				type: CorsIssueType.NULL_ORIGIN,
				message: `The site uses 'Access-Control-Allow-Origin: null'. Allowing the 'null' origin can be dangerous.`,
			}
		}

		if (!issue) {
			return
		}

		if (this.settings.onlyIfAllowCredentials) {
			if (issue.type !== CorsIssueType.INVALID_CREDENTIALS_COMBO) {
				return
			}
		}

		if (this.settings.onlyIfCookiesArePresent) {
			const cookies = await browser.cookies.getAll({url: details.url})

			if (!cookies.length) {
				return
			}

			if (!cookies.find(c => c.sameSite === 'no_restriction' && c.secure)) {
				return
			}
		}

		this.notificationLock.acquire('notification', () => {
			return this.handlePotentialNotification(details.url, issue.type, issue.message)
		})
	}

	private async handlePotentialNotification(
		url: string,
		issueType: CorsIssueType,
		notificationDescription: string,
	): Promise<void> {
		const hostname = new URL(url).hostname
		const rateLimitKey = `${hostname}:${issueType}`
		const rateLimitMillis = this.settings.suggestedNotificationRateLimit * 60 * 1000

		const canCreateNotification = await this.notificationCreator.notificationRateLimitWithTTL(
			rateLimitKey,
			rateLimitMillis,
		)

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
			title: `Potential CORS Misconfiguration (${hostname})`,
			description: description,
			url: url,
		})
	}
}

export class CorsMisconfigPluginFactory implements IPluginFactory {
	getPluginId(): string {
		return 'CorsMisconfig'
	}

	getSettingsDefinitions(): Record<string, PluginSettingDefinition> {
		return {
			onlyIfCookiesArePresent: {
				type: 'boolean',
				default: true,
			},
			onlyIfAllowCredentials: {
				type: 'boolean',
				default: true,
			},
		}
	}

	async newInstance(
		settings: Record<string, any> & SuggestedSettings,
		notificationCreator: PluginNotificationCreator,
	): Promise<IPlugin> {
		return new CorsMisconfigPlugin(settings, notificationCreator)
	}
}
