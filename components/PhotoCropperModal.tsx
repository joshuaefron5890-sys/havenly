import { useEffect, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const PREVIEW_SIZE = 220;
const OUTPUT_SIZE = 480;
const SLIDER_WIDTH = 220;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(-max, value));
}

// Lets the user pan and zoom a picked photo within a circular preview before
// it uploads — both crops it to the visible framing and downsizes it to a
// fixed, reasonable resolution, instead of uploading the raw picked file.
export function PhotoCropperModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const naturalSizeRef = useRef(naturalSize);
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    naturalSizeRef.current = naturalSize;
  }, [naturalSize]);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setNaturalSize(null);
      setZoom(MIN_ZOOM);
      setPan({ x: 0, y: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    const img = new window.Image();
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = naturalSize ? Math.max(PREVIEW_SIZE / naturalSize.width, PREVIEW_SIZE / naturalSize.height) : 1;
  const scale = baseScale * zoom;
  const dispW = naturalSize ? naturalSize.width * scale : PREVIEW_SIZE;
  const dispH = naturalSize ? naturalSize.height * scale : PREVIEW_SIZE;
  const maxPanX = Math.max(0, (dispW - PREVIEW_SIZE) / 2);
  const maxPanY = Math.max(0, (dispH - PREVIEW_SIZE) / 2);

  const imagePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartRef.current = { ...panRef.current };
      },
      onPanResponderMove: (_evt, gesture) => {
        const size = naturalSizeRef.current;
        if (!size) return;
        const s = Math.max(PREVIEW_SIZE / size.width, PREVIEW_SIZE / size.height) * zoomRef.current;
        const w = size.width * s;
        const h = size.height * s;
        const mx = Math.max(0, (w - PREVIEW_SIZE) / 2);
        const my = Math.max(0, (h - PREVIEW_SIZE) / 2);
        const next = {
          x: clamp(panStartRef.current.x + gesture.dx, mx),
          y: clamp(panStartRef.current.y + gesture.dy, my),
        };
        panRef.current = next;
        setPan(next);
      },
    })
  ).current;

  const applyZoom = (nextZoom: number) => {
    const size = naturalSizeRef.current;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    if (!size) return;
    const s = Math.max(PREVIEW_SIZE / size.width, PREVIEW_SIZE / size.height) * nextZoom;
    const w = size.width * s;
    const h = size.height * s;
    const mx = Math.max(0, (w - PREVIEW_SIZE) / 2);
    const my = Math.max(0, (h - PREVIEW_SIZE) / 2);
    const next = { x: clamp(panRef.current.x, mx), y: clamp(panRef.current.y, my) };
    panRef.current = next;
    setPan(next);
  };

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const t = Math.min(1, Math.max(0, evt.nativeEvent.locationX / SLIDER_WIDTH));
        applyZoom(MIN_ZOOM + t * (MAX_ZOOM - MIN_ZOOM));
      },
    })
  ).current;

  const handleConfirm = () => {
    if (!imageUrl || !naturalSize) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => {
      const srcSize = PREVIEW_SIZE / scale;
      const srcX = naturalSize.width / 2 - srcSize / 2 - pan.x / scale;
      const srcY = naturalSize.height / 2 - srcSize / 2 - pan.y / scale;
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      canvas.toBlob(
        (blob) => {
          if (blob) onConfirm(blob);
        },
        'image/jpeg',
        0.9
      );
    };
    img.src = imageUrl;
  };

  const thumbPosition = ((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * SLIDER_WIDTH;

  return (
    <Modal visible={Boolean(file)} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Adjust photo</Text>

          <View style={styles.previewWrap} {...imagePanResponder.panHandlers}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={[
                  styles.image,
                  {
                    width: dispW,
                    height: dispH,
                    left: (PREVIEW_SIZE - dispW) / 2 + pan.x,
                    top: (PREVIEW_SIZE - dispH) / 2 + pan.y,
                  },
                ]}
              />
            ) : null}
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Zoom</Text>
            <View style={styles.sliderTrack} {...sliderPanResponder.panHandlers}>
              <View style={styles.sliderFill} />
              <View style={[styles.sliderThumb, { left: thumbPosition - 9 }]} />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={!naturalSize}>
              <Text style={styles.confirmText}>Use photo</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 300,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  previewWrap: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: colors.accentMuted,
  },
  image: {
    position: 'absolute',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  sliderLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sliderTrack: {
    width: SLIDER_WIDTH,
    height: 24,
    justifyContent: 'center',
  },
  sliderFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.surface,
  },
});
