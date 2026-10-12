interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MS Graph credentials not configured (MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET)");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain MS Graph token: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const senderEmail = process.env.MS_GRAPH_SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error("MS_GRAPH_SENDER_EMAIL not configured");
  }

  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS Graph sendMail failed: ${res.status} ${text}`);
  }
}
