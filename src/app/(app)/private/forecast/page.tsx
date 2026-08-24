import { redirect } from "next/navigation";

/**
 * The forecast is now the default view of /private/upcoming — one screen answers both
 * "what is coming" and "what repeats". The old address keeps working for anything that
 * still points at it.
 */
export default function ForecastPage(): never {
  redirect("/private/upcoming");
}
