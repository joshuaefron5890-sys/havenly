import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app, auth } from './firebase';

// Both platforms are supported now — web through the browser's file input
// + canvas cropper (PhotoCropperModal), native through
// pickAndUploadNativePhoto's own OS-level picker + built-in crop step.
export function photoUploadSupported(): boolean {
  return true;
}

// Opens the browser's native file picker and resolves with the picked file,
// or null if the user closed the dialog without choosing one. Web only —
// there's no DOM File object or <input type="file"> on native, so native
// callers use pickAndUploadNativePhoto instead.
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

// Native counterpart to pickImageFile + PhotoCropperModal combined: asks
// for photo library permission, opens the OS's own picker with its own
// built-in (square) crop step — there's no canvas API on native to
// reimplement PhotoCropperModal's custom circular cropper. Pick-only (see
// pickAndUploadNativePhoto below for the upload-immediately wrapper) —
// callers that need to defer the actual upload (e.g.
// app/sitter-signup.tsx, where uploading requires a signed-in account
// that may not exist yet) can hold onto the returned blob/uri instead.
// Resolves null if the user cancels the picker. Throws 'permission-denied'
// if photo library access was refused.
export async function pickNativePhoto(): Promise<{ blob: Blob; uri: string } | null> {
  const ImagePicker = await import('expo-image-picker');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('permission-denied');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const uri = result.assets[0].uri;
  const response = await fetch(uri);
  const blob = await response.blob();
  return { blob, uri };
}

// Convenience wrapper for every caller that already has a signed-in
// account by the time a photo picker can even be reached (onboarding,
// invite acceptance, contributions) — pick then upload in one step.
export async function pickAndUploadNativePhoto(pathSuffix: string): Promise<string | null> {
  const picked = await pickNativePhoto();
  if (!picked) return null;
  return uploadPhotoBlob(picked.blob, pathSuffix);
}

// A certification/credential document isn't necessarily a photo — it's
// often a PDF or a Word doc exported from a certifying org — so this uses
// expo-document-picker's OS-level file picker (Files/iCloud Drive/Google
// Drive on native, the browser's own file picker on web — it has its own
// web implementation, unlike expo-image-picker) instead of restricting to
// the photo library. `type` narrows the system picker's own file-type
// filter; still validated again by extensionFromDocumentAsset below in
// case a picker UI lets the filter be bypassed. Resolves null if the user
// cancels.
//
// Imported statically above rather than via await import(...) (the
// pattern every other picker in this file uses) — expo export --platform
// web silently failed to split this specific dynamic import into its own
// loadable chunk (no "DocumentPicker-*.js" ever showed up among the
// exported web bundles, unlike expo-image-picker's own dynamic import,
// which does), so calling it at runtime threw "Requiring unknown module"
// instead of ever reaching this function's body. A static import sidesteps
// Metro's chunk-splitting for this module entirely.
const DOCUMENT_MIME_TYPES = [
  'image/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export type PickedDocument = {
  blob: Blob;
  name: string;
  mimeType?: string;
  // A locally-renderable preview URL — createObjectURL(blob) on web (asset.uri
  // there isn't reliably renderable), the picker's own file:// uri on native.
  previewUri: string;
};

// Pick-only — see pickNativePhoto's comment above for why this is a
// separate function from the upload-immediately wrapper below.
export async function pickDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_MIME_TYPES, multiple: false });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  // The web implementation attaches the already-in-hand File object
  // directly (asset.file) — only native needs the uri->blob round trip.
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const previewUri = Platform.OS === 'web' ? URL.createObjectURL(blob) : asset.uri;
  return { blob, name: asset.name, mimeType: asset.mimeType, previewUri };
}

export async function pickAndUploadDocument(pathPrefix: string): Promise<string | null> {
  const picked = await pickDocument();
  if (!picked) return null;
  const ext = extensionFromDocumentAsset(picked.name, picked.mimeType);
  return uploadPhotoBlob(picked.blob, `${pathPrefix}-${Date.now()}.${ext}`, picked.mimeType);
}

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
};

// Exported for app/sitter-signup.tsx, which needs the same extension label
// for a not-yet-uploaded pending document as docExtensionLabel derives from
// an already-uploaded URL.
export function extensionFromDocumentAsset(name: string, mimeType?: string): string {
  const fromName = name.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  return (mimeType && MIME_TYPE_EXTENSIONS[mimeType]) || 'dat';
}

// Uploads an already-cropped/resized image blob (see PhotoCropperModal), or
// any other file blob (see pickAndUploadDocument), to Storage under
// users/{uid}/{pathSuffix}, resolving with its download URL. contentType
// matters for a non-image file in particular — without it, Storage falls
// back to a generic binary type and a PDF/DOCX won't open correctly when
// viewed directly from its download URL.
export async function uploadPhotoBlob(blob: Blob, pathSuffix: string, contentType?: string): Promise<string> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !app) {
    throw new Error('not-configured');
  }
  const storage = getStorage(app);
  const fileRef = ref(storage, `users/${uid}/${pathSuffix}`);
  await uploadBytes(fileRef, blob, contentType ? { contentType } : undefined);
  return getDownloadURL(fileRef);
}
