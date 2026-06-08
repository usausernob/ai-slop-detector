import { ContentScriptContext } from "wxt/utils/content-script-context";
import { ExtensionAction, CheckResult } from "@/utils/constants";
import "./style.css";

type resultUiContext = {
	ui: any;
	posX: number;
	posY: number;
};

type InjectContext = {
	isObserverActive: boolean;
	activeUIs: any[];
	imageObserver: IntersectionObserver | null;
};

function getResultIcon(state: "loading" | "ai" | "human"): string {
	if (state === "loading") {
		return `
			<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
				<line x1="12" y1="2" x2="12" y2="6" />
				<line x1="12" y1="18" x2="12" y2="22" />
				<line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
				<line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
				<line x1="2" y1="12" x2="6" y2="12" />
				<line x1="18" y1="12" x2="22" y2="12" />
				<line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
				<line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
			</svg>
		`;
	}
	if (state === "ai") {
		return `
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
				<rect x="3" y="11" width="18" height="10" rx="2" />
				<circle cx="12" cy="5" r="2" />
				<path d="M12 7v4M8 15h.01M16 15h.01" />
			</svg>
		`;
	}
	return `
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
			<polyline points="22 4 12 14.01 9 11.01" />
		</svg>
	`;
}

async function injectButtonsToImage(
	ctx: ContentScriptContext,
	img: HTMLImageElement,
	injectState: InjectContext,
	resultUiState: resultUiContext,
) {
	if (img.dataset.aiSlopInjected) return;
	img.dataset.aiSlopInjected = "true";

	const wrapper = document.createElement("div");
	wrapper.className = "ai-slop-injected-btn";
	wrapper.style.position = "relative";
	wrapper.style.display = "inline-block";

	img.parentNode?.insertBefore(wrapper, img);
	wrapper.appendChild(img);

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

				btn.innerText = "⏳ Scanning...";
				btn.classList.add("scanning");

				console.log("Mengirim URL ke backend:", img.src);
				removeAllUIs(injectState);

				// update global state coordinate
				resultUiState.posX = e.clientX - 20;
				resultUiState.posY = e.clientY + window.scrollY;

				// show loading popup
				showUI(ctx, resultUiState, "loading");

				// call API check via background
				browser.runtime.sendMessage({
					action: ExtensionAction.CHECK_URL,
					payload: { url: img.src },
				}).catch((err) => console.error(err));
			});

			container.append(btn);
		},
	});

	ui.mount();

	injectState.activeUIs.push(ui);
}

function startObservingImages(
	ctx: ContentScriptContext,
	injectState: InjectContext,
	resultUiState: resultUiContext,
) {
	if (injectState.isObserverActive) return;
	injectState.isObserverActive = true;
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

	const images = document.querySelectorAll("img");
	images.forEach((img) => {
		if (img.width >= 100 && img.height >= 100) {
			imageObserver?.observe(img);
		}
	});
}

function removeAllUIs(injectState: InjectContext) {
	if (!injectState.isObserverActive) return;
	console.log("Menutup UI dan membersihkan halaman...");

	if (injectState.imageObserver) {
		injectState.imageObserver.disconnect();
		injectState.imageObserver = null;
	}
	injectState.isObserverActive = false;

	injectState.activeUIs.forEach((ui) => ui.remove());
	injectState.activeUIs = [];

	const wrappers = document.querySelectorAll(".ai-slop-injected-btn");
	wrappers.forEach((wrapper) => {
		const img = wrapper.querySelector("img");
		if (img) {
			delete img.dataset.aiSlopInjected;
			wrapper.parentNode?.insertBefore(img, wrapper);
		}
		wrapper.remove();
	});
}

async function showUI(
	ctx: ContentScriptContext,
	resultUiState: resultUiContext,
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
		iconHtml = `
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="16" x2="12" y2="12" />
				<line x1="12" y1="8" x2="12.01" y2="8" />
			</svg>
		`;
	}

	resultUiState.ui = await createShadowRootUi(ctx, {
		name: "ai-detector-popup",
		position: "inline",
		anchor: document.body,
		append: "first",
		onMount: (container) => {
			container.innerHTML = `
				<div class="${containerClass}" style="top: ${resultUiState.posY}px; left: ${resultUiState.posX}px;">
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

export default defineContentScript({
	matches: ["<all_urls>"],
	cssInjectionMode: "ui",

	async main(ctx) {
		let resultUiState: resultUiContext = {
			posX: 0,
			posY: 0,
			ui: null,
		};

		let injectState: InjectContext = {
			activeUIs: [],
			isObserverActive: false,
			imageObserver: null,
		};

		document.addEventListener("contextmenu", (e) => {
			resultUiState.posX = e.clientX;
			resultUiState.posY = e.clientY + window.scrollY;
		});

		browser.runtime.onMessage.addListener(
			async (message, sender, sendResponse) => {
				switch (message.action) {
					case "show_loading":
						showUI(ctx, resultUiState, "loading");
						break;
					case ExtensionAction.CHECK_URL_RESULT:
						const payload = message.payload;
						if (payload.status === "error") {
							showUI(ctx, resultUiState, "error", { error: payload.error });
						} else if (payload.result) {
							const isAi = payload.result.is_ai;
							showUI(ctx, resultUiState, isAi ? "ai" : "human", {
								confidence: payload.result.confidence,
							});
						}
						break;
					case ExtensionAction.INJECT_BUTTONS:
						startObservingImages(ctx, injectState, resultUiState);
						break;
					default:
						break;
				}
			},
		);
	},
});
