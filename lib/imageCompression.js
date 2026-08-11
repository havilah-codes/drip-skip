/**
 * Compresses an image client-side using the HTML5 Canvas API.
 * @param {File} file - The original image file selected by the user.
 * @param {number} maxDimension - Max width or height in pixels (default 1600px).
 * @param {number} quality - Compression quality between 0 and 1 (default 0.85).
 * @returns {Promise<Blob>} - Resolves with the compressed image Blob.
 */
export async function compressImage(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let { width, height } = img;

        // Calculate aspect ratio & resize if width or height exceeds maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas to WebP or JPEG blob
        const outputType = file.type === 'image/gif' ? 'image/gif' : 'image/jpeg';

        // Note: Animated GIFs retain first frame when drawn to canvas; if not GIF, output quality JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas compression failed'));
            }
          },
          outputType,
          quality
        );
      };

      img.onerror = (err) => reject(err);
    };

    reader.onerror = (err) => reject(err);
  });
}