function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function canvasElementAxisAlignedBounds(element = {}) {
  const x = finite(element.x);
  const y = finite(element.y);
  const rawWidth = finite(element.width, 1);
  const rawHeight = finite(element.height, 1);
  const width = Math.max(1, Math.abs(rawWidth));
  const height = Math.max(1, Math.abs(rawHeight));
  const centerX = x + rawWidth / 2;
  const centerY = y + rawHeight / 2;
  const angle = finite(element.angle);
  if (!angle) {
    const left = centerX - width / 2;
    const top = centerY - height / 2;
    return { x: left, y: top, width, height, right: left + width, bottom: top + height };
  }

  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const rotatedWidth = width * cosine + height * sine;
  const rotatedHeight = width * sine + height * cosine;
  const left = centerX - rotatedWidth / 2;
  const top = centerY - rotatedHeight / 2;
  return {
    x: left,
    y: top,
    width: rotatedWidth,
    height: rotatedHeight,
    right: left + rotatedWidth,
    bottom: top + rotatedHeight,
  };
}
