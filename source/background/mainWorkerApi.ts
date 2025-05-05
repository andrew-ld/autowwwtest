import {NotificationData, StoredNotificationsManager} from './notificationsManager'
import {IPluginFactory, PluginSettingDefinition, PluginsManager, SuggestedSettings} from './pluginsManager'

export interface WorkerMessageBase {
	action: string
}

export interface WorkerGetPluginsMessage extends WorkerMessageBase {
	action: 'getPlugins'
}

export interface WorkerGetPluginsReturnType {
	plugins: {
		id: string
		isEnabled: boolean
		settings: Record<string, any> & SuggestedSettings
		definitions: Record<string, PluginSettingDefinition>
	}[]
}

export interface WorkerTogglePluginMessage extends WorkerMessageBase {
	action: 'togglePlugin'
	enabled: boolean
	pluginId: string
}

export interface WorkerTogglePluginReturnType {}

export interface WorkerUpdatePluginSettingsMessage extends WorkerMessageBase {
	action: 'updatePluginSettings'
	pluginId: string
	settings: Record<string, any>
}

export interface WorkerUpdatePluginSettingsReturnType {}

export interface WorkerGetNotificationsMessage extends WorkerMessageBase {
	action: 'getNotifications'
	offset: number
	limit: number
	pluginId?: null | string
}

export interface WorkerGetNotificationsReturnType {
	notifications: NotificationData[]
}

export interface WorkerResetPluginSettingsMessage extends WorkerMessageBase {
	action: 'resetPlugin'
	pluginId: string
}

export interface WorkerResetPluginSettingsReturnType {}

export type WorkerMessages =
	| WorkerGetPluginsMessage
	| WorkerTogglePluginMessage
	| WorkerUpdatePluginSettingsMessage
	| WorkerGetNotificationsMessage
	| WorkerResetPluginSettingsMessage

export type GetWorkerMessageReturnType<T extends WorkerMessages> = T extends WorkerGetPluginsMessage
	? WorkerGetPluginsReturnType
	: T extends WorkerTogglePluginMessage
	? WorkerTogglePluginReturnType
	: T extends WorkerUpdatePluginSettingsMessage
	? WorkerUpdatePluginSettingsReturnType
	: T extends WorkerGetNotificationsMessage
	? WorkerGetNotificationsReturnType
	: T extends WorkerResetPluginSettingsMessage
	? WorkerResetPluginSettingsReturnType
	: never

async function handleGetPlugins(pluginsManager: PluginsManager): Promise<WorkerGetPluginsReturnType> {
	const plugins = await Promise.all(
		pluginsManager.getManagedPlugins().map(async plugin => ({
			id: plugin.plugin.getPluginId(),
			isEnabled: await plugin.isEnabled(),
			settings: await plugin.getSettingsWithDefaults(),
			definitions: IPluginFactory.getSettingsDefinitionsWithSuggestions(plugin.plugin),
		})),
	)
	return {plugins}
}

async function handleTogglePlugin(
	pluginsManager: PluginsManager,
	message: WorkerTogglePluginMessage,
): Promise<WorkerTogglePluginReturnType> {
	const plugin = pluginsManager.getManagedPlugin(message.pluginId)
	await plugin.setEnabled(message.enabled)
	await pluginsManager.reloadAllSettings()
	return {}
}

async function handleUpdatePluginSettings(
	pluginsManager: PluginsManager,
	message: WorkerUpdatePluginSettingsMessage,
): Promise<WorkerUpdatePluginSettingsReturnType> {
	const plugin = pluginsManager.getManagedPlugin(message.pluginId)
	await plugin.setSettings(message.settings)
	await pluginsManager.reloadAllSettings()
	return {}
}

async function handleGetNotifications(
	notificationsManager: StoredNotificationsManager,
	message: WorkerGetNotificationsMessage,
): Promise<WorkerGetNotificationsReturnType> {
	const notifications = await notificationsManager.fetchNotifications(message.limit, message.offset, message.pluginId)
	return {notifications}
}

async function handleResetPlugin(
	pluginsManager: PluginsManager,
	message: WorkerResetPluginSettingsMessage,
): Promise<WorkerResetPluginSettingsReturnType> {
	const plugin = pluginsManager.getManagedPlugin(message.pluginId)
	await plugin.setSettings(plugin.buildDefaultSettings())
	await pluginsManager.reloadAllSettings()
	return {}
}

export function mainWorkerApiMessageListener(
	pluginsManager: PluginsManager,
	notificationsManager: StoredNotificationsManager,
	message: WorkerMessages,
): Promise<GetWorkerMessageReturnType<WorkerMessages>> {
	switch (message.action) {
		case 'getPlugins':
			return handleGetPlugins(pluginsManager)
		case 'togglePlugin':
			return handleTogglePlugin(pluginsManager, message)
		case 'updatePluginSettings':
			return handleUpdatePluginSettings(pluginsManager, message)
		case 'getNotifications':
			return handleGetNotifications(notificationsManager, message)
		case 'resetPlugin':
			return handleResetPlugin(pluginsManager, message)
	}
}
