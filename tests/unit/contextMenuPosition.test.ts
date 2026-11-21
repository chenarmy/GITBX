import { describe, expect, it } from 'vitest';
import { calculateContextMenuPosition } from '@/composables/useContextMenuPosition';

describe('calculateContextMenuPosition', () => {
  it('opens down and right when there is enough viewport space', () => {
    const pos = calculateContextMenuPosition({
      x: 120,
      y: 140,
      menuWidth: 240,
      menuHeight: 320,
      viewportWidth: 1280,
      viewportHeight: 800,
    });

    expect(pos).toEqual({
      left: 120,
      top: 140,
      maxWidth: 1264,
      maxHeight: 784,
      scrollable: false,
    });
  });

  it('flips upward when opened near the bottom edge of the window', () => {
    const pos = calculateContextMenuPosition({
      x: 120,
      y: 760,
      menuWidth: 240,
      menuHeight: 320,
      viewportWidth: 1280,
      viewportHeight: 800,
    });

    expect(pos.left).toBe(120);
    expect(pos.top).toBe(440);
    expect(pos.top + 320).toBeLessThanOrEqual(800 - 8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.scrollable).toBe(false);
  });

  it('flips leftward and upward when opened near the bottom-right corner', () => {
    const pos = calculateContextMenuPosition({
      x: 1250,
      y: 780,
      menuWidth: 260,
      menuHeight: 340,
      viewportWidth: 1280,
      viewportHeight: 800,
    });

    expect(pos.left).toBe(990);
    expect(pos.top).toBe(440);
    expect(pos.left + 260).toBeLessThanOrEqual(1280 - 8);
    expect(pos.top + 340).toBeLessThanOrEqual(800 - 8);
  });

  it('clamps tall menus into the visible viewport when neither above nor below fits', () => {
    const pos = calculateContextMenuPosition({
      x: 100,
      y: 420,
      menuWidth: 288,
      menuHeight: 540,
      viewportWidth: 900,
      viewportHeight: 600,
    });

    expect(pos.top).toBe(52);
    expect(pos.top + 540).toBe(592);
    expect(pos.scrollable).toBe(false);
  });

  it('enables scrolling and pins within padding when menu exceeds viewport height', () => {
    const pos = calculateContextMenuPosition({
      x: 100,
      y: 400,
      menuWidth: 288,
      menuHeight: 720,
      viewportWidth: 900,
      viewportHeight: 600,
    });

    expect(pos.top).toBe(8);
    expect(pos.maxHeight).toBe(584);
    expect(pos.scrollable).toBe(true);
  });

  it('clamps negative or out-of-bounds coordinates safely inside padding', () => {
    const pos = calculateContextMenuPosition({
      x: -50,
      y: -20,
      menuWidth: 220,
      menuHeight: 200,
      viewportWidth: 900,
      viewportHeight: 600,
    });

    expect(pos.left).toBe(8);
    expect(pos.top).toBe(8);
  });
});
