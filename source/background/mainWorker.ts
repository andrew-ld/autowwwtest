import {mainWorkerApiMessageListener} from './mainWorkerApi'
import {initializeNotificationManager} from './notificationsManager'
import {CorsMisconfigPluginFactory} from './plugins/corsmisconfig'
import {DomainTakeoverPluginFactory} from './plugins/domaintakeover'
import {DotFilesLeakPluginFactory} from './plugins/dotfilesleak'
import {OpenRedirectPluginFactory} from './plugins/openredirect'
import {SecretsLeakPluginFactory} from './plugins/secretsleak'
import {initializePluginsManager, PluginsManager} from './pluginsManager'

function onBeforeRequestListener(pluginsManager: PluginsManager, details: browser.webRequest._OnBeforeRequestDetails) {
	if (details.type !== 'script' && details.type !== 'main_frame') {
		return
	}

	const filter = browser.webRequest.filterResponseData(details.requestId)

	filter.ondata = event => {
		pluginsManager.getEnabledPlugins().forEach(plugin => {
			plugin.onResponseBodyReceived(details, event).catch(console.error)
		})

		filter.write(event.data)
	}

	filter.onstop = () => {
		filter.disconnect()
	}
}

function onHeadersReceivedListener(
	pluginsManager: PluginsManager,
	details: browser.webRequest._OnHeadersReceivedDetails,
) {
	pluginsManager.getEnabledPlugins().forEach(plugin => {
		plugin.onResponseHeadersReceived(details).catch(console.error)
	})
}

function onErrorOccurredListener(pluginsManager: PluginsManager, details: browser.webRequest._OnErrorOccurredDetails) {
	pluginsManager.getEnabledPlugins().forEach(plugin => {
		plugin.onRequestErrorOccurred(details).catch(console.error)
	})
}

export async function initializeMainWorker(): Promise<void> {
	const notificationsManager = await initializeNotificationManager()

	const pluginsManager = await initializePluginsManager(notificationsManager, [
		new CorsMisconfigPluginFactory(),
		new SecretsLeakPluginFactory(),
		new OpenRedirectPluginFactory(),
		new DomainTakeoverPluginFactory(),
		new DotFilesLeakPluginFactory(),
	])

	browser.runtime.onMessage.addListener(async msg => {
		try {
			return {success: true, ...(await mainWorkerApiMessageListener(pluginsManager, notificationsManager, msg))}
		} catch (e) {
			console.error('error while process worker message', msg, e)
			return {success: false, error: (e as {message?: string})?.message || 'unknown'}
		}
	})

	browser.webRequest.onBeforeRequest.addListener(
		details => onBeforeRequestListener(pluginsManager, details),
		{urls: ['<all_urls>']},
		['blocking'],
	)

	browser.webRequest.onHeadersReceived.addListener(
		details => onHeadersReceivedListener(pluginsManager, details),
		{urls: ['<all_urls>']},
		['responseHeaders'],
	)

	browser.webRequest.onErrorOccurred.addListener(details => onErrorOccurredListener(pluginsManager, details), {
		urls: ['<all_urls>'],
	})
}
