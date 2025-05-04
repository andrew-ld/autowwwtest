import {mainWorkerApiMessageListener} from './mainWorkerApi'
import {initializeNotificationManager} from './notificationsManager'
import {CorsMisconfigPluginFactory} from './plugins/corsmisconfig'
import {DomainTakeoverPluginFactory} from './plugins/domaintakeover'
import {DotFilesLeakPluginFactory} from './plugins/dotfilesleak'
import {OpenRedirectPluginFactory} from './plugins/openredirect'
import {SecretsLeakPluginFactory} from './plugins/secretsleak'
import {initializePluginsManager, PluginsManager} from './pluginsManager'

function shouldProcessRequest(details: {tabId: number}): boolean {
	if (details.tabId === -1) {
		return false
	}

	return true
}

function onBeforeRequestListener(pluginsManager: PluginsManager, details: browser.webRequest._OnBeforeRequestDetails) {
	if (!shouldProcessRequest(details)) {
		return
	}

	if (details.type !== 'script' && details.type !== 'main_frame') {
		return
	}

	const filter = browser.webRequest.filterResponseData(details.requestId)

	filter.ondata = event => {
		pluginsManager.getEnabledPlugins().forEach(plugin => {
			plugin.onResponseBodyReceived(details, event).catch(e => {
				console.log('plugin onResponseBodyReceived error', plugin, e)
			})
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
	if (!shouldProcessRequest(details)) {
		return
	}

	pluginsManager.getEnabledPlugins().forEach(plugin => {
		plugin.onResponseHeadersReceived(details).catch(e => {
			console.log('plugin onResponseHeadersReceived error', plugin, e)
		})
	})
}

function onErrorOccurredListener(pluginsManager: PluginsManager, details: browser.webRequest._OnErrorOccurredDetails) {
	if (!shouldProcessRequest(details)) {
		return
	}

	pluginsManager.getEnabledPlugins().forEach(plugin => {
		plugin.onRequestErrorOccurred(details).catch(e => {
			console.log('plugin onRequestErrorOccurred error', plugin, e)
		})
	})
}

function onBeforeSendHeadersListener(
	pluginsManager: PluginsManager,
	details: browser.webRequest._OnBeforeSendHeadersDetails,
) {
	if (!shouldProcessRequest(details)) {
		return
	}

	pluginsManager.getEnabledPlugins().forEach(plugin => {
		plugin.onRequestCreated(details).catch(e => {
			console.log('plugin onRequestCreated error', plugin, e)
		})
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

	browser.webRequest.onBeforeSendHeaders.addListener(details => onBeforeSendHeadersListener(pluginsManager, details), {
		urls: ['<all_urls>'],
	}, ['requestHeaders'])
}
