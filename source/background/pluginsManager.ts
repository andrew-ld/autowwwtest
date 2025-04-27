import {openDB, IDBPDatabase} from 'idb'
import {NotificationData, StoredNotificationsManager} from './notificationsManager'

export interface PluginSettingBoolean {
	type: 'boolean'
	default: boolean
}

export interface PluginSettingNumber {
	type: 'number'
	default: number
	min?: number | undefined
	max?: number | undefined
}

export interface PluginSettingString {
	type: 'string'
	default: string
	pattern?: RegExp | undefined
}

export interface PluginSettingEnum {
	type: 'enum'
	default: string
	values: string[]
}

export type PluginSettingDefinition =
	| PluginSettingBoolean
	| PluginSettingNumber
	| PluginSettingString
	| PluginSettingEnum

export abstract class IPlugin {
	abstract onResponseHeadersReceived(details: browser.webRequest._OnHeadersReceivedDetails): Promise<void>

	abstract onResponseBodyReceived(
		details: browser.webRequest._OnBeforeRequestDetails,
		event: browser.webRequest._StreamFilterOndataEvent,
	): Promise<void>

	abstract onRequestErrorOccurred(details: browser.webRequest._OnErrorOccurredDetails): Promise<void>
}

export interface SuggestedSettings {
	suggestedNotificationRateLimit: number
	suggestedNotificationPriority: 'silent' | 'regular' | 'urgent'
}

export abstract class IPluginFactory {
	static getSettingsDefinitionsWithSuggestions(plugin: IPluginFactory): Record<string, PluginSettingDefinition> {
		return {
			suggestedNotificationRateLimit: {
				type: 'number',
				min: 0,
				default: 60,
			},
			suggestedNotificationPriority: {
				type: 'enum',
				default: 'regular',
				values: ['silent', 'regular', 'urgent'],
			},
			...plugin.getSettingsDefinitions(),
		}
	}

	abstract getPluginId(): string

	abstract newInstance(
		settings: Record<string, any> & SuggestedSettings,
		notificationCreator: PluginNotificationCreator,
	): Promise<IPlugin>

	abstract getSettingsDefinitions(): Record<string, PluginSettingDefinition>
}

class PluginStoreManager {
	private static IS_ENABLED_FLAG_KEY = 'is_enabled'
	private static PLUGIN_SETTINGS_KEY = 'plugin_settings'

	public plugin: IPluginFactory
	private database: IDBPDatabase
	private storeKey: string
	private pluginNotificationCreator: PluginNotificationCreator

	constructor(
		plugin: IPluginFactory,
		database: IDBPDatabase,
		store_key: string,
		pluginNotificationCreator: PluginNotificationCreator,
	) {
		this.plugin = plugin
		this.database = database
		this.storeKey = store_key
		this.pluginNotificationCreator = pluginNotificationCreator
	}

	async isEnabled(): Promise<boolean> {
		return (await this.database.get(this.storeKey, PluginStoreManager.IS_ENABLED_FLAG_KEY)) !== false
	}

	async setEnabled(isEnabled: boolean): Promise<void> {
		await this.database.put(this.storeKey, isEnabled, PluginStoreManager.IS_ENABLED_FLAG_KEY)
	}

	private buildDefaultSettings(): Record<string, any> & SuggestedSettings {
		const definitions = IPluginFactory.getSettingsDefinitionsWithSuggestions(this.plugin)
		const result: Record<string, any> = {}

		for (const [key, def] of Object.entries(definitions)) {
			result[key] = def.default
		}

		return result as Record<string, any> & SuggestedSettings
	}

	private validateSettingsDefinitions(settings: Record<string, any>, acceptMissing: boolean = true) {
		const definitions = IPluginFactory.getSettingsDefinitionsWithSuggestions(this.plugin)

		for (const [defKey, defType] of Object.entries(definitions)) {
			const value = settings[defKey]

			if (value === undefined) {
				if (!acceptMissing) {
					throw new Error(`settings key ${defKey} missing`)
				}
				continue
			}

			switch (defType.type) {
				case 'boolean': {
					if (typeof value !== 'boolean') {
						throw new Error(`settings key ${defKey} is not boolean: ${value}`)
					}

					break
				}

				case 'number': {
					if (typeof value !== 'number') {
						throw new Error(`settings key ${defKey} is not number: ${value}`)
					}

					if (!Number.isFinite(value)) {
						throw new Error(`settings key ${defKey} is not finite: ${value}`)
					}

					if (!Number.isSafeInteger(value)) {
						throw new Error(`settings key ${defKey} is not safe integer: ${value}`)
					}

					if (defType.min !== undefined) {
						if (value < defType.min) {
							throw new Error(`settings key ${defKey} is less than ${defType.min}: ${value}`)
						}
					}

					if (defType.max !== undefined) {
						if (value > defType.max) {
							throw new Error(`settings key ${defKey} is greater than ${defType.max}: ${value}`)
						}
					}

					break
				}

				case 'string': {
					if (typeof value !== 'string') {
						throw new Error(`settings key ${defKey} is not string: ${value}`)
					}

					if (defType.pattern !== undefined) {
						if (!defType.pattern.test(value)) {
							throw new Error(`settings key ${defKey} not pass regex test: ${value}`)
						}
					}

					break
				}

				case 'enum': {
					if (typeof value !== 'string') {
						throw new Error(`settings key ${defKey} is not enum string: ${value}`)
					}

					if (!defType.values.includes(value)) {
						throw new Error(`settings key ${defKey} is not a valid enum instance: ${value}`)
					}

					break
				}
			}
		}
	}

