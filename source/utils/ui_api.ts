import {GetWorkerMessageReturnType, WorkerMessages} from '../background/mainWorkerApi'

export async function sendMessageToWorker<T extends WorkerMessages>(
	message: T,
): Promise<GetWorkerMessageReturnType<T>> {
	const response = await browser.runtime.sendMessage(message)

	if (response?.success) {
		const {success, ...responseData} = response
		return responseData
	} else {
		throw new Error(response?.error || 'Unknown background script error')
	}
}
