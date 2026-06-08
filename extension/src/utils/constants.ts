export const ID = "ai-slop-detector";

export type MediaType = "image" | "audio" | "video";

export enum ExtensionAction {
  INJECT_BUTTONS = "INJECT_BUTTONS",
  OPEN_EXT_PAGE = "OPEN_EXT_PAGE",
  PROCESSING = "PROCESSING",
  CHECK_UPLOAD_FILE = "CHECK_UPLOAD_FILE",
  CHECK_UPLOAD_FILE_RESULT = "CHECK_UPLOAD_FILE_RESULT",
  CHECK_URL = "CHECK_URL",
  CHECK_URL_RESULT = "CHECK_URL_RESULT",
}

export interface UploadedFile {
  buffer: number[];
  filename: string;
  mimeType: string;
}

export interface CheckResult {
  is_ai: boolean;
  confidence: number;
}

// Map mimeType prefix → backend API path prefix
export const MEDIA_API_PREFIX: Record<MediaType, string> = {
  image: "image-analyze",
  audio: "audio-analyze",
  video: "video-analyze",
};
