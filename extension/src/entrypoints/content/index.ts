import { ContentScriptContext } from "wxt/utils/content-script-context";
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

async function injectButtonsToImage(
	ctx: ContentScriptContext,
	img: HTMLImageElement,
	injectState: InjectContext,
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

				// state for this ui opener
				let resultUiState: resultUiContext = {
					posX: e.clientX - 20,
					posY: e.clientY + window.scrollY,
					ui: null,
				};
				showUI(ctx, resultUiState, "hi");
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
) {
	if (injectState.isObserverActive) return;
	injectState.isObserverActive = true;
	const imageObserver = new IntersectionObserver(
		(entries, observer) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const img = entry.target as HTMLImageElement;
					injectButtonsToImage(ctx, img, injectState);
					observer.unobserve(img);
				}
			});
		},
		{ rootMargin: "200px", threshold: 0.1 },
	);

	injectState.imageObserver = imageObserver;

	const images = document.querySelectorAll("img");
	images.forEach((img) => {
		// discard icons and other small image
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
	text: string,
) {
	if (resultUiState.ui) resultUiState.ui.remove();

	resultUiState.ui = await createShadowRootUi(ctx, {
		name: "ai-detector-popup",
		position: "inline",
		anchor: document.body,
		append: "first",
        // TODO: ugly af
		onMount: (container) => {
			container.innerHTML = `
            <div class="ai-popup-container" style="top: ${resultUiState.posY}px; left: ${resultUiState.posX}px;">
              <span id="ai-text">${text}</span>
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

function updateUI(resultUiState: resultUiContext, text: string) {
	if (resultUiState.ui) {
		const textEl = resultUiState.ui.shadowRoot.querySelector("#ai-text");
		if (textEl) textEl.textContent = text;
	}
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
					// TODO: dummy
					case "show_loading":
						showUI(ctx, resultUiState, "Memproses gambar...");
						break;
					case ExtensionAction.INJECT_BUTTONS:
						startObservingImages(ctx, injectState);
						break;
					default:
						break;
				}
			},
		);
	},
});
