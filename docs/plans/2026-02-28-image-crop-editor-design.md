# Image Crop Editor — Design Document

**Date:** 2026-02-28
**Status:** Approved

## Problem

The current image upload (club logo on settings page) is a raw file picker with no client-side processing. Users must prepare images externally — resize, crop to the right shape, and stay under a 2MB limit. Phone photos (5–8MB) are rejected outright. We need a client-side image editor that lets users crop, zoom, and resize images before upload.

## Decision

Use `react-easy-crop` — a lightweight (~15KB), React-native crop library with circular mask support, zoom/pan, and mobile-friendly pinch-to-zoom gestures.

**Alternatives considered:**
- Custom Canvas: zero dependencies but ~300–500 lines of manual implementation and touch handling
- cropperjs: feature-rich but heavier (~40KB) and overkill for circle-only crop

## Component Design

### `<ImageCropUpload>`

A reusable component that handles the full flow: file selection → crop → resize → output.

```
<ImageCropUpload>
  ├── File picker (click to browse)
  ├── Crop modal (appears when image is selected)
  │   ├── react-easy-crop (circular mask, zoom/pan)
  │   ├── Zoom slider
  │   └── Confirm / Cancel buttons
  └── Preview (cropped result thumbnail + remove button)
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `shape` | `"circle"` | `"circle"` | Crop mask shape (extensible to `"rect"` later) |
| `outputSize` | `number` | `200` | Target output dimension in pixels (square) |
| `maxFileSize` | `number` | `10 * 1024 * 1024` | Max source file size in bytes |
| `onCrop` | `(base64: string) => void` | required | Callback with final cropped+resized base64 |
| `onRemove` | `() => void` | required | Callback when user removes image |
| `initialImage` | `string?` | `undefined` | Existing image URL for edit mode |

### Data Flow

1. User picks a file (up to 10MB) via file input
2. File is validated (type + size) and read as a data URL
3. Crop editor opens in a modal with the image and circular overlay
4. User pans/zooms to frame the desired area
5. On "Confirm", a hidden `<canvas>` crops the visible region and resizes to `outputSize × outputSize`
6. Result exported as base64 JPEG (quality 0.85) — typically < 500KB
7. Parent receives the base64 via `onCrop()` and sends it to the existing backend API

### Supported File Types

PNG, JPG, JPEG, GIF, SVG, WebP (same as current).

## Backend Changes

- Raise upload validation limit from 2MB → 10MB (source files are larger, but processed output is small)
- No API contract changes — still receives base64 encoded image data

## Integration

- **Settings page (logo upload):** Replace raw `<input type="file">` with `<ImageCropUpload shape="circle" outputSize={200} />`
- **Future uses:** Drop the component into any page that needs image upload with appropriate props

## Dependencies

- `react-easy-crop` — npm package for the crop UI
- HTML5 Canvas API — for crop export and resize (built-in, no library needed)
