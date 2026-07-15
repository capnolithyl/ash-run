import { expect, test } from "@playwright/test";

test("installed unit color swatches are selectable while opposing colors stay disabled", async ({
  page
}) => {
  await page.goto("/ui-harness.html?scene=options&embed=1");
  await page.locator("#options-panel-gameplay").evaluate((panel) => {
    panel.hidden = false;
  });

  const playerPurple = page.getByRole("radio", { name: "Player Units: Purple" });
  const playerBlue = page.getByRole("radio", { name: "Player Units: Blue" });
  const playerGreen = page.getByRole("radio", { name: "Player Units: Green" });
  const playerOrange = page.getByRole("radio", { name: "Player Units: Orange" });
  const enemyPurple = page.getByRole("radio", { name: "Enemy Units: Purple" });
  const enemyBlue = page.getByRole("radio", { name: "Enemy Units: Blue" });

  await expect(playerPurple).toBeChecked();
  await expect(enemyBlue).toBeChecked();
  await expect(playerBlue).toBeDisabled();
  await expect(playerGreen).toBeEnabled();
  await expect(playerOrange).toBeEnabled();
  await expect(enemyPurple).toBeDisabled();

  const dividerWidths = await page.evaluate(() => ({
    unitColors: getComputedStyle(document.querySelector(".options-section--unit-colors")).borderBottomWidth,
    firstToggle: getComputedStyle(document.querySelector("#options-panel-gameplay > .option-row")).borderTopWidth
  }));
  expect(dividerWidths).toEqual({ unitColors: "0px", firstToggle: "1px" });

  await playerGreen.focus();
  await expect(playerGreen).toBeFocused();
  await playerGreen.press("Space");
  await expect(playerGreen).toBeChecked();
});
