import { test, expect } from "@playwright/test";

// Minimal valid MP3 frame (silence) so Audio playback doesn't error
const MINIMAL_MP3 = new Uint8Array([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const E2E_URL = "/?e2e=1";

function fillAndSend(page: import("@playwright/test").Page, text: string) {
  return page.getByTestId("e2e-text-input").fill(text).then(() => page.getByTestId("e2e-send-button").click());
}

test("initial load shows Bob as active agent and ready status", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("active-agent-name")).toHaveText("Bob");
  await expect(page.getByTestId("status")).toHaveText("Press and hold to speak");
  await expect(page.getByRole("heading", { name: /Home Renovation Assistant/i })).toBeVisible();
});

test("sending a voice message to Bob shows user and Bob in transcript", async ({
  page,
}) => {
  const userText = "Hi Bob, I want to remodel my kitchen. Budget is around $25k.";
  const bobReply = "Great! A few questions: is the wall load-bearing, and what's your timeline?";

  await page.route("**/api/chat", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: bobReply }),
      });
    } else {
      route.continue();
    }
  });
  await page.route("**/api/tts", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        body: MINIMAL_MP3.buffer,
        headers: { "Content-Type": "audio/mpeg" },
      });
    } else {
      route.continue();
    }
  });

  await page.goto(E2E_URL);
  await fillAndSend(page, userText);

  await expect(page.getByTestId("transcript-area")).toContainText(userText, { timeout: 5000 });
  await expect(page.getByTestId("transcript-area")).toContainText(bobReply, { timeout: 15000 });
  await expect(page.getByTestId("active-agent-name")).toHaveText("Bob");
});

test("transfer to Alice updates active agent and shows handoff in transcript", async ({
  page,
}) => {
  await page.route("**/api/tts", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        body: MINIMAL_MP3.buffer,
        headers: { "Content-Type": "audio/mpeg" },
      });
    } else {
      route.continue();
    }
  });

  await page.goto(E2E_URL);
  await fillAndSend(page, "Transfer me to Alice.");

  await expect(page.getByTestId("active-agent-name")).toHaveText("Alice", { timeout: 15000 });
  await expect(page.getByTestId("transcript-area")).toContainText("I'm Alice", { timeout: 10000 });
  await expect(page.getByTestId("transcript-area")).toContainText("Transfer me to Alice", {
    timeout: 5000,
  });
});

test("transfer back to Bob updates active agent and shows handoff", async ({ page }) => {
  await page.route("**/api/tts", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        body: MINIMAL_MP3.buffer,
        headers: { "Content-Type": "audio/mpeg" },
      });
    } else {
      route.continue();
    }
  });

  await page.goto(E2E_URL);
  await fillAndSend(page, "Transfer me to Alice.");
  await expect(page.getByTestId("active-agent-name")).toHaveText("Alice", { timeout: 15000 });
  await expect(page.getByTestId("status")).toHaveText("Press and hold to speak", { timeout: 25000 });

  await fillAndSend(page, "Go back to Bob.");
  await expect(page.getByTestId("active-agent-name")).toHaveText("Bob", { timeout: 15000 });
  await expect(page.getByTestId("transcript-area")).toContainText("Hey, I'm Bob", { timeout: 10000 });
});

test("full flow: message to Bob then transfer to Alice then back to Bob", async ({ page }) => {
  await page.route("**/api/chat", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Sounds good! I'd suggest getting a structural check before opening that wall.",
        }),
      });
    } else {
      route.continue();
    }
  });
  await page.route("**/api/tts", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        body: MINIMAL_MP3.buffer,
        headers: { "Content-Type": "audio/mpeg" },
      });
    } else {
      route.continue();
    }
  });

  await page.goto(E2E_URL);

  // 1) Say something to Bob
  await fillAndSend(page, "Hi Bob, I want to remodel my kitchen. Budget is around $25k.");
  await expect(page.getByTestId("transcript-area")).toContainText("remodel my kitchen", {
    timeout: 10000,
  });
  await expect(page.getByTestId("active-agent-name")).toHaveText("Bob");
  await expect(page.getByTestId("status")).toHaveText("Press and hold to speak", { timeout: 25000 });

  // 2) Transfer to Alice
  await fillAndSend(page, "Transfer me to Alice.");
  await expect(page.getByTestId("active-agent-name")).toHaveText("Alice", { timeout: 15000 });
  await expect(page.getByTestId("transcript-area")).toContainText("I'm Alice", { timeout: 10000 });
  await expect(page.getByTestId("status")).toHaveText("Press and hold to speak", { timeout: 25000 });

  // 3) Transfer back to Bob
  await fillAndSend(page, "Go back to Bob.");
  await expect(page.getByTestId("active-agent-name")).toHaveText("Bob", { timeout: 15000 });
  await expect(page.getByTestId("transcript-area")).toContainText("Hey, I'm Bob", { timeout: 10000 });
});
