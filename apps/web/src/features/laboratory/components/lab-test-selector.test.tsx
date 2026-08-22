import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LabTestSelector } from "./lab-test-selector";

describe("LabTestSelector", () => {
  const categories = [
    {
      id: "blood",
      name: "Haematology",
      active: true,
      tests: [
        { id: "cbc", code: "CBC", name: "Complete blood count", active: true },
        { id: "old", name: "Retired test", active: false },
      ],
    },
  ];
  it("groups active tests, searches them, and reports selections", () => {
    const onChange = vi.fn();
    render(<LabTestSelector categories={categories} selected={[]} onChange={onChange} />);
    expect(screen.getByText("Haematology")).toBeInTheDocument();
    expect(screen.queryByText("Retired test")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Complete blood count/));
    expect(onChange).toHaveBeenCalledWith(["cbc"]);
    fireEvent.change(screen.getByPlaceholderText(/Search test/), { target: { value: "unknown" } });
    expect(screen.getByText(/No active laboratory test/)).toBeInTheDocument();
  });
});
