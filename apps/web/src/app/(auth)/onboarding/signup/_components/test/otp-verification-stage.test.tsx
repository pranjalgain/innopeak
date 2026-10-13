import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../../messages/en.json";
import { OtpVerificationStage } from "../otp-verification-stage";

function setup(onVerify: (code: string) => boolean | Promise<boolean | void> | void) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OtpVerificationStage
        email="owner@example.test"
        isLoading={false}
        onVerify={onVerify}
        onResend={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return Array.from(
    { length: 6 },
    (_, i) => document.getElementById(`otp-digit-${i}`) as HTMLInputElement,
  );
}

function typeCode(boxes: HTMLInputElement[], code: string) {
  [...code].forEach((digit, i) => fireEvent.change(boxes[i]!, { target: { value: digit } }));
}

describe("OtpVerificationStage", () => {
  test("clears the boxes and refocuses the first one when the code is rejected", async () => {
    const onVerify = vi.fn().mockResolvedValue(false);
    const boxes = setup(onVerify);
    typeCode(boxes, "111111");

    fireEvent.click(
      screen.getByRole("button", { name: messages.onboardingSignup.otp.verifyButton }),
    );

    await waitFor(() => expect(boxes.map((box) => box.value)).toEqual(["", "", "", "", "", ""]));
    expect(onVerify).toHaveBeenCalledWith("111111");
    expect(document.activeElement).toBe(boxes[0]);
  });

  test("leaves the digits alone when the code is accepted", async () => {
    const onVerify = vi.fn().mockResolvedValue(true);
    const boxes = setup(onVerify);
    typeCode(boxes, "123456");

    fireEvent.click(
      screen.getByRole("button", { name: messages.onboardingSignup.otp.verifyButton }),
    );

    await waitFor(() => expect(onVerify).toHaveBeenCalledWith("123456"));
    expect(boxes.map((box) => box.value).join("")).toBe("123456");
  });

  test("selects a filled box on focus so the next digit replaces it", () => {
    const boxes = setup(vi.fn());
    typeCode(boxes, "9");
    const select = vi.spyOn(boxes[0]!, "select");

    fireEvent.focus(boxes[0]!);

    expect(select).toHaveBeenCalled();
  });
});
