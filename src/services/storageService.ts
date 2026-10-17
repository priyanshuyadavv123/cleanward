import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase.ts';

export interface ProcessedPhoto {
  blob: Blob;
  base64DataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Strips EXIF and GPS metadata by re-drawing the file onto an offscreen canvas,
 * scales it so maximum dimension is at most 1600px, and encodes as a high-quality JPEG.
 * Also ensures the compressed base64 string does not exceed 400 KB.
 */
export async function processAndStripExifPhoto(
  file: File | Blob,
  maxDimension = 1600
): Promise<ProcessedPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image element.'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Scale down if exceeding maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not acquire 2D canvas context.'));
          return;
        }

        // Fill white background for transparent PNGs
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Draw image onto canvas — this completely strips EXIF & GPS metadata
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with quality adaptation to ensure base64 <= 400 KB
        let quality = 0.82;
        let base64 = canvas.toDataURL('image/jpeg', quality);

        // Max 400 KB in base64 string length (~540,000 characters)
        const MAX_BASE64_BYTES = 400 * 1024;
        while (base64.length * 0.75 > MAX_BASE64_BYTES && quality > 0.4) {
          quality -= 0.1;
          base64 = canvas.toDataURL('image/jpeg', quality);
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas blob export failed.'));
              return;
            }
            resolve({
              blob,
              base64DataUrl: base64,
              width,
              height,
              sizeBytes: blob.size,
            });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Attempts to upload photo to Firebase Storage. If Storage is unavailable
 * or fails, falls back directly to returning the compressed base64 JPEG string (max 400 KB).
 */
export async function uploadReportPhoto(
  blob: Blob,
  fallbackBase64: string,
  storagePath: string
): Promise<string> {
  try {
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        sanitized: 'true',
        source: 'CleanWard',
      },
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.warn(
      'Firebase Storage unavailable or rejected upload; utilizing compressed base64 fallback:',
      error
    );
    return fallbackBase64;
  }
}
