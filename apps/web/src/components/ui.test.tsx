import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SimpleTable } from "./ui";

describe("SimpleTable pagination", () => {
  it("shows ten rows per page with entry counts and numbered navigation", () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({
      id: String(index + 1),
      name: `Product ${index + 1}`,
    }));

    render(
      <SimpleTable
        rows={rows}
        columns={[{ label: "Product", render: (row) => String(row["name"]) }]}
      />,
    );

    expect(screen.getByText("Showing 1 to 10 of 23 entries")).toBeInTheDocument();
    expect(screen.getByText("Product 1")).toBeInTheDocument();
    expect(screen.queryByText("Product 11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByText("Showing 11 to 20 of 23 entries")).toBeInTheDocument();
    expect(screen.getByText("Product 11")).toBeInTheDocument();
    expect(screen.queryByText("Product 1")).not.toBeInTheDocument();
  });
});