	async setSettings(newSettings: Record<string, any>): Promise<void> {
		this.validateSettingsDefinitions(newSettings)
		await this.database.put(this.storeKey, newSettings, PluginStoreManager.PLUGIN_SETTINGS_KEY)
	}

	async newPluginInstance(): Promise<IPlugin> {
		return await this.plugin.newInstance(await this.getSettingsWithDefaults(), this.pluginNotificationCreator)
	}

	async getSettingsWithDefaults(): Promise<Record<string, any> & SuggestedSettings> {
		const settings = await this.database.get(this.storeKey, PluginStoreManager.PLUGIN_SETTINGS_KEY)
		const defaults = this.buildDefaultSettings()

		if (!settings) {
			return defaults
		}

		const result = {...defaults, ...settings}
		this.validateSettingsDefinitions(result, false)

		return result
	}
}

export enum PluginNotificationPriority {
	SILENT,
	REGULAR,
	URGENT,
}

export class PluginNotificationCreator {
	private static PLUGIN_NOTIFICATION_TTL_KEY_PREFIX = 'plugin_notification_ttl:'

	private static calculateNotificationTTLKey(notificationKey: string) {
		return PluginNotificationCreator.PLUGIN_NOTIFICATION_TTL_KEY_PREFIX + notificationKey
	}

	private storedNotifications: StoredNotificationsManager
	private pluginId: string
	private database: IDBPDatabase
	private databaseStoreKey: string

	constructor(
		storedNotifications: StoredNotificationsManager,
		plugin: IPluginFactory,
		database: IDBPDatabase,
		databaseStoreKey: string,
	) {
		this.storedNotifications = storedNotifications
		this.pluginId = plugin.getPluginId()
		this.database = database
		this.databaseStoreKey = databaseStoreKey
	}

	async notificationRateLimitWithTTL(notificationKey: string, ttlMillis: number): Promise<boolean> {
		if (ttlMillis <= 0) {
			return true
		}

		const currentTime = Date.now()

		const key = PluginNotificationCreator.calculateNotificationTTLKey(notificationKey)

		const latestNotificationTime = await this.database.get(this.databaseStoreKey, key)

		if (!latestNotificationTime) {
			await this.database.put(this.databaseStoreKey, currentTime, key)
			return true
		}

		const isRateLimiting = currentTime - latestNotificationTime < ttlMillis

		if (isRateLimiting) {
			return false
		}

		await this.database.put(this.databaseStoreKey, currentTime, key)
		return true
	}

	async createNotification(
		priority: PluginNotificationPriority,
		data: Omit<NotificationData, 'id' | 'timestamp' | 'pluginId'>,
	) {
		const writableData: Omit<NotificationData, 'id' | 'timestamp'> = {pluginId: this.pluginId, ...data}

		if (priority != PluginNotificationPriority.SILENT) {
			await browser.notifications.create({
				type: 'basic',
				title: data.title,
				message: data.description,
				priority: priority == PluginNotificationPriority.URGENT ? 2 : 0,
			})
		}

		await this.storedNotifications.putNotification(writableData)
	}
}

export class PluginsManager {
	private static PLUGIN_STORE_KEY_PREFIX = 'plugin_store:'

	private registeredPlugins: Map<String, PluginStoreManager>
	private enabledPlugins: Map<string, IPlugin>

	static createPluginStoreByPlugin(database: IDBPDatabase, plugin: IPluginFactory) {
		const storeName = PluginsManager.PLUGIN_STORE_KEY_PREFIX + plugin.getPluginId()

		if (database.objectStoreNames.contains(storeName)) {
			return
		}

		database.createObjectStore(storeName)
	}

	constructor(database: IDBPDatabase, plugins: IPluginFactory[], storedNotifications: StoredNotificationsManager) {
		this.registeredPlugins = new Map(
			plugins.map(p => {
				const pluginStoreKey = PluginsManager.PLUGIN_STORE_KEY_PREFIX + p.getPluginId()
				const pluginNotificationCreator = new PluginNotificationCreator(
					storedNotifications,
					p,
					database,
					pluginStoreKey,
				)
				return [p.getPluginId(), new PluginStoreManager(p, database, pluginStoreKey, pluginNotificationCreator)]
			}),
		)

		this.enabledPlugins = new Map()
	}

	async reloadAllSettings(): Promise<void> {
		this.enabledPlugins.clear()

		for (const plugin of this.registeredPlugins.values()) {
			if (!(await plugin.isEnabled())) {
				continue
			}

			this.enabledPlugins.set(plugin.plugin.getPluginId(), await plugin.newPluginInstance())
		}
	}

	getManagedPlugins(): PluginStoreManager[] {
		return [...this.registeredPlugins.values()]
	}

	getManagedPlugin(pluginId: string): PluginStoreManager {
		const result = this.registeredPlugins.get(pluginId)

		if (!result) {
			throw new Error(`Plugin with id ${pluginId} not found`)
		}

		return result
	}

	getEnabledPlugins(): IPlugin[] {
		return [...this.enabledPlugins.values()]
	}
}

export async function initializePluginsManager(
	notificationsManager: StoredNotificationsManager,
	plugins: IPluginFactory[],
	idbName: string = 'autowwwtest_plugins',
): Promise<PluginsManager> {
	const pluginIds = new Set(plugins.map(p => p.getPluginId()))

	if (pluginIds.size != pluginIds.size) {
		throw new Error('found plugins with conflicting plugin id')
	}

	const database = await openDB(idbName, Date.now(), {
		upgrade(db) {
			plugins.forEach(p => PluginsManager.createPluginStoreByPlugin(db, p))
		},
	})

	const manager = new PluginsManager(database, plugins, notificationsManager)
	await manager.reloadAllSettings()

	return manager
}
