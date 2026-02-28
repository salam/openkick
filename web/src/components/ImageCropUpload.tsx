'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '@/lib/crop-image';

interface ImageCropUploadProps {
  /** Crop mask shape */
  shape?: 'round' | 'rect';
  /** Output image dimension in pixels (square) */
  outputSize?: number;
  /** Max source file size in bytes (default 10MB) */
  maxFileSize?: number;
  /** Callback with base64-encoded cropped image (no prefix) */
  onCrop: (base64: string) => void;
  /** Callback when user removes the image */
  onRemove: () => void;
  /** Existing image URL for preview/edit mode */
  initialImage?: string;
  /** Whether the parent is currently uploading */
  disabled?: boolean;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
const MAX_FILE_SIZE_DEFAULT = 10 * 1024 * 1024; // 10MB

export default function ImageCropUpload({
  shape = 'round',
  outputSize = 200,
  maxFileSize = MAX_FILE_SIZE_DEFAULT,
  onCrop,
  onRemove,
  initialImage,
  disabled = false,
}: ImageCropUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState('');

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Invalid file type. Use PNG, JPG, GIF, SVG, or WebP.');
      return;
    }

    if (file.size > maxFileSize) {
      const mbLimit = Math.round(maxFileSize / (1024 * 1024));
      setError(`File too large. Maximum ${mbLimit} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsDataURL(file);
  }

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return;
    try {
      const base64 = await getCroppedImg(imageSrc, croppedAreaPixels, outputSize);
      onCrop(base64);
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      setError('Failed to crop image. Please try again.');
    }
  }

  function handleCancel() {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError('');
  }

  // Crop modal is open
  if (imageSrc) {
    return (
      <div className="space-y-3">
        <div className="relative h-64 w-full rounded-lg border border-gray-200 bg-gray-900 overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={shape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 whitespace-nowrap">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Crop &amp; Upload
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    );
  }

  // Preview mode (has existing image)
  if (initialImage) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={initialImage}
              alt="Current image"
              className={`h-16 w-16 border border-gray-200 object-cover bg-white ${shape === 'round' ? 'rounded-full' : 'rounded-lg'}`}
            />
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs leading-none shadow hover:bg-red-600 disabled:opacity-50"
              title="Remove image"
            >
              &times;
            </button>
          </div>
          <div>
            <label className="inline-block cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              Change
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.svg,.webp"
                onChange={handleFileSelect}
                disabled={disabled}
                className="hidden"
              />
            </label>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    );
  }

  // No image — show file picker
  return (
    <div className="space-y-2">
      <div>
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.svg,.webp"
          onChange={handleFileSelect}
          disabled={disabled}
          className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-50"
        />
        <p className="mt-1 text-xs text-gray-400">
          PNG, JPG, SVG, or WebP. Max {Math.round(maxFileSize / (1024 * 1024))} MB.
        </p>
      </div>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
