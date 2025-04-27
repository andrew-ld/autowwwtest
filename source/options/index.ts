import {WorkerGetPluginsMessage, WorkerGetPluginsReturnType} from '../background/mainWorkerApi'
import {PluginSettingDefinition} from '../background/pluginsManager'
import {sendMessageToWorker} from '../utils/ui_api'

const pluginsContainerEl = document.getElementById('plugins-container') as HTMLElement

function createSettingInput(
	key: string,
	def: PluginSettingDefinition,
	value: any,
): HTMLInputElement | HTMLSelectElement {
	let input: any

	switch (def.type) {
		case 'boolean':
			input = document.createElement('input')
			input.type = 'checkbox'
			input.checked = value
			break
		case 'number':
			input = document.createElement('input')
			input.type = 'number'
			input.value = String(value)
			if (def.min !== undefined) input.min = String(def.min)
			if (def.max !== undefined) input.max = String(def.max)
			break
		case 'string':
			input = document.createElement('input')
			input.type = 'text'
			input.value = String(value)
			break
		case 'enum':
			input = document.createElement('select')
			def.values.forEach(val => {
				const option = document.createElement('option')
				option.value = val
				option.textContent = val
				if (val === value) option.selected = true
				input.appendChild(option)
			})
			break
	}
	input.id = `setting-${key}`
	input.setAttribute('data-setting-key', key)

	return input
}

function readPluginSettings(pluginEl: HTMLElement): Record<string, any> {
	const settings: Record<string, any> = {}

	pluginEl.querySelectorAll('[data-setting-key]').forEach(inputEl => {
		const key = inputEl.getAttribute('data-setting-key')!

		let value: any

		if (inputEl instanceof HTMLInputElement) {
			switch (inputEl.type) {
				case 'checkbox':
					value = inputEl.checked
					break
				case 'number':
					value = parseFloat(inputEl.value)
					break
				default:
					value = inputEl.value
					break
			}
		} else if (inputEl instanceof HTMLSelectElement) {
			value = inputEl.value
		} else {
			console.warn(`Unexpected input element type for key ${key}:`, inputEl)
			return
		}

		settings[key] = value
	})

	return settings
}

function renderPlugin(plugin: WorkerGetPluginsReturnType['plugins'][0]): HTMLElement {
	const pluginEl = document.createElement('div')
	pluginEl.classList.add('plugin')
	pluginEl.setAttribute('data-plugin-id', plugin.id)

	const headerEl = document.createElement('div')
	headerEl.classList.add('header')
	const nameEl = document.createElement('h2')
	nameEl.textContent = plugin.id
	headerEl.appendChild(nameEl)

	const toggleLabel = document.createElement('label')
	toggleLabel.textContent = 'Enabled:'
	const toggleInput = document.createElement('input')
	toggleInput.type = 'checkbox'
	toggleInput.checked = plugin.isEnabled
	toggleInput.setAttribute('data-action', 'toggle')
	headerEl.appendChild(toggleLabel)
	headerEl.appendChild(toggleInput)

	pluginEl.appendChild(headerEl)

	const settingsEl = document.createElement('div')
	settingsEl.classList.add('settings')

	Object.entries(plugin.definitions).forEach(([key, def]) => {
		const settingEl = document.createElement('div')
		settingEl.classList.add('setting')

		const labelEl = document.createElement('label')
		labelEl.textContent = `${key}:`
		labelEl.htmlFor = `setting-${key}`

		const inputEl = createSettingInput(key, def, plugin.settings[key])

		settingEl.appendChild(labelEl)
		settingEl.appendChild(inputEl)
		settingsEl.appendChild(settingEl)
	})
	pluginEl.appendChild(settingsEl)

	const actionsEl = document.createElement('div')
	actionsEl.classList.add('actions')

	const saveButton = document.createElement('button')
	saveButton.textContent = 'Save'
	saveButton.classList.add('save')
	saveButton.setAttribute('data-action', 'save')

	actionsEl.appendChild(saveButton)

	pluginEl.appendChild(actionsEl)

	return pluginEl
}

pluginsContainerEl.addEventListener('click', async event => {
	const target = event.target as HTMLElement
	const pluginEl = target.closest('.plugin') as HTMLElement
	if (!pluginEl) return

	const pluginId = pluginEl.getAttribute('data-plugin-id')!
	const action = target.getAttribute('data-action')

	if (action !== 'save') return

	const settings = readPluginSettings(pluginEl)

	await sendMessageToWorker({action: 'updatePluginSettings', settings: settings, pluginId: pluginId})

	await loadAndRenderPlugins()
	console.log(`Settings saved for plugin "${pluginId}".`)
})

pluginsContainerEl.addEventListener('change', async event => {
	const target = event.target as HTMLInputElement
	if (target.type !== 'checkbox' || target.getAttribute('data-action') !== 'toggle') return

	const pluginEl = target.closest('.plugin') as HTMLElement
	if (!pluginEl) return

	const pluginId = pluginEl.getAttribute('data-plugin-id')!
	const isEnabled = target.checked

	target.disabled = true

	await sendMessageToWorker({action: 'togglePlugin', pluginId: pluginId, enabled: isEnabled})

	await loadAndRenderPlugins()
	console.log(`Plugin "${pluginId}" toggled to ${isEnabled}.`)

	target.disabled = false
})

async function loadAndRenderPlugins(): Promise<void> {
	pluginsContainerEl.innerHTML = ''

	const response = await sendMessageToWorker({action: 'getPlugins'})

	response.plugins.forEach(plugin => {
		pluginsContainerEl.appendChild(renderPlugin(plugin))
	})
}

document.addEventListener('DOMContentLoaded', loadAndRenderPlugins)
