import { computed, nextTick, onMounted, onUnmounted, ref, toValue, watch, type CSSProperties, type MaybeRefOrGetter, type Ref } from 'vue';

export interface ContextMenuAnchor {
  x: number;
  y: number;
}

export interface ContextMenuPositionInput {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
}

export interface ContextMenuPositionResult {
  left: number;
  top: number;
  maxHeight: number;
  maxWidth: number;
  scrollable: boolean;
}

export interface UseContextMenuPositionOptions {
  padding?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
}

export function calculateContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  padding = 8,
}: ContextMenuPositionInput): ContextMenuPositionResult {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safeViewportHeight = Math.max(0, viewportHeight);
  const maxWidth = Math.max(0, safeViewportWidth - padding * 2);
  const maxHeight = Math.max(0, safeViewportHeight - padding * 2);

  const effectiveWidth = Math.min(Math.max(0, menuWidth), maxWidth);
  const effectiveHeight = Math.min(Math.max(0, menuHeight), maxHeight);

  let left = x;
  if (x + effectiveWidth > safeViewportWidth - padding) {
    if (x - effectiveWidth >= padding) {
      left = x - effectiveWidth;
    } else {
      left = safeViewportWidth - padding - effectiveWidth;
    }
  }
  const maxLeft = Math.max(padding, safeViewportWidth - padding - effectiveWidth);
  left = Math.max(padding, Math.min(left, maxLeft));

  let top = y;
  if (y + effectiveHeight > safeViewportHeight - padding) {
    if (y - effectiveHeight >= padding) {
      top = y - effectiveHeight;
    } else {
      top = safeViewportHeight - padding - effectiveHeight;
    }
  }
  const maxTop = Math.max(padding, safeViewportHeight - padding - effectiveHeight);
  top = Math.max(padding, Math.min(top, maxTop));

  return {
    left: Math.round(left),
    top: Math.round(top),
    maxHeight: Math.round(maxHeight),
    maxWidth: Math.round(maxWidth),
    scrollable: menuHeight > maxHeight,
  };
}

export function useContextMenuPosition(
  menuRef: Ref<HTMLElement | null>,
  anchor: MaybeRefOrGetter<ContextMenuAnchor | null | undefined>,
  options: UseContextMenuPositionOptions = {},
) {
  const padding = options.padding ?? 8;
  const fallbackWidth = options.fallbackWidth ?? 240;
  const fallbackHeight = options.fallbackHeight ?? 280;

  const measuredSize = ref<{ width: number; height: number } | null>(null);
  const viewport = ref({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  function syncViewport() {
    if (typeof window === 'undefined') return;
    viewport.value = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function measureMenu() {
    syncViewport();
    const el = menuRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = el.offsetWidth || Math.ceil(rect.width) || fallbackWidth;
    const borderY = Math.max(0, el.offsetHeight - el.clientHeight);
    const height = Math.max(el.offsetHeight, el.scrollHeight + borderY) || Math.ceil(rect.height) || fallbackHeight;
    measuredSize.value = { width, height };
  }

  let resizeObserver: ResizeObserver | null = null;

  function disconnectObserver() {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  function observeMenu(el: HTMLElement | null) {
    disconnectObserver();
    if (!el || typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => {
      measureMenu();
    });
    resizeObserver.observe(el);
  }

  watch(
    [
      menuRef,
      () => {
        const current = toValue(anchor);
        return current ? `${current.x}:${current.y}` : null;
      },
    ],
    ([el, key]) => {
      if (!key) {
        measuredSize.value = null;
        disconnectObserver();
        return;
      }
      observeMenu(el);
      void nextTick(() => {
        measureMenu();
      });
    },
    { flush: 'post', immediate: true },
  );

  onMounted(() => {
    syncViewport();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', measureMenu);
    }
    if (menuRef.value) {
      observeMenu(menuRef.value);
      measureMenu();
    }
  });

  onUnmounted(() => {
    disconnectObserver();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', measureMenu);
    }
  });

  const menuStyle = computed<CSSProperties>(() => {
    const current = toValue(anchor);
    if (!current) return {};
    const width = measuredSize.value?.width ?? fallbackWidth;
    const height = measuredSize.value?.height ?? fallbackHeight;
    const pos = calculateContextMenuPosition({
      x: current.x,
      y: current.y,
      menuWidth: width,
      menuHeight: height,
      viewportWidth: viewport.value.width,
      viewportHeight: viewport.value.height,
      padding,
    });
    return {
      left: `${pos.left}px`,
      top: `${pos.top}px`,
      maxHeight: `${pos.maxHeight}px`,
      maxWidth: `${pos.maxWidth}px`,
      overflowY: 'auto',
      overflowX: 'hidden',
    };
  });

  return {
    menuStyle,
    updatePosition: measureMenu,
  };
}
