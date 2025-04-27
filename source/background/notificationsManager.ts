import {openDB, IDBPDatabase} from 'idb'

export interface NotificationData {
	id?: number
	url: string
	title: string
	description: string
	pluginId: string
	timestamp: number
}

export class StoredNotificationsManager {
	static NOTIFICATIONS_STORE_NAME = 'notifications'
	static TIMESTAMP_INDEX_NAME = 'timestamp'
	static PLUGIN_ID_TIMESTAMP_INDEX_NAME = 'pluginId-timestamp'

	private database: IDBPDatabase

	constructor(database: IDBPDatabase) {
		this.database = database
	}

	async putNotification(notification: Omit<NotificationData, 'timestamp' | 'id'>): Promise<number> {
		const notificationWithTimestamp: Omit<NotificationData, 'id'> = {
			...notification,
			timestamp: Date.now(),
		}

		const tx = this.database.transaction(StoredNotificationsManager.NOTIFICATIONS_STORE_NAME, 'readwrite')
		const store = tx.objectStore(StoredNotificationsManager.NOTIFICATIONS_STORE_NAME)

		const key = await store.put(notificationWithTimestamp)
		await tx.done

		return key as number
	}

	async fetchNotifications(
		limit: number = 10,
		offset: number = 0,
		pluginId?: string | null,
	): Promise<NotificationData[]> {
		const tx = this.database.transaction(StoredNotificationsManager.NOTIFICATIONS_STORE_NAME, 'readonly')
		const store = tx.objectStore(StoredNotificationsManager.NOTIFICATIONS_STORE_NAME)
		const results: NotificationData[] = []

		let index
		let range

		if (pluginId) {
			index = store.index(StoredNotificationsManager.PLUGIN_ID_TIMESTAMP_INDEX_NAME)
			range = IDBKeyRange.bound([pluginId, 0], [pluginId, Number.MAX_SAFE_INTEGER])
		} else {
			index = store.index(StoredNotificationsManager.TIMESTAMP_INDEX_NAME)
			range = null
		}

		let cursor = await index.openCursor(range, 'prev')

		if (offset > 0 && cursor) {
			await cursor.advance(offset)
		}

		while (cursor && results.length < limit) {
			results.push(cursor.value as NotificationData)
			cursor = await cursor.continue()
		}

		await tx.done
		return results
	}
}

export async function initializeNotificationManager(
	idbName: string = 'autowwwtest_notifications',
): Promise<StoredNotificationsManager> {
	const database = await openDB(idbName, 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(StoredNotificationsManager.NOTIFICATIONS_STORE_NAME)) {
				const store = db.createObjectStore(StoredNotificationsManager.NOTIFICATIONS_STORE_NAME, {
					autoIncrement: true,
					keyPath: 'id',
				})

				store.createIndex(StoredNotificationsManager.TIMESTAMP_INDEX_NAME, 'timestamp')
				store.createIndex(StoredNotificationsManager.PLUGIN_ID_TIMESTAMP_INDEX_NAME, ['pluginId', 'timestamp'])
			}
		},
	})

	const manager = new StoredNotificationsManager(database)

	return manager
}
