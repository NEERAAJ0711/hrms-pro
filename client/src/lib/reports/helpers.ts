export const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const REPORTS_ALLOWED_ROLES = ["super_admin", "company_admin", "hr_admin"];

// Load an image URL as a base64 data-URL (for embedding in jsPDF)
const imgCache = new Map<string, string>();
export async function loadImageBase64(url: string): Promise<string> {
  if (imgCache.has(url)) return imgCache.get(url)!;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const b64 = canvas.toDataURL("image/png");
      imgCache.set(url, b64);
      resolve(b64);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
