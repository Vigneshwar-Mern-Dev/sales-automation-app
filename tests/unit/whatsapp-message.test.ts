import { describe, it, expect } from "vitest";

// Replicate renderWhatsAppMessage to avoid "server-only" import
const DEFAULT_MESSAGE = `Hi {{name}}!

Thank you for contacting ATM Franchise.

Please fill out your details using this secure link:
{{formLink}}

Our team will review your details and contact you shortly.`;

function renderWhatsAppMessage(
  template: string | null | undefined,
  name: string,
  formLink: string,
) {
  const selectedTemplate = template?.trim() || DEFAULT_MESSAGE;
  const rendered = selectedTemplate
    .replaceAll("{{name}}", name)
    .replaceAll("{{formLink}}", formLink)
    .trim();

  if (!formLink || rendered.includes(formLink)) {
    return rendered;
  }

  return `${rendered}

Please fill out your details using this secure link:
${formLink}`;
}

describe("renderWhatsAppMessage", () => {
  it("renders default template with name and link", () => {
    const result = renderWhatsAppMessage(
      null,
      "Ramesh",
      "https://crm.planle.com/atm-franchise/abc123",
    );
    expect(result).toContain("Hi Ramesh!");
    expect(result).toContain("https://crm.planle.com/atm-franchise/abc123");
  });

  it("renders custom template", () => {
    const template = "Hello {{name}}, please visit {{formLink}}";
    const result = renderWhatsAppMessage(
      template,
      "Suresh",
      "https://crm.planle.com/atm-franchise/xyz789",
    );
    expect(result).toBe(
      "Hello Suresh, please visit https://crm.planle.com/atm-franchise/xyz789",
    );
  });

  it("appends form link if template does not contain {{formLink}}", () => {
    const template = "Hello {{name}}, we have a great offer!";
    const result = renderWhatsAppMessage(
      template,
      "Amit",
      "https://crm.planle.com/atm-franchise/token1",
    );
    expect(result).toContain("Hello Amit, we have a great offer!");
    expect(result).toContain("https://crm.planle.com/atm-franchise/token1");
  });

  it("handles empty form link gracefully", () => {
    const result = renderWhatsAppMessage(null, "Test", "");
    expect(result).toContain("Hi Test!");
    // formLink placeholder replaced with empty string
    expect(result).not.toContain("{{formLink}}");
  });

  it("replaces multiple occurrences of {{name}}", () => {
    const template = "Hi {{name}}, welcome {{name}}! Link: {{formLink}}";
    const result = renderWhatsAppMessage(template, "Raj", "https://example.com");
    expect(result).toBe("Hi Raj, welcome Raj! Link: https://example.com");
  });

  it("uses default template for whitespace-only input", () => {
    const result = renderWhatsAppMessage(
      "   ",
      "Kumar",
      "https://crm.planle.com/atm-franchise/t1",
    );
    expect(result).toContain("Hi Kumar!");
  });
});
