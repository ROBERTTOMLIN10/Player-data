// The site's fonts for the player report PDF (loaded only when a PDF is made).
import interRegular from "../assets/fonts/Inter-Regular.ttf?inline";
import interBold from "../assets/fonts/Inter-Bold.ttf?inline";
import groteskBold from "../assets/fonts/SpaceGrotesk-Bold.ttf?inline";

/** Base64 font files, keyed by the name the PDF registers them under. */
export const PDF_FONTS = {
  "Inter-Regular.ttf": interRegular,
  "Inter-Bold.ttf": interBold,
  "SpaceGrotesk-Bold.ttf": groteskBold,
};
