import {initializeMainWorker} from './mainWorker'

function initializationMessageHandler(): Promise<{workerInitializationInProgress: boolean}> {
	return Promise.resolve({workerInitializationInProgress: true})
}

browser.runtime.onMessage.addListener(initializationMessageHandler)

initializeMainWorker()
	.catch(e => {
		console.log('unable to initialize main worker', e)
	})
	.finally(() => {
		browser.runtime.onMessage.removeListener(initializationMessageHandler)
	})
