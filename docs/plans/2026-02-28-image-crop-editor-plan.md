# Image Crop Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reusable client-side image crop/resize component using `react-easy-crop`, integrate it into the logo upload, and raise the file size limit to 10MB.

**Architecture:** A new `<ImageCropUpload>` component wraps `react-easy-crop` in a modal. The user picks a file, crops it via a circular mask with zoom/pan, and on confirm a hidden canvas exports a resized JPEG. The parent receives base64 and uploads it via the existing API (unchanged contract). The backend size limit is raised to 10MB for source images.

**Tech Stack:** React 19, Next.js 15, Tailwind CSS 4, `react-easy-crop`, HTML5 Canvas API

---

### Task 1: Install `react-easy-crop`

**Files:**
- Modify: `web/package.json`

**Step 1: Install the dependency**

Run: `cd web && npm install react-easy-crop`

**Step 2: Verify installation**

Run: `cd web && node -e "require('react-easy-crop'); console.log('OK')"`
Expected: "OK"

**Step 3: Commit**

```bash
git restore --staged :/ && git add "web/package.json" "web/package-lock.json" && git commit -m "deps: add react-easy-crop for image crop editor" -- web/package.json web/package-lock.json
```

---

### Task 2: Create the canvas crop helper utility

**Files:**
- Create: `web/src/lib/crop-image.ts`

This is a pure function that takes an image URL, crop area, and output size, draws onto a hidden canvas, and returns base64 JPEG.

**Step 1: Create the helper**

Create `web/src/lib/crop-image.ts`:

```typescript
/**
 * Crop an image to the given area and resize to outputSize × outputSize.
 * Returns a base64-encoded JPEG (without the data URL prefix).
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  outputSize: number = 200,
): Promise<string> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  // Export as JPEG, quality 0.85
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1]; // strip the data:image/jpeg;base64, prefix
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add "web/src/lib/crop-image.ts" && git commit -m "feat: add canvas crop helper utility" -- web/src/lib/crop-image.ts
```

---

### Task 3: Create the `<ImageCropUpload>` component

**Files:**
- Create: `web/src/components/ImageCropUpload.tsx`

**Step 1: Create the component**

Create `web/src/components/ImageCropUpload.tsx`:

```tsx
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
          PNG, JPG, SVG, or WebP. Max 10 MB.
        </p>
      </div>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add "web/src/components/ImageCropUpload.tsx" && git commit -m "feat: add ImageCropUpload component with circular crop and zoom" -- web/src/components/ImageCropUpload.tsx
```

---

### Task 4: Integrate into the settings page

**Files:**
- Modify: `web/src/app/settings/page.tsx` (lines 310-363 for handlers, lines 495-538 for JSX)

**Step 1: Replace the logo upload handlers and JSX**

In `web/src/app/settings/page.tsx`:

1. Add import at top:
```typescript
import ImageCropUpload from '@/components/ImageCropUpload';
```

2. Replace `handleLogoUpload` (lines 310-347) with a simpler handler that receives base64 directly from the crop component:
```typescript
  async function handleLogoUpload(base64: string) {
    setUploadingLogo(true);
    setLogoMsg('');
    try {
      const res = await apiFetch<{ key: string; value: string }>(
        '/api/settings/upload-logo',
        {
          method: 'POST',
          body: JSON.stringify({ data: base64, filename: 'logo.jpg' }),
        },
      );
      update('club_logo', res.value);
      setOriginal((prev) => ({ ...prev, club_logo: res.value }));
      setLogoMsg('Logo uploaded successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('413') || msg.toLowerCase().includes('too large')) {
        setLogoMsg('Logo too large. Please choose a smaller file.');
      } else {
        setLogoMsg(msg ? `Failed to upload logo: ${msg}` : 'Failed to upload logo.');
      }
    } finally {
      setUploadingLogo(false);
      setTimeout(() => setLogoMsg(''), 5000);
    }
  }
```

3. Keep `handleLogoRemove` unchanged (lines 349-363).

4. Replace the logo JSX block (lines 495-538) with:
```tsx
                <div>
                  <label className={labelClass}>Club Logo</label>
                  <ImageCropUpload
                    shape="round"
                    outputSize={200}
                    onCrop={handleLogoUpload}
                    onRemove={handleLogoRemove}
                    initialImage={
                      settings.club_logo
                        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${settings.club_logo}`
                        : undefined
                    }
                    disabled={uploadingLogo}
                  />
                  {logoMsg && (
                    <p
                      className={`mt-2 text-sm font-medium ${
                        logoMsg.includes('Failed') ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {logoMsg}
                    </p>
                  )}
                </div>
```

**Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git restore --staged :/ && git add "web/src/app/settings/page.tsx" && git commit -m "feat: integrate ImageCropUpload into settings logo upload" -- web/src/app/settings/page.tsx
```

---

### Task 5: Raise backend file size limit to 10MB

**Files:**
- Modify: `server/src/routes/settings.ts:76`

**Step 1: Update the size check**

In `server/src/routes/settings.ts`, line 76, change:
```typescript
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({ error: "File too large. Maximum 2MB." });
```
to:
```typescript
  if (buffer.length > 10 * 1024 * 1024) {
    res.status(400).json({ error: "File too large. Maximum 10MB." });
```

**Step 2: Verify server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run existing server tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git restore --staged :/ && git add "server/src/routes/settings.ts" && git commit -m "feat: raise logo upload size limit from 2MB to 10MB" -- server/src/routes/settings.ts
```

---

### Task 6: Build and manual verification

**Step 1: Build the web app**

Run: `cd web && npm run build`
Expected: Build succeeds with no errors

**Step 2: Run server tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 3: Manual smoke test**

Start dev servers and verify:
1. Open settings page
2. Click the file picker — select a large (5+ MB) photo
3. Crop editor appears with circular mask
4. Zoom slider works
5. Click "Crop & Upload" — logo saves and shows as preview
6. Click × remove button — logo is removed
7. Click "Change" while an image exists — opens crop editor again

**Step 4: Commit any fixes needed from smoke test**
