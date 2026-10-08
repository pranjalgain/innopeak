import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AvailableLocation } from "@/app/_libs/services/connection.service";

import messages from "../../../../../../../messages/en.json";
import { ConfirmLocationStage } from "../confirm-location-stage";

const DOWNTOWN: AvailableLocation = {
  externalLocationId: "locations/1",
  name: "Downtown Store",
  address: "1 Main St",
  alreadyConnected: false,
};
const UPTOWN: AvailableLocation = {
  externalLocationId: "locations/2",
  name: "Uptown Store",
  address: "2 Main St",
  alreadyConnected: false,
};

function renderStage(
  overrides: Partial<ComponentProps<typeof ConfirmLocationStage>> = {},
) {
  const onToggle = vi.fn();
  const onContinue = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConfirmLocationStage
        locations={[DOWNTOWN, UPTOWN]}
        selectedLocationIds={[DOWNTOWN.externalLocationId, UPTOWN.externalLocationId]}
        onToggle={onToggle}
        onContinue={onContinue}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onToggle, onContinue };
}

describe("ConfirmLocationStage", () => {
  test("renders a single location as a plain confirmation card, no checkbox", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConfirmLocationStage
          locations={[DOWNTOWN]}
          selectedLocationIds={[DOWNTOWN.externalLocationId]}
          onToggle={vi.fn()}
          onContinue={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Downtown Store")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("renders one checkbox per location, checked according to the current selection", () => {
    renderStage({ selectedLocationIds: [DOWNTOWN.externalLocationId] });

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  test("clicking a location's checkbox reports that location's id to onToggle", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderStage({ selectedLocationIds: [DOWNTOWN.externalLocationId] });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]!);

    expect(onToggle).toHaveBeenCalledWith(UPTOWN.externalLocationId);
  });

  describe("when the plan has room for one location", () => {
    test("renders radio buttons instead of checkboxes, with the current choice selected", () => {
      renderStage({ isSingleSelect: true, selectedLocationIds: [DOWNTOWN.externalLocationId] });

      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(2);
      expect(radios[0]).toBeChecked();
      expect(radios[1]).not.toBeChecked();
      expect(
        screen.getByText("Your plan includes 1 location. Choose the one you'd like InnoPeak to manage."),
      ).toBeInTheDocument();
    });

    test("names the radio group after the stage's heading", () => {
      renderStage({ isSingleSelect: true, selectedLocationIds: [DOWNTOWN.externalLocationId] });

      expect(screen.getByRole("radiogroup", { name: "We found your business" })).toBeInTheDocument();
    });

    test("choosing another location reports its id", async () => {
      const user = userEvent.setup();
      const { onToggle } = renderStage({
        isSingleSelect: true,
        selectedLocationIds: [DOWNTOWN.externalLocationId],
      });

      await user.click(screen.getAllByRole("radio")[1]!);

      expect(onToggle).toHaveBeenCalledWith(UPTOWN.externalLocationId);
    });

    test("labels the button for one location, never a count", () => {
      renderStage({ isSingleSelect: true, selectedLocationIds: [DOWNTOWN.externalLocationId] });

      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    });

    test("a lone location is still the plain confirmation card", () => {
      renderStage({
        isSingleSelect: true,
        locations: [DOWNTOWN],
        selectedLocationIds: [DOWNTOWN.externalLocationId],
      });

      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    });
  });

  test("continue is disabled once every location is deselected", () => {
    renderStage({ selectedLocationIds: [] });

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  test("continue is enabled while at least one location is selected, and submits the current selection", async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStage({ selectedLocationIds: [DOWNTOWN.externalLocationId] });

    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("the button's label counts the selection once more than one location is chosen", () => {
    renderStage({ selectedLocationIds: [DOWNTOWN.externalLocationId, UPTOWN.externalLocationId] });

    expect(screen.getByRole("button", { name: "Continue with 2 locations" })).toBeInTheDocument();
  });

  test("disables continue while submitting, even with a valid selection", () => {
    renderStage({
      selectedLocationIds: [DOWNTOWN.externalLocationId],
      isSubmitting: true,
    });

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
