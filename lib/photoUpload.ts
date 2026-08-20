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
// reimplement PhotoCropperModal's custom circular cropper — then uploads
// the result directly. Resolves null if the user cancels the picker.
// Throws 'permission-denied' if photo library access was refused.
export async function pickAndUploadNativePhoto(pathSuffix: string): Promise<string | null> {
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
  const response = await fetch(result.assets[0].uri);
  const blob = await response.blob();
  return uploadPhotoBlob(blob, pathSuffix);
}

// Uploads an already-cropped/resized image blob (see PhotoCropperModal) to
// Storage under users/{uid}/{pathSuffix}, resolving with its download URL.
export async function uploadPhotoBlob(blob: Blob, pathSuffix: string): Promise<string> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !app) {
    throw new Error('not-configured');
  }
  const storage = getStorage(app);
  const fileRef = ref(storage, `users/${uid}/${pathSuffix}`);
  await uploadBytes(fileRef, blob);
  return getDownloadURL(fileRef);
}
