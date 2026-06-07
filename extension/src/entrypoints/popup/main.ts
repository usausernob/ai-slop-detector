import { ExtensionAction } from "@/utils/constants";
import "./style.css";

document.addEventListener("DOMContentLoaded", () => {
	const btnInject = document.getElementById("btn-inject");

	btnInject?.addEventListener("click", async () => {
		await browser.runtime.sendMessage({
			action: ExtensionAction.INJECT_BUTTONS,
		});
	});
});
