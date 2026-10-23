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

  // An OS or password-manager autofill drops the whole code into whichever box has focus; a one-character cap used to keep only its first digit.
  test("spreads an autofilled full code across the boxes", () => {
    const boxes = setup(vi.fn());

    fireEvent.change(boxes[0]!, { target: { value: "482915" } });

    expect(boxes.map((box) => box.value)).toEqual(["4", "8", "2", "9", "1", "5"]);
  });

  test("still keeps only the newest digit when typing over a filled box", () => {
    const boxes = setup(vi.fn());
    typeCode(boxes, "1");

    fireEvent.change(boxes[0]!, { target: { value: "17" } });

    expect(boxes[0]!.value).toBe("7");
  });

  test("names each box and announces a wrong-length code", () => {
    const boxes = setup(vi.fn());

    expect(boxes[2]).toHaveAccessibleName(`${messages.onboardingSignup.otp.codeLabel} 3 / 6`);

    fireEvent.click(
      screen.getByRole("button", { name: messages.onboardingSignup.otp.verifyButton }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messages.onboardingSignup.otp.incompleteCode);
  });
});
