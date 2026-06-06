import { expect, test } from "@playwright/test";

test("unit color swatches expose checked, unavailable, opposing, and keyboard states", async ({
  page
}) => {
  await page.goto("/ui-harness.html?scene=options&embed=1");

  const playerPurple = page.getByRole("radio", { name: "Player Units: Purple" });
  const playerBlue = page.getByRole("radio", { name: "Player Units: Blue" });
  const playerGreen = page.getByRole("radio", {
    name: "Player Units: Green (coming soon)"
  });
  const enemyPurple = page.getByRole("radio", { name: "Enemy Units: Purple" });
  const enemyBlue = page.getByRole("radio", { name: "Enemy Units: Blue" });

  await expect(playerPurple).toBeChecked();
  await expect(enemyBlue).toBeChecked();
  await expect(playerBlue).toBeDisabled();
  await expect(playerGreen).toBeDisabled();
  await expect(enemyPurple).toBeDisabled();

  await playerPurple.focus();
  await expect(playerPurple).toBeFocused();
  await playerPurple.press("Space");
  await expect(playerPurple).toBeChecked();
});
