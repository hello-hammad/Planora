import { catalogAssetUrl } from '$lib/utils/catalogAssetUrl';

/** Preview images for finish swatches (same files the Properties panel shows). */
export const floorTexturePreview: Record<string, string> = {
  'light-oak': catalogAssetUrl('/textures/floor-light-oak.webp'), 'walnut': catalogAssetUrl('/textures/floor-walnut.webp'),
  'bamboo': catalogAssetUrl('/textures/floor-bamboo.webp'), 'laminate': catalogAssetUrl('/textures/floor-laminate.webp'),
  'ceramic-white': catalogAssetUrl('/textures/floor-tile-white.webp'), 'ceramic-gray': catalogAssetUrl('/textures/floor-tile-gray.webp'),
  'porcelain': catalogAssetUrl('/textures/floor-porcelain.webp'),
  'marble-white': catalogAssetUrl('/textures/floor-marble-white.webp'), 'marble-dark': catalogAssetUrl('/textures/floor-marble-dark.webp'),
  'carpet-beige': catalogAssetUrl('/textures/floor-carpet-beige.webp'), 'carpet-gray': catalogAssetUrl('/textures/floor-carpet-gray.webp'),
  'concrete': catalogAssetUrl('/textures/floor-concrete.webp'), 'slate': catalogAssetUrl('/textures/floor-slate.webp'),
  'vinyl': catalogAssetUrl('/textures/floor-vinyl.webp'),
};

export const wallTexturePreview: Record<string, string> = {
  'red-brick': catalogAssetUrl('/textures/brick.webp'), 'exposed-brick': catalogAssetUrl('/textures/exposed-brick.webp'),
  'stone': catalogAssetUrl('/textures/stone.webp'), 'wood-panel': catalogAssetUrl('/textures/wood-panel.webp'),
  'concrete-block': catalogAssetUrl('/textures/concrete.webp'), 'subway-tile': catalogAssetUrl('/textures/subway-tile.webp'),
};

/** CSS background for a finish swatch. */
export function swatchStyle(kind: 'wall' | 'floor', id: string | undefined, color: string | undefined): string {
  const url = id ? (kind === 'wall' ? wallTexturePreview[id] : floorTexturePreview[id]) : undefined;
  return url
    ? `background-image: url(${url}); background-size: cover; background-position: center;`
    : `background-color: ${color ?? '#e8e4dc'};`;
}
