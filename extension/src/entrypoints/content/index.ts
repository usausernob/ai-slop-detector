import { ContentScriptContext } from "wxt/utils/content-script-context";
import { ExtensionAction, MediaType } from "@/utils/constants";
import "./style.css";

type ResultUiContext = {
    ui: any;
    posX: number;
    posY: number;
};

type InjectContext = {
    isObserverActive: boolean;
    activeUIs: any[];
    imageObserver: IntersectionObserver | null;
    mediaObserver: IntersectionObserver | null;
};

// ─── Icons ───────────────────────────────────────────────────────────────────

function getResultIcon(state: "loading" | "ai" | "human"): string {
    if (state === "loading") {
        return `<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
			stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
			<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
			<line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
			<line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
			<line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
		</svg>`;
    }
    if (state === "ai") {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
			stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
			<rect x="3" y="11" width="18" height="10" rx="2"/>
			<circle cx="12" cy="5" r="2"/>
			<path d="M12 7v4M8 15h.01M16 15h.01"/>
		</svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
		stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
		<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
		<polyline points="22 4 12 14.01 9 11.01"/>
	</svg>`;
}

function getErrorIcon(): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
		stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
		<circle cx="12" cy="12" r="10"/>
		<line x1="12" y1="16" x2="12" y2="12"/>
		<line x1="12" y1="8" x2="12.01" y2="8"/>
	</svg>`;
}

// ─── Shared: show / update popup ─────────────────────────────────────────────

async function showUI(
    ctx: ContentScriptContext,
    resultUiState: ResultUiContext,
    state: "loading" | "ai" | "human" | "error",
    details?: { confidence?: number; error?: string },
) {
    if (resultUiState.ui) resultUiState.ui.remove();

    let containerClass = "ai-popup-container";
    let title = "";
    let desc = "";
    let iconHtml = "";
    let confidenceHtml = "";

    if (state === "loading") {
        containerClass += " state-loading";
        title = "Menganalisis...";
        desc = "Menghubungi AI Slop Detector...";
        iconHtml = getResultIcon("loading");
    } else if (state === "ai") {
        containerClass += " state-ai";
        title = "Terdeteksi AI";
        desc = "Berkas terindikasi hasil buatan AI.";
        iconHtml = getResultIcon("ai");
        if (details?.confidence !== undefined) {
            const pct = Math.round(details.confidence * 100);
            confidenceHtml = `<div class="ai-popup-confidence">${pct}%</div>`;
        }
    } else if (state === "human") {
        containerClass += " state-human";
        title = "Terdeteksi Asli";
        desc = "Karya asli manusia.";
        iconHtml = getResultIcon("human");
        if (details?.confidence !== undefined) {
            const pct = Math.round(details.confidence * 100);
            confidenceHtml = `<div class="ai-popup-confidence">${pct}%</div>`;
        }
    } else {
        containerClass += " state-error";
        title = "Gagal memindai";
        desc = details?.error || "Terjadi kesalahan tidak diketahui.";
        iconHtml = getErrorIcon();
    }

    resultUiState.ui = await createShadowRootUi(ctx, {
        name: "ai-detector-popup",
        position: "inline",
        anchor: document.body,
        append: "first",
        onMount: (container) => {
            container.innerHTML = `
				<div class="${containerClass}" style="top:${resultUiState.posY}px;left:${resultUiState.posX}px;">
					<div class="ai-popup-icon-wrap">${iconHtml}</div>
					<div class="ai-popup-info">
						<div class="ai-popup-title">${title}</div>
						<div class="ai-popup-desc">${desc}</div>
					</div>
					${confidenceHtml}
					<button id="ai-close-btn" class="ai-close-btn">&times;</button>
				</div>
			`;
            container
                .querySelector("#ai-close-btn")
                ?.addEventListener("click", () => {
                    resultUiState.ui.remove();
                });
        },
    });
    resultUiState.ui.mount();
}

// ─── Generic inject helper ────────────────────────────────────────────────────

async function injectScanButton(
    ctx: ContentScriptContext,
    el: HTMLElement,
    mediaType: MediaType,
    getSrc: () => string | null | undefined,
    injectState: InjectContext,
    resultUiState: ResultUiContext,
    dataAttr: string,
) {
    if (el.dataset[dataAttr]) return;
    el.dataset[dataAttr] = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "ai-slop-injected-btn";
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-block";

    el.parentNode?.insertBefore(wrapper, el);
    wrapper.appendChild(el);

    const ui = await createShadowRootUi(ctx, {
        name: "scan-btn-ui",
        position: "inline",
        anchor: wrapper,
        append: "last",
        onMount: (container) => {
            const btn = document.createElement("button");
            btn.innerText = "🔍 Scan AI";
            btn.className = "ai-slop-scan-btn";

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const src = getSrc();
                if (!src) return;

                btn.innerText = "⏳ Scanning...";
                btn.classList.add("scanning");

                removeAllUIs(injectState);

                resultUiState.posX = e.clientX - 20;
                resultUiState.posY = e.clientY + window.scrollY;

                showUI(ctx, resultUiState, "loading");

                browser.runtime
                    .sendMessage({
                        action: ExtensionAction.CHECK_URL,
                        payload: { url: src, mediaType },
                    })
                    .catch((err) => console.error(err));
            });

            container.append(btn);
        },
    });

    ui.mount();
    injectState.activeUIs.push(ui);
}

