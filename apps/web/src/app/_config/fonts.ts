import { Fira_Code, Geologica } from "next/font/google";

/**
 * @description Geologica font
 * @returns {Geologica} Geologica font
 */
export const geologica = Geologica({
  subsets: ["latin"],
  variable: "--font-geologica",
});

/**
 * @description Fira Code font
 * @returns {Fira_Code} Fira Code font
 */
export const firacode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-firacode",
});
