import {GetWorkerMessageReturnType, WorkerMessages} from '../background/mainWorkerApi'

export async function sendMessageToWorker<T extends WorkerMessages>(
	message: T,
): Promise<GetWorkerMessageReturnType<T>> {
	let response

	while (true) {
		response = await browser.runtime.sendMessage(message)

		if (!response?.workerInitializationInProgress) {
			break
		}

		await new Promise(f => setTimeout(f, 100))
	}

	if (response?.success) {
		const {success, ...responseData} = response
		return responseData
	} else {
		throw new Error(response?.error || 'Unknown background script error')
	}
}
