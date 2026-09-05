import { afterEach, describe, expect, test } from "vitest";

import { GoogleConnectionService } from "./google-connection.service";

describe("GoogleConnectionService", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  test("defaults to disconnected when nothing is stored", async () => {
    expect(await GoogleConnectionService.getStatus()).toBe("disconnected");
  });

  test("persists a status across calls", async () => {
    await GoogleConnectionService.setStatus("connected");
    expect(await GoogleConnectionService.getStatus()).toBe("connected");
  });

  test("can be set back to disconnected", async () => {
    await GoogleConnectionService.setStatus("connected");
    await GoogleConnectionService.setStatus("disconnected");
    expect(await GoogleConnectionService.getStatus()).toBe("disconnected");
  });
});
