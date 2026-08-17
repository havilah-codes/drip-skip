/**
 * Compresses an image client-side using the HTML5 Canvas API.
 * @param {File} file - The original image file selected by the user.
 * @param {number} maxDimension - Max width or height in pixels (default 2560px for Crisp Display).
 * @param {number} quality - Compression quality between 0 and 1 (default 0.92).
 * @returns {Promise<Blob>} - Resolves with the compressed image Blob.
 */
export async function compressImage(file, maxDimension = 2560, quality = 0.92) {
  return new Promise((resolve, reject) => {
    // If file is GIF or SVG, bypass canvas compression to avoid losing animation/vectors
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let { width, height } = img;

        // Skip resizing and return file directly if image dimensions and size are already small
        if (width <= maxDimension && height <= maxDimension && file.size < 1000000) {
          resolve(file);
          return;
        }

        // Calculate aspect ratio & resize
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

        const ctx = canvas.getContext('2d', { alpha: file.type !== 'image/jpeg' });
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Enable high-quality image resampling algorithms
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fill white background for transparent images converted to JPEG
        if (file.type === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Prefer image/webp for optimal quality-to-size ratio; fall back to original file type or JPEG
        let outputType = 'image/webp';
        
        // Use JPEG if browser doesn't support WebP export or file is native JPEG
        if (file.type === 'image/jpeg' || file.type === 'image/png') {
          outputType = file.type;
        }

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