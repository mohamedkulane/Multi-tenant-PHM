import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClinicalNavigation } from "./clinical-navigation";

describe("ClinicalNavigation", () => {
  it("gives the Doctor a dedicated Lab Results section", () => {
    const onChange = vi.fn();
    render(<ClinicalNavigation value="overview" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Lab Results" }));

    expect(onChange).toHaveBeenCalledWith("results");
  });
});
