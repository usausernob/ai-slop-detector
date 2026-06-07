import { ID, ExtensionAction } from "@/utils/constants";

async function sendMessageToActiveTab(message: string) {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	const activeTabId = tabs[0].id;
	if (activeTabId) {
		browser.tabs.sendMessage(activeTabId, {
			action: message,
		});
	}
}

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		browser.contextMenus.create({
			id: ID,
			title: "Deteksi Gambar AI",
			contexts: ["image"],
		});
	});

	browser.contextMenus.onClicked.addListener(async (info, tab) => {
		if (info.menuItemId === ID && info.srcUrl && tab?.id) {
			browser.tabs.sendMessage(tab.id, { action: "show_loading" });
		}
	});

	browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
		switch (message.action) {
			case ExtensionAction.INJECT_BUTTONS:
				sendMessageToActiveTab(message.action);
				break;

			default:
				break;
		}
	});
});
