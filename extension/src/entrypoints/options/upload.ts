type MediaType = "image" | "audio" | "video";

interface SelectedFile {
	file: File;
	type: MediaType;
	previewUrl: string;
}

const ACCEPTED: Record<MediaType, string[]> = {
	image: [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"image/svg+xml",
	],
	audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac"],
	video: ["video/mp4", "video/webm", "video/ogg", "video/mov", "video/avi"],
};

const FORMAT_LABELS: Record<MediaType, string[]> = {
	image: ["JPG", "PNG", "GIF", "WEBP", "SVG"],
	audio: ["MP3", "WAV", "OGG", "FLAC", "AAC"],
	video: ["MP4", "WEBM", "MOV", "AVI"],
};

const DROP_TITLES: Record<MediaType, string> = {
	image: "Seret gambar ke sini",
	audio: "Seret file audio ke sini",
	video: "Seret file video ke sini",
};

const MAX_SIZE_MB = 10 // 10 MB, i dont want overload my server
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

let activeTab: MediaType = "image";
let current: SelectedFile | null = null;

const dropZone = document.getElementById("dropZone") as HTMLDivElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const dropIcon = document.getElementById("dropIcon") as HTMLDivElement;
const dropTitle = document.getElementById("dropTitle") as HTMLHeadingElement;
const formatTags = document.getElementById("formatTags") as HTMLDivElement;
const fileCard = document.getElementById("fileCard") as HTMLDivElement;
const filePreview = document.getElementById("filePreview") as HTMLDivElement;
const fileName = document.getElementById("fileName") as HTMLDivElement;
const fileMeta = document.getElementById("fileMeta") as HTMLDivElement;
const changeBtn = document.getElementById("changeBtn") as HTMLButtonElement;
const processBtn = document.getElementById("processBtn") as HTMLButtonElement;
const processBtnLabel = document.getElementById(
	"processBtnLabel",
) as HTMLSpanElement;
const toast = document.getElementById("toast") as HTMLDivElement;

function cloneTemplate(id: string): DocumentFragment {
	return (document.getElementById(id) as HTMLTemplateElement).content.cloneNode(
		true,
	) as DocumentFragment;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${sizes[i]}`;
}

let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string): void {
	toast.textContent = msg;
	toast.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}


function setActiveTab(type: MediaType): void {
	activeTab = type;

	document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.type === type);
	});

	dropIcon.className = `drop-icon ${type}`;
	dropIcon.replaceChildren(cloneTemplate(`tpl-icon-${type}`));
	dropTitle.textContent = DROP_TITLES[type];
	fileInput.accept = ACCEPTED[type].join(",");

	formatTags.replaceChildren(
		...FORMAT_LABELS[type].map((label) => {
			const span = document.createElement("span");
			span.className = "format-tag";
			span.textContent = label;
			return span;
		}),
	);

	if (current) clearSelection();
}


function clearSelection(): void {
	if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
	current = null;

	document.getElementById("audioPlayerRow")?.remove();

	fileCard.hidden = true;
	processBtn.disabled = true;
}

function selectFile(file: File): void {
	const err = validate(file);
	if (err) {
		showToast(err);
		return;
	}

	if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);

	current = {
		file,
		type: activeTab,
		previewUrl: URL.createObjectURL(file),
	};

	renderCard();
}

function validate(file: File): string | null {
	if (!ACCEPTED[activeTab].includes(file.type))
		return `Format tidak valid. Gunakan ${FORMAT_LABELS[activeTab].join(", ")}.`;
	if (file.size > MAX_SIZE) return `Ukuran file melebihi batas ${MAX_SIZE_MB} MB.`;
	return null;
}


function renderCard(): void {
	if (!current) return;

	fileName.textContent = current.file.name;
	fileMeta.textContent = `${formatBytes(current.file.size)} · ${current.file.type}`;

	filePreview.className = `file-preview ${current.type}`;

	if (current.type === "image") {
		const frag = cloneTemplate("tpl-preview-image");
		const img = frag.querySelector("img") as HTMLImageElement;
		img.src = current.previewUrl;
		filePreview.replaceChildren(frag);
	} else if (current.type === "video") {
		const frag = cloneTemplate("tpl-preview-video");
		const vid = frag.querySelector("video") as HTMLVideoElement;
		vid.src = current.previewUrl;
		vid.addEventListener("loadedmetadata", () => {
			vid.currentTime = 1;
		});
		filePreview.replaceChildren(frag);
	} else {
		const frag = cloneTemplate("tpl-preview-audio");
		const iconWrap = frag.querySelector(
			".preview-audio-icon",
		) as HTMLDivElement;
		const audioEl = frag.querySelector("audio") as HTMLAudioElement;

		iconWrap.appendChild(cloneTemplate("tpl-icon-audio"));
		audioEl.src = current.previewUrl;

		filePreview.replaceChildren(iconWrap);

		document.getElementById("audioPlayerRow")?.remove();
		const row = document.createElement("div");
		row.id = "audioPlayerRow";
		row.className = "audio-player-row";
		row.appendChild(audioEl);
		fileCard.insertAdjacentElement("afterend", row);
	}

	fileCard.hidden = false;
	processBtn.disabled = false;
}


async function processFile(): Promise<void> {
	if (!current) return;

	processBtn.disabled = true;
	processBtnLabel.textContent = "Melakukan Check…";

	// TODO: offload to background script
	await new Promise((r) => setTimeout(r, 1800));

	processBtnLabel.textContent = "Check File";
	processBtn.disabled = false;
}


dropZone.addEventListener("dragover", (e) => {
	e.preventDefault();
	dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () =>
	dropZone.classList.remove("drag-over"),
);

dropZone.addEventListener("drop", (e) => {
	e.preventDefault();
	dropZone.classList.remove("drag-over");
	const file = e.dataTransfer?.files[0];
	if (file) selectFile(file);
});

fileInput.addEventListener("change", () => {
	const file = fileInput.files?.[0];
	if (file) {
		selectFile(file);
		fileInput.value = "";
	}
});

changeBtn.addEventListener("click", () => {
	clearSelection();
	fileInput.click();
});

processBtn.addEventListener("click", processFile);

document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		const type = btn.dataset.type as MediaType;
		if (type) setActiveTab(type);
	});
});


setActiveTab("image");
