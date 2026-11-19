/** Read JPEG dimensions without decoding pixels or trusting manifest dimensions. */
export function skillReferenceJpegSize(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  if (bytes.length > 131072 || bytes[0] !== 255 || bytes[1] !== 216)
    throw Error("Skill references require bounded JPEG bytes.");
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) throw Error("Invalid reference JPEG marker.");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw Error("Invalid reference JPEG segment.");
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker)
    ) {
      if (length < 8) throw Error("Invalid reference JPEG frame.");
      const height = bytes[offset + 3] * 256 + bytes[offset + 4],
        width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (
        !width ||
        !height ||
        width > 2048 ||
        height > 2048 ||
        width * height > 2097152
      )
        throw Error("Reference JPEG dimensions exceed the limit.");
      return { width, height };
    }
    offset += length;
  }
  throw Error("Reference JPEG frame header is missing.");
}