// ─── Per-type inject wrappers ─────────────────────────────────────────────────

async function injectButtonsToImage(
    ctx: ContentScriptContext,
    img: HTMLImageElement,
    injectState: InjectContext,
    resultUiState: ResultUiContext,
) {
    await injectScanButton(
        ctx,
        img,
        "image",
        () => img.src,
        injectState,
        resultUiState,
        "aiSlopInjected",
    );
}

async function injectButtonsToAudio(
    ctx: ContentScriptContext,
    audio: HTMLAudioElement,
    injectState: InjectContext,
    resultUiState: ResultUiContext,
) {
    await injectScanButton(
        ctx,
        audio,
        "audio",
        () => audio.src || audio.querySelector("source")?.src,
        injectState,
        resultUiState,
        "aiSlopAudioInjected",
    );
}

async function injectButtonsToVideo(
    ctx: ContentScriptContext,
    video: HTMLVideoElement,
    injectState: InjectContext,
    resultUiState: ResultUiContext,
) {
    await injectScanButton(
        ctx,
        video,
        "video",
        () => video.src || video.querySelector("source")?.src,
        injectState,
        resultUiState,
        "aiSlopVideoInjected",
    );
}

// ─── Observers ────────────────────────────────────────────────────────────────

function startObservingMedia(
    ctx: ContentScriptContext,
    injectState: InjectContext,
    resultUiState: ResultUiContext,
) {
    if (injectState.isObserverActive) return;
    injectState.isObserverActive = true;

    // Images
    const imageObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target as HTMLImageElement;
                    injectButtonsToImage(ctx, img, injectState, resultUiState);
                    observer.unobserve(img);
                }
            });
        },
        { rootMargin: "200px", threshold: 0.1 },
    );
    injectState.imageObserver = imageObserver;
    document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
        if (img.width >= 100 && img.height >= 100) imageObserver.observe(img);
    });

    // Audio + Video (shared observer)
    const mediaObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    if (el instanceof HTMLAudioElement) {
                        injectButtonsToAudio(ctx, el, injectState, resultUiState);
                    } else if (el instanceof HTMLVideoElement) {
                        injectButtonsToVideo(ctx, el, injectState, resultUiState);
                    }
                    observer.unobserve(el);
                }
            });
        },
        { rootMargin: "200px", threshold: 0.1 },
    );
    injectState.mediaObserver = mediaObserver;
    document.querySelectorAll<HTMLAudioElement>("audio").forEach((a) => {
        if (a.src || a.querySelector("source")) mediaObserver.observe(a);
    });
    document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
        if (v.src || v.querySelector("source")) mediaObserver.observe(v);
    });
}

function removeAllUIs(injectState: InjectContext) {
    if (!injectState.isObserverActive) return;

    injectState.imageObserver?.disconnect();
    injectState.imageObserver = null;
    injectState.mediaObserver?.disconnect();
    injectState.mediaObserver = null;
    injectState.isObserverActive = false;

    injectState.activeUIs.forEach((ui) => ui.remove());
    injectState.activeUIs = [];

    document.querySelectorAll(".ai-slop-injected-btn").forEach((wrapper) => {
        const child = wrapper.querySelector(
            "img, audio, video",
        ) as HTMLElement | null;
        if (child) {
            ["aiSlopInjected", "aiSlopAudioInjected", "aiSlopVideoInjected"].forEach(
                (k) => delete child.dataset[k],
            );
            wrapper.parentNode?.insertBefore(child, wrapper);
        }
        wrapper.remove();
    });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export default defineContentScript({
    matches: ["<all_urls>"],
    cssInjectionMode: "ui",

    async main(ctx) {
        const resultUiState: ResultUiContext = { posX: 0, posY: 0, ui: null };
        const injectState: InjectContext = {
            activeUIs: [],
            isObserverActive: false,
            imageObserver: null,
            mediaObserver: null,
        };

        document.addEventListener("contextmenu", (e) => {
            resultUiState.posX = e.clientX;
            resultUiState.posY = e.clientY + window.scrollY;
        });

        browser.runtime.onMessage.addListener(async (message) => {
            switch (message.action) {
                case "show_loading":
                    showUI(ctx, resultUiState, "loading");
                    break;

                case ExtensionAction.CHECK_URL_RESULT: {
                    const payload = message.payload;
                    if (payload.status === "error") {
                        showUI(ctx, resultUiState, "error", { error: payload.error });
                    } else if (payload.result) {
                        showUI(ctx, resultUiState, payload.result.is_ai ? "ai" : "human", {
                            confidence: payload.result.confidence,
                        });
                    }
                    break;
                }

                case ExtensionAction.INJECT_BUTTONS:
                    startObservingMedia(ctx, injectState, resultUiState);
                    break;

                default:
                    break;
            }
        });
    },
});
