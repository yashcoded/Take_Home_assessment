import { test, expect } from "@playwright/test";
import { agents, detectTransferIntent } from "../lib/agents";

test.describe("agents config", () => {
  test("Bob and Alice are defined with correct ids and names", () => {
    expect(agents.bob.id).toBe("bob");
    expect(agents.bob.name).toBe("Bob");
    expect(agents.alice.id).toBe("alice");
    expect(agents.alice.name).toBe("Alice");
  });

  test("each agent has a system prompt", () => {
    expect(agents.bob.systemPrompt.length).toBeGreaterThan(0);
    expect(agents.alice.systemPrompt.length).toBeGreaterThan(0);
  });

  test("Bob is blue and Alice is purple", () => {
    expect(agents.bob.color).toBe("blue");
    expect(agents.alice.color).toBe("purple");
  });
});

test.describe("detectTransferIntent", () => {
  test("recognizes 'Transfer me to Alice' when Bob is active", () => {
    expect(detectTransferIntent("Transfer me to Alice", "bob")).toBe("alice");
  });

  test("recognizes 'Go back to Bob' when Alice is active", () => {
    expect(detectTransferIntent("Go back to Bob", "alice")).toBe("bob");
  });

  test("recognizes 'Let me talk to Alice' when Bob is active", () => {
    expect(detectTransferIntent("Let me talk to Alice", "bob")).toBe("alice");
  });

  test("recognizes 'Get Alice' when Bob is active", () => {
    expect(detectTransferIntent("Get Alice", "bob")).toBe("alice");
  });

  test("recognizes 'Switch me to Bob' when Alice is active", () => {
    expect(detectTransferIntent("Switch me to Bob", "alice")).toBe("bob");
  });

  test("recognizes 'Speak with Bob please' when Alice is active", () => {
    expect(detectTransferIntent("Speak with Bob please", "alice")).toBe("bob");
  });

  test("returns null when no transfer intent (Bob active)", () => {
    expect(detectTransferIntent("Hi Bob, I want to remodel my kitchen", "bob")).toBeNull();
  });

  test("returns null when no transfer intent (Alice active)", () => {
    expect(detectTransferIntent("What about permits for the wall?", "alice")).toBeNull();
  });

  test("returns null when asking to transfer to current agent (Bob to Bob)", () => {
    expect(detectTransferIntent("Transfer me to Bob", "bob")).toBeNull();
  });

  test("returns null when asking to transfer to current agent (Alice to Alice)", () => {
    expect(detectTransferIntent("I want to talk to Alice", "alice")).toBeNull();
  });

  test("is case-insensitive", () => {
    expect(detectTransferIntent("TRANSFER ME TO ALICE", "bob")).toBe("alice");
    expect(detectTransferIntent("go back to BOB", "alice")).toBe("bob");
  });
});
