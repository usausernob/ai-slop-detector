import {
    ID,
    ExtensionAction,
    UploadedFile,
    MediaType,
    MEDIA_API_PREFIX,
} from "@/utils/constants";

const CONTEXT_MENU_IDS: Record<MediaType, string> = {
    image: `${ID}-image`,
    audio: `${ID}-audio`,
    video: `${ID}-video`,
};

function mimeToMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "image";
}

async function sendMessageToActiveTab(message: string) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTabId = tabs[0].id;
    if (activeTabId) {
        browser.tabs.sendMessage(activeTabId, { action: message });
    }
}

async function pollTaskStatus(taskId: string) {
    const POLL_INTERVAL = 2000;
    const TIMEOUT = 60000;
    const startTime = Date.now();
    await browser.runtime
        .sendMessage({ action: ExtensionAction.PROCESSING })
        .catch(() => { });

    const interval = setInterval(async () => {
        if (Date.now() - startTime > TIMEOUT) {
            clearInterval(interval);
            browser.runtime
                .sendMessage({
                    action: ExtensionAction.CHECK_UPLOAD_FILE_RESULT,
                    payload: { status: "error", error: "timeout" },
                })
                .catch(() => { });
            return;
        }
        try {
            const response = await fetch(
                `${import.meta.env.WXT_API_URL}/status/${taskId}`,
            );
            const data = await response.json();
            if (data.status === "completed" || data.status === "error") {
                clearInterval(interval);
                await browser.runtime.sendMessage({
                    action: ExtensionAction.CHECK_UPLOAD_FILE_RESULT,
                    payload: data,
                });
            }
        } catch (e) {
            console.error("Poll failed:", e);
        }
    }, POLL_INTERVAL);
}

async function pollUrlTaskStatus(taskId: string, tabId: number) {
    const POLL_INTERVAL = 2000;
    const TIMEOUT = 60000;
    const startTime = Date.now();

    const interval = setInterval(async () => {
        if (Date.now() - startTime > TIMEOUT) {
            clearInterval(interval);
            browser.tabs
                .sendMessage(tabId, {
                    action: ExtensionAction.CHECK_URL_RESULT,
                    payload: { status: "error", error: "timeout" },
                })
                .catch(() => { });
            return;
        }
        try {
            const response = await fetch(
                `${import.meta.env.WXT_API_URL}/status/${taskId}`,
            );
            const data = await response.json();
            if (data.status === "completed" || data.status === "error") {
                clearInterval(interval);
                await browser.tabs
                    .sendMessage(tabId, {
                        action: ExtensionAction.CHECK_URL_RESULT,
                        payload: data,
                    })
                    .catch(() => { });
            }
        } catch (e) {
            console.error("Poll URL status failed:", e);
        }
    }, POLL_INTERVAL);
}

async function checkUploadedFile(payload: UploadedFile) {
    const { buffer, filename, mimeType } = payload;
    const mediaType = mimeToMediaType(mimeType);
    const apiPrefix = MEDIA_API_PREFIX[mediaType];

    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, filename);

    try {
        const response = await fetch(
            `${import.meta.env.WXT_API_URL}/${apiPrefix}/`,
            {
                method: "POST",
                body: formData,
                headers: { "X-App-Token": import.meta.env.WXT_APP_TOKEN },
            },
        );
        const result = await response.json();
        pollTaskStatus(result.task_id);
    } catch (e) {
        console.error("Upload failed:", e);
    }
}

async function checkUrl(
    url: string,
    tabId: number,
    mediaType: MediaType = "image",
) {
    const apiPrefix = MEDIA_API_PREFIX[mediaType];
    try {
        const response = await fetch(
            `${import.meta.env.WXT_API_URL}/${apiPrefix}/url`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-App-Token": import.meta.env.WXT_APP_TOKEN,
                },
                body: JSON.stringify({ url }),
            },
        );
        const result = await response.json();
        console.log(result);
        pollUrlTaskStatus(result.task_id, tabId);
    } catch (e: any) {
        console.error("URL check failed:", e);
        browser.tabs
            .sendMessage(tabId, {
                action: ExtensionAction.CHECK_URL_RESULT,
                payload: { status: "error", error: e.message || "Request failed" },
            })
            .catch(() => { });
    }
}

export default defineBackground(() => {
    browser.runtime.onInstalled.addListener(() => {
        browser.contextMenus.create({
            id: CONTEXT_MENU_IDS.image,
            title: "Deteksi Gambar AI",
            contexts: ["image"],
        });
        browser.contextMenus.create({
            id: CONTEXT_MENU_IDS.audio,
            title: "Deteksi Audio AI",
            contexts: ["audio"],
        });
        browser.contextMenus.create({
            id: CONTEXT_MENU_IDS.video,
            title: "Deteksi Video AI",
            contexts: ["video"],
        });
    });

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
        if (!tab?.id || !info.srcUrl) return;

        if (info.menuItemId === CONTEXT_MENU_IDS.image) {
            browser.tabs.sendMessage(tab.id, { action: "show_loading" });
            checkUrl(info.srcUrl, tab.id, "image");
        } else if (info.menuItemId === CONTEXT_MENU_IDS.audio) {
            browser.tabs.sendMessage(tab.id, { action: "show_loading" });
            checkUrl(info.srcUrl, tab.id, "audio");
        } else if (info.menuItemId === CONTEXT_MENU_IDS.video) {
            browser.tabs.sendMessage(tab.id, { action: "show_loading" });
            checkUrl(info.srcUrl, tab.id, "video");
        }
    });

    browser.runtime.onMessage.addListener((message, sender) => {
        switch (message.action) {
            case ExtensionAction.INJECT_BUTTONS:
                sendMessageToActiveTab(message.action);
                break;
            case ExtensionAction.CHECK_UPLOAD_FILE:
                checkUploadedFile(message.payload as UploadedFile);
                break;
            case ExtensionAction.CHECK_URL:
                if (sender.tab?.id) {
                    const mediaType: MediaType = message.payload.mediaType ?? "image";
                    checkUrl(message.payload.url, sender.tab.id, mediaType);
                }
                break;
            default:
                break;
        }
    });
});
