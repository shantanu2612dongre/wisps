import { loadEnvConfig } from '@next/env';
import path from 'path';

loadEnvConfig(path.resolve(__dirname, '../'));

async function setupContactCard() {
  const apiKey = process.env.LINQ_API_KEY;
  const endpoint = process.env.LINQ_API_URL || "https://api.linq.app/v1/messages";
  const phoneNumber = process.env.LINQ_PHONE_NUMBER;
  const logoUrl = process.env.WISPS_LOGO_URL || "https://wisps.in/wisps-logo.png";

  if (!apiKey || !phoneNumber) {
    console.error("Missing LINQ_API_KEY or LINQ_PHONE_NUMBER in environment");
    process.exit(1);
  }

  // Use the partner v3 endpoint
  const baseUrl = endpoint.replace(/\/$/, '').replace('/v1/messages', '');
  const url = `${baseUrl}/api/partner/v3/contact_card`;

  console.log(`Setting up Linq Contact Card for ${phoneNumber}...`);
  console.log(`Using Logo URL: ${logoUrl}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        phone_number: phoneNumber,
        first_name: "Wisps",
        image_url: logoUrl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to configure contact card. Status: ${response.status}`);
      console.error(errorText);
      process.exit(1);
    }

    const data = await response.json();
    console.log("Contact Card successfully configured on Linq!");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error setting up contact card:", error);
    process.exit(1);
  }
}

setupContactCard();
