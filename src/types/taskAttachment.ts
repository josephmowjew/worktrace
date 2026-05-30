export type TaskAttachment = {
  id: string;
  taskId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskAttachmentPreview = {
  id: string;
  dataUrl: string;
  mimeType: string;
};
