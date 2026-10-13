import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ConfirmActionButton, ConfirmActionDialog } from "../confirm-action-dialog";

function setup(onConfirm: () => void) {
  render(
    <ConfirmActionButton
      trigger={<button type="button">Open</button>}
      title="Suspend Acme?"
      description="They lose access."
      confirmLabel="Suspend"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
}

describe("ConfirmActionDialog", () => {
  // Regression: a double-click on Suspend sent the request twice (the dialog stays mounted through its exit animation).
  test("a double-click confirms once", () => {
    const onConfirm = vi.fn();
    // Held open: a browser keeps the closing dialog's button in the DOM through its exit animation, jsdom would not.
    render(
      <ConfirmActionDialog
        open
        onOpenChange={() => undefined}
        title="Suspend Acme?"
        description="They lose access."
        confirmLabel="Suspend"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Suspend" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("reopening the dialog allows a fresh confirmation", async () => {
    const onConfirm = vi.fn();
    setup(onConfirm);

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));

    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
