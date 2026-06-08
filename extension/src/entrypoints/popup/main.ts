import { ExtensionAction } from "@/utils/constants";
import "./style.css";

document.addEventListener("DOMContentLoaded", () => {
	const btnInject = document.getElementById("btn-inject");
	const btnUpload = document.getElementById("btn-upload");
	btnInject?.addEventListener("click", async () => {
		await browser.runtime.sendMessage({
			action: ExtensionAction.INJECT_BUTTONS,
		});
	});

	btnUpload?.addEventListener("click", async () => {
		browser.runtime.openOptionsPage();
	});
});
