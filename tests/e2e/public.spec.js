import { expect, test } from "@playwright/test";

const publicPages = [
  ["./", "Your semester, finally clear."],
  ["signup.html", "Start your journey"],
  ["login.html", "Continue tracking"],
];

for (const [path, heading] of publicPages) {
  test(`${path} renders without browser errors`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const contentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(contentWidth).toBeLessThanOrEqual(viewportWidth + 1);
    expect(errors).toEqual([]);
  });
}

test("landing navigation reaches signup and login", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Start tracking" }).click();
  await expect(page).toHaveURL(/signup\.html$/);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/login\.html$/);
});

test("signup validates password mismatch without a network request", async ({ page }) => {
  await page.goto("signup.html");
  await page.getByLabel("Full name").fill("Test Student");
  await page.getByLabel("Email").fill("student@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password-one");
  await page.getByLabel("Confirm password").fill("password-two");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
});

test("invalid login reports a friendly authentication failure", async ({ page }) => {
  await page.goto("login.html");
  await page.getByLabel("Email").fill(`missing-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#form-message")).toBeVisible();
  await expect(page.locator("#form-message")).not.toContainText("non-2xx");
});

test("login exposes a loading state while authentication is pending", async ({ page }) => {
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Invalid login credentials" }) });
  });
  await page.goto("login.html");
  await page.getByLabel("Email").fill("loading-state@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

for (const path of ["dashboard.html", "courses.html", "course.html", "attendance.html", "checkin.html", "insights.html", "assistant.html", "settings.html", "semesters.html", "onboarding.html", "semester-review.html"]) {
  test(`${path} redirects anonymous visitors`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    await expect(page).toHaveURL(/login\.html$/);
    expect(errors).toEqual([]);
  });
}
