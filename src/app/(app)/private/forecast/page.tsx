import { getForecast } from "@/lib/data/money";
import { ForecastView } from "@/components/private/ForecastView";

export default async function ForecastPage() {
  const forecast = await getForecast([30, 60, 90]);
  return <ForecastView forecast={forecast} />;
}
