const DEFAULT_MESSAGE = `Hi {{name}}!

Thank you for contacting ATM Franchise.

Please fill out your details using this secure link:
{{formLink}}

Our team will review your details and contact you shortly.`;

export function renderWhatsAppMessage(
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
