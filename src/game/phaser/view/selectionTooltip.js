export function buildForecastTooltipLabel(forecast) {
  if (!forecast) {
    return "";
  }

  const dealtLabel = `${forecast.dealt.min}-${forecast.dealt.max}`;
  const counterLabel = forecast.received ? `${forecast.received.min}-${forecast.received.max}` : "0";
  const nameLine = forecast.targetName ? `${forecast.targetName}\n` : "";

  return `${nameLine}Damage ${dealtLabel}\nCounter ${counterLabel}`;
}
