import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { Platform } from 'react-native';
import { app, auth } from './firebase';

// Web-only for now, matching the rest of this app's web-first workflow —
// native image picking needs expo-image-picker, a separate piece of work.
export function photoUploadSupported(): boolean {
  return Platform.OS === 'web';
}

// Opens the browser's native file picker and resolves with the picked file,
// or null if the user closed the dialog without choosing one.
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

// Picks an image and uploads it to Storage under users/{uid}/{pathSuffix},
// resolving with its public download URL (or null if the user cancelled).
export async function pickAndUploadPhoto(pathSuffix: string): Promise<string | null> {
  if (!photoUploadSupported()) {
    throw new Error('not-supported-native');
  }
  const uid = auth?.currentUser?.uid;
  if (!uid || !app) {
    throw new Error('not-configured');
  }
  const file = await pickImageFile();
  if (!file) return null;

  const storage = getStorage(app);
  const fileRef = ref(storage, `users/${uid}/${pathSuffix}`);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}
