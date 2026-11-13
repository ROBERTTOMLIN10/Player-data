// Vite turns "file.ttf?inline" into a base64 data URL string.
declare module "*.ttf?inline" {
  const dataUrl: string;
  export default dataUrl;
}
