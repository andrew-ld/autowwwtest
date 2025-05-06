import {NotificationData} from '../background/notificationsManager'
import {sendMessageToWorker} from '../utils/ui_api'

const NOTIFICATIONS_PER_PAGE = 50
const NOTIFICATION_MAX_URL_TITLE_LEN = 80

const notificationList = document.getElementById('notification-list') as HTMLUListElement
const loadMoreButton = document.getElementById('load-more-button') as HTMLButtonElement
const noMoreNotificationsDiv = document.getElementById('no-more-notifications') as HTMLDivElement
const pluginIdList = document.getElementById('plugin-id-list') as HTMLSelectElement

let currentOffset = 0
let hasMoreNotifications = true
let filterByPluginId: null | string = null

function formatTimestamp(timestamp: number): string {
	if (isNaN(timestamp) || timestamp <= 0) {
		return 'Invalid Date'
	}

	return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(timestamp))
}

function isHttpLink(url: string): boolean {
	try {
		const parsed = new URL(url)

		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			return true
		}
	} catch (e) {
		console.log('unable to parse', url, e)
	}

	return false
}

function createNotificationElement(notification: NotificationData): HTMLLIElement | undefined {
	const notificationId = notification.id

	if (notificationId === undefined) {
		return
	}

	const listItem = document.createElement('li')
	listItem.classList.add('notification-item')
	listItem.setAttribute('notification-id', String(notificationId))

	const titleElementDiv = document.createElement('div')
	titleElementDiv.classList.add('title-meta')

	const titleElement = document.createElement('h3')
	titleElement.textContent = notification.title
	titleElementDiv.appendChild(titleElement)

	const deleteButton = document.createElement('img')
	deleteButton.src = new URL('delete_26dp_000000_FILL0_wght400_GRAD0_opsz24.svg', import.meta.url).href
	deleteButton.setAttribute('data-action', 'delete')
	titleElementDiv.appendChild(deleteButton)

	listItem.appendChild(titleElementDiv)

	if (notification.url && isHttpLink(notification.url)) {
		const link = document.createElement('a')
		link.href = notification.url
		link.target = '_blank'
		link.rel = 'noopener noreferrer'
		const urlTitleElement = document.createElement('h3')
		urlTitleElement.textContent = notification.url.substring(0, NOTIFICATION_MAX_URL_TITLE_LEN)
		link.appendChild(urlTitleElement)
		listItem.appendChild(link)
	}

	if (notification.description) {
		const descriptionElement = document.createElement('p')
		descriptionElement.classList.add('description')
		descriptionElement.textContent = notification.description
		listItem.appendChild(descriptionElement)
	}

	const metaDiv = document.createElement('div')
	metaDiv.classList.add('meta')

	const pluginIdSpan = document.createElement('span')
	pluginIdSpan.textContent = `Plugin: ${notification.pluginId}`
	metaDiv.appendChild(pluginIdSpan)

	const timestampSpan = document.createElement('span')
	timestampSpan.textContent = formatTimestamp(notification.timestamp)
	metaDiv.appendChild(timestampSpan)

	listItem.appendChild(metaDiv)

	return listItem
}

async function fetchNotifications(): Promise<void> {
	if (!hasMoreNotifications) return

	loadMoreButton.disabled = true

	const notifications = await sendMessageToWorker({
		action: 'getNotifications',
		offset: currentOffset,
		limit: NOTIFICATIONS_PER_PAGE,
		pluginId: filterByPluginId,
	})

	const newNotifications: NotificationData[] = notifications.notifications
	const fragment = document.createDocumentFragment()

	newNotifications.forEach(notification => {
		const notificationEl = createNotificationElement(notification)

		if (notificationEl !== undefined) {
			fragment.appendChild(notificationEl)
		}
	})

	notificationList.appendChild(fragment)
	currentOffset += newNotifications.length

	if (newNotifications.length < NOTIFICATIONS_PER_PAGE) {
		hasMoreNotifications = false
	}

	loadMoreButton.disabled = !hasMoreNotifications
	loadMoreButton.style.display = hasMoreNotifications ? 'block' : 'none'
	noMoreNotificationsDiv.style.display = !hasMoreNotifications ? 'block' : 'none'
}

async function setPluginIdFilter(pluginId: string) {
	if (pluginId === 'all') {
		filterByPluginId = null
	} else {
		filterByPluginId = pluginId
	}
	hasMoreNotifications = true
	currentOffset = 0
	notificationList.innerHTML = ''
	loadMoreButton.disabled = true
	loadMoreButton.style.display = 'none'
	await fetchNotifications()
}

async function fetchPluginList(): Promise<void> {
	const plugins = await sendMessageToWorker({action: 'getPlugins'})

	plugins.plugins.forEach(p => {
		const option = document.createElement('option')
		option.text = p.id
		option.value = p.id
		pluginIdList.add(option)
	})

	pluginIdList.onchange = () => {
		setPluginIdFilter(pluginIdList.value)
	}
}

notificationList.addEventListener('click', async event => {
	const target = event.target as HTMLElement
	console.log(target.getAttribute('data-action'))
	if (target.getAttribute('data-action') !== 'delete') return

	const notificationEl = target.closest('.notification-item') as HTMLElement
	if (!notificationEl) return

	const notificationId = notificationEl.getAttribute('notification-id')!

	if (confirm('Are you sure you want to delete that notification?')) {
		await sendMessageToWorker({action: 'deleteNotification', notificationId: Number(notificationId)})
		notificationEl.style.display = 'none'
	}
})

loadMoreButton.addEventListener('click', fetchNotifications)

document.addEventListener('DOMContentLoaded', fetchNotifications)
document.addEventListener('DOMContentLoaded', fetchPluginList)
