// Shrinks a phone photo in the browser (longest side 1600px, JPEG) so a teller upload is small and fast. Returns a Blob.
export async function shrinkPhoto(file, maxSide = 1600, quality = 0.82) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo (JPG, PNG or WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is too large (15 MB at most).');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not read that photo.');
  if (blob.size > 3 * 1024 * 1024) throw new Error('The photo is still too large after shrinking. Take it again closer.');
  return blob;
}
